#!/usr/bin/env node
// 旧グループ暗号データの残量計測スクリプト（読み取り専用・DEK移行 Phase iii の進捗監視用）。
// DEK化済みプロジェクトの data サブコレクションを走査し、cryptoScheme 印の無いdocを集計する。
// encdata は取得しない（フィールドマスク）ため転送量は小さく、暗号化ペイロードには一切触れない。
// IAM認証(gcloudトークン)で Firestore REST API を叩くため Security Rules の制約を受けない。
//
// 使い方: TOKEN=$(gcloud auth print-access-token) node scripts/count-legacy-crypto-data.js
//
// 指標:
// - PRIVATE/PUBLIC の印なし = 旧グループ暗号の可能性がある残量（パートAの自己移行で減っていく）
// - パートB(Virgilグループ撤去)のGO判定 = 「PRIVATE/PUBLIC印なしゼロのdekプロジェクト」が全dekプロジェクトに達すること
// - COMMON/TEMPLATE の印なしは「印付与開始前のDEK書き込み」(実体はDEK)を含むため参考値

const PROJECT = 'ecorismap';
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('TOKEN環境変数が必要です: TOKEN=$(gcloud auth print-access-token) node scripts/count-legacy-crypto-data.js');
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

const str = (fields, name) => fields?.[name]?.stringValue;

(async () => {
  const projects = (await fetchCollection('projects', ['ownerUid', 'cryptoScheme', 'archived'])).map((d) => ({
    id: d.name.split('/').pop(),
    ownerUid: str(d.fields, 'ownerUid') ?? '(なし)',
    scheme: str(d.fields, 'cryptoScheme') ?? 'group',
    archived: d.fields?.archived?.booleanValue ?? false,
  }));
  const dekProjects = projects.filter((p) => p.scheme === 'dek');
  console.log(`プロジェクト総数: ${projects.length} / dek方式: ${dekProjects.length} / group方式(Phase ii未移行): ${projects.length - dekProjects.length}`);
  console.log('');

  const results = [];
  for (const p of dekProjects) {
    const docs = await fetchCollection(`projects/${p.id}/data`, ['userId', 'layerId', 'permission', 'cryptoScheme']);
    const stats = {
      PRIVATE: { total: 0, unmarked: 0, unmarkedGroups: new Set(), unmarkedUsers: new Set() },
      PUBLIC: { total: 0, unmarked: 0, unmarkedGroups: new Set(), unmarkedUsers: new Set() },
      OTHER: { total: 0, unmarked: 0, unmarkedGroups: new Set(), unmarkedUsers: new Set() }, // COMMON/TEMPLATE(参考値)
    };
    for (const d of docs) {
      const permission = str(d.fields, 'permission');
      const bucket = stats[permission] ?? stats.OTHER;
      bucket.total++;
      if (str(d.fields, 'cryptoScheme') !== 'dek') {
        bucket.unmarked++;
        bucket.unmarkedGroups.add(`${str(d.fields, 'userId')}_${str(d.fields, 'layerId')}_${permission}`);
        bucket.unmarkedUsers.add(str(d.fields, 'userId'));
      }
    }
    results.push({ ...p, stats });
  }

  const legacy = (r) => r.stats.PRIVATE.unmarked + r.stats.PUBLIC.unmarked;
  const doneCount = results.filter((r) => legacy(r) === 0).length;
  console.log(`パートB GO判定: PRIVATE/PUBLIC印なしゼロのdekプロジェクト ${doneCount}/${dekProjects.length}`);
  console.log('');
  console.log('残量のあるプロジェクト（PRIVATE/PUBLIC印なしdoc数の多い順）:');
  console.log('PRIV印なし | PUB印なし | 残ユーザー数 | (参考:C/T印なし) | プロジェクトID');
  for (const r of results.filter((v) => legacy(v) > 0).sort((a, b) => legacy(b) - legacy(a))) {
    const users = new Set([...r.stats.PRIVATE.unmarkedUsers, ...r.stats.PUBLIC.unmarkedUsers]);
    console.log(
      `${String(r.stats.PRIVATE.unmarked).padStart(10)} | ${String(r.stats.PUBLIC.unmarked).padStart(9)} | ${String(users.size).padStart(12)} | ${String(r.stats.OTHER.unmarked).padStart(16)} | ${r.id}${r.archived ? '  [archived]' : ''}`
    );
  }
  if (results.every((r) => legacy(r) === 0)) {
    console.log('  (なし: 全dekプロジェクトでPRIVATE/PUBLICの印付けが完了しています)');
  }
})().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
