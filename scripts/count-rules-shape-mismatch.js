#!/usr/bin/env node
// 2026-11 Security Rules 強化（fix/rules-permission-matrix）のデプロイ前チェック（読み取り専用）。
// 新ルールの型・整合条件を満たさない既存ドキュメントを数える。該当docは新ルール下で「その場の update」が
// 拒否される可能性がある（read/delete は影響なし）。暗号文(encdata/encDek)はフィールドマスクで取得しない。
// IAM認証(gcloudトークン)で Firestore REST API を叩くため Security Rules の制約を受けない。
//
// 使い方: TOKEN=$(gcloud auth print-access-token) node scripts/count-rules-shape-mismatch.js

const PROJECT = 'ecorismap';
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('TOKEN環境変数が必要です: TOKEN=$(gcloud auth print-access-token) node scripts/count-rules-shape-mismatch.js');
  process.exit(1);
}
const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json' };
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${ROOT}`;

// コレクショングループを __name__ 順のカーソルで全件走査する（runQuery はページトークンが無いため）
async function scanGroup(collectionId, fields) {
  const docs = [];
  let last = null;
  for (;;) {
    const structuredQuery = {
      from: [{ collectionId, allDescendants: true }],
      select: { fields: fields.map((f) => ({ fieldPath: f })) },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: 1000,
      ...(last ? { startAt: { values: [{ referenceValue: last }], before: false } } : {}),
    };
    const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ structuredQuery }) });
    if (!res.ok) throw new Error(`runQuery ${res.status} (${collectionId}): ${await res.text()}`);
    const batch = (await res.json()).filter((r) => r.document).map((r) => r.document);
    docs.push(...batch);
    if (batch.length < 1000) break;
    last = batch[batch.length - 1].name;
  }
  return docs;
}

// REST の Value から型名を得る
const typeOf = (v) => (v === undefined ? 'missing' : Object.keys(v)[0].replace('Value', ''));
const str = (v) => v?.stringValue;
const arr = (v) => (v?.arrayValue?.values ?? []).map((x) => x.stringValue);
const relPath = (name) => name.slice(ROOT.length + 1);
const depth = (name) => relPath(name).split('/').length;

const report = [];
const check = (label, docs, pred) => {
  const hit = docs.filter(pred);
  report.push({ label, count: hit.length, total: docs.length, samples: hit.slice(0, 5).map((d) => relPath(d.name)) });
};

(async () => {
  // projects（トップレベルのみ。collectionGroup は projects/*/... 配下の同名を拾わないよう深さで絞る）
  const projects = (await scanGroup('projects', ['ownerUid', 'adminsUid', 'membersUid', 'cryptoScheme', 'dekPublicKey', 'archived'])).filter(
    (d) => depth(d.name) === 2
  );
  const pf = (d) => d.fields ?? {};
  check('projects: membersUid が配列でない', projects, (d) => typeOf(pf(d).membersUid) !== 'array');
  check('projects: adminsUid が配列でない', projects, (d) => typeOf(pf(d).adminsUid) !== 'array');
  check('projects: archived が真偽値以外（未設定は可）', projects, (d) => !['missing', 'boolean'].includes(typeOf(pf(d).archived)));
  check('projects: cryptoScheme が dek 以外の値', projects, (d) => pf(d).cryptoScheme !== undefined && str(pf(d).cryptoScheme) !== 'dek');
  check(
    'projects: cryptoScheme=dek なのに dekPublicKey が非空文字列でない',
    projects,
    (d) => str(pf(d).cryptoScheme) === 'dek' && !(typeof str(pf(d).dekPublicKey) === 'string' && str(pf(d).dekPublicKey).length > 0)
  );
  check('projects: cryptoScheme 無しで dekPublicKey だけある', projects, (d) => pf(d).cryptoScheme === undefined && pf(d).dekPublicKey !== undefined);
  check('projects:（参考）オーナーが membersUid/adminsUid に入っていない', projects, (d) => {
    const o = str(pf(d).ownerUid);
    return !arr(pf(d).membersUid).includes(o) || !arr(pf(d).adminsUid).includes(o);
  });

  // settings（DEK移行は既存の editorUid を据え置いて書き戻すため、既存値が文字列である必要がある）
  const settings = (await scanGroup('settings', ['editorUid'])).filter((d) => depth(d.name) === 4);
  check('settings: editorUid が文字列でない', settings, (d) => typeOf(d.fields?.editorUid) !== 'string');
  check('settings:（参考）ID が default 以外', settings, (d) => !d.name.endsWith('/settings/default'));

  // publicKeys（update は resource.keyVersion+1 を要求。既存値が整数でないとローテーション不能）
  const pubs = (await scanGroup('publicKeys', ['publicKey', 'keyVersion'])).filter((d) => depth(d.name) === 2);
  check('publicKeys: keyVersion が整数でない', pubs, (d) => typeOf(d.fields?.keyVersion) !== 'integer');
  check('publicKeys: publicKey が非空文字列でない', pubs, (d) => !(str(d.fields?.publicKey)?.length > 0));
  const history = (await scanGroup('history', ['keyVersion'])).filter((d) => relPath(d.name).startsWith('publicKeys/') && depth(d.name) === 4);
  const currentVersion = new Map(pubs.map((d) => [relPath(d.name), d.fields?.keyVersion?.integerValue]));
  check('publicKeys/history: 現行 keyVersion と同じIDの history が既にある（次のローテーションが update 扱いで拒否）', history, (d) => {
    const parts = relPath(d.name).split('/');
    return currentVersion.get(`publicKeys/${parts[1]}`) === parts[3];
  });

  // data（暗号文以外のメタだけ。既存docは丸ごと作り直されるので参考値）
  const data = (await scanGroup('data', ['permission', 'chunkIndex', 'chunkCount', 'cryptoScheme', 'userId'])).filter((d) => depth(d.name) === 4);
  const df = (d) => d.fields ?? {};
  check('data:（参考）permission が4値以外', data, (d) => !['PRIVATE', 'PUBLIC', 'COMMON', 'TEMPLATE'].includes(str(df(d).permission)));
  check('data:（参考）cryptoScheme が dek 以外の値', data, (d) => df(d).cryptoScheme !== undefined && str(df(d).cryptoScheme) !== 'dek');
  check('data:（参考）chunkIndex/chunkCount が整数でない', data, (d) =>
    ['chunkIndex', 'chunkCount'].some((k) => df(d)[k] !== undefined && typeOf(df(d)[k]) !== 'integer')
  );
  check('data:（参考）userId が文字列でない', data, (d) => typeOf(df(d).userId) !== 'string');

  for (const r of report) {
    console.log(`${r.count === 0 ? 'OK ' : 'NG '} ${r.label}: ${r.count} / ${r.total}`);
    for (const s of r.samples) console.log(`      例: ${s}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
