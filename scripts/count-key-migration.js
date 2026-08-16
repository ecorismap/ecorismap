#!/usr/bin/env node
// 識別鍵の脱Virgil移行（P1: 台帳+KMSバックアップ）の進捗計測スクリプト（読み取り専用）。
// publicKeys(台帳=移行対象の母集団) と keyBackups(KMSバックアップ=移行完了のサーバー真実) を突き合わせる。
// 暗号化blob(encPrivateKey)やsaltは取得しない（フィールドマスク）。
// IAM認証(gcloudトークン)で Firestore REST API を叩くため Security Rules の制約を受けない。
//
// 使い方: TOKEN=$(gcloud auth print-access-token) node scripts/count-key-migration.js
//
// 指標:
// - 移行済み = keyBackups/{uid} が存在（サーバー真実。migration.ts の getKeyMigrationState と同じ判定）
// - 未移行 = 台帳(publicKeys)にはいる（シーディング済み）がKMSバックアップ未作成 → 次回ログイン時に移行フォームが出る
// - keyVersion不一致 = 鍵ローテーション後にバックアップが未更新（復元すると古い鍵に戻る要注意ユーザー）

const PROJECT = 'ecorismap';
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('TOKEN環境変数が必要です: TOKEN=$(gcloud auth print-access-token) node scripts/count-key-migration.js');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  'x-goog-user-project': PROJECT,
  'Content-Type': 'application/json',
};
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function fetchCollection(path, fieldPaths) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(`${BASE}/${path}`);
    url.searchParams.set('pageSize', '300');
    for (const f of fieldPaths) url.searchParams.append('mask.fieldPaths', f);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`Firestore API ${res.status} (${path}): ${await res.text()}`);
    const json = await res.json();
    docs.push(...(json.documents ?? []));
    pageToken = json.nextPageToken ?? '';
  } while (pageToken);
  return docs;
}

const intVal = (fields, name) => (fields?.[name]?.integerValue !== undefined ? Number(fields[name].integerValue) : undefined);
const tsVal = (fields, name) => fields?.[name]?.timestampValue;
const day = (iso) => (iso ? iso.slice(0, 10) : '(不明)');

// uid→email の解決（Identity Toolkit Admin API・ベストエフォート。権限が無ければuidのみ表示）
async function lookupEmails(uids) {
  const map = new Map();
  try {
    for (let i = 0; i < uids.length; i += 100) {
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ localId: uids.slice(i, i + 100) }),
      });
      if (!res.ok) throw new Error(`accounts:lookup ${res.status}`);
      const json = await res.json();
      for (const u of json.users ?? []) map.set(u.localId, u.email ?? '(emailなし)');
    }
  } catch (e) {
    console.log(`  (email解決はスキップ: ${e.message})`);
  }
  return map;
}

// Auth全ユーザー数（参考値・ベストエフォート）
async function countAuthUsers() {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ returnUserInfo: false }),
    });
    if (!res.ok) throw new Error(`accounts:query ${res.status}`);
    return Number((await res.json()).recordsCount);
  } catch (e) {
    return undefined;
  }
}

(async () => {
  const [ledgerDocs, backupDocs, authTotal] = await Promise.all([
    fetchCollection('publicKeys', ['keyVersion', 'createdAt', 'updatedAt']),
    fetchCollection('keyBackups', ['keyVersion', 'createdAt']),
    countAuthUsers(),
  ]);

  const ledger = new Map(
    ledgerDocs.map((d) => [d.name.split('/').pop(), { keyVersion: intVal(d.fields, 'keyVersion'), createdAt: tsVal(d.fields, 'createdAt') }])
  );
  const backups = new Map(
    backupDocs.map((d) => [d.name.split('/').pop(), { keyVersion: intVal(d.fields, 'keyVersion'), createdAt: tsVal(d.fields, 'createdAt') }])
  );

  const migrated = [...ledger.keys()].filter((uid) => backups.has(uid));
  const unmigrated = [...ledger.keys()].filter((uid) => !backups.has(uid));
  const orphanBackups = [...backups.keys()].filter((uid) => !ledger.has(uid));
  const versionMismatch = migrated.filter((uid) => backups.get(uid).keyVersion !== ledger.get(uid).keyVersion);

  console.log('=== 識別鍵の脱Virgil移行 進捗 ===');
  if (authTotal !== undefined) console.log(`Authユーザー総数(参考): ${authTotal}（うち暗号化未登録=台帳外: ${authTotal - ledger.size}）`);
  console.log(`台帳(publicKeys)登録: ${ledger.size}（移行対象の母集団）`);
  const pct = ledger.size === 0 ? 0 : Math.round((migrated.length / ledger.size) * 1000) / 10;
  console.log(`KMSバックアップ済み(移行完了): ${migrated.length} / ${ledger.size} (${pct}%)`);
  console.log(`未移行（次回ログインで移行フォーム）: ${unmigrated.length}`);
  if (orphanBackups.length > 0) console.log(`要確認: 台帳なしのバックアップ ${orphanBackups.length}件 → ${orphanBackups.join(', ')}`);
  if (versionMismatch.length > 0) {
    console.log(`要確認: keyVersion不一致（ローテ後バックアップ未更新） ${versionMismatch.length}件:`);
    for (const uid of versionMismatch) {
      console.log(`  ${uid}: 台帳v${ledger.get(uid).keyVersion} / バックアップv${backups.get(uid).keyVersion}`);
    }
  }

  // 移行完了の日別推移（keyBackups.createdAt。再作成では保持されるため初回移行日）
  const byDay = new Map();
  for (const uid of migrated) {
    const d = day(backups.get(uid).createdAt);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  console.log('');
  console.log('移行完了の日別件数:');
  for (const [d, n] of [...byDay.entries()].sort()) console.log(`  ${d}: ${n}`);

  if (unmigrated.length > 0) {
    console.log('');
    console.log('未移行ユーザー:');
    const emails = await lookupEmails(unmigrated);
    for (const uid of unmigrated) console.log(`  ${uid}  ${emails.get(uid) ?? ''}`);
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
