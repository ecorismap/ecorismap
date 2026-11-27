// ログインが要る範囲のネイティブのフロー（e2e/maestro/smoke-emu/）の前提データを、Firebaseエミュレータへ直接用意・検証する。
// scripts/e2e-native-emu.sh から呼ぶ。本番には一切つながない（宛先は localhost のエミュレータだけ）。
//
//   node emu-seed.mjs reset <データ側のプロジェクトID>          アカウントとデータを空にして、アカウント2つと共有プロジェクトを作る
//   node emu-seed.mjs member-add <データ側のプロジェクトID>     メンバーの記録を1件増やす（ほかのメンバーが送信した、の代わり）
//   node emu-seed.mjs check-upload <データ側のプロジェクトID>   オーナーが端末から送信した記録（cmt=smoke）がサーバーにあることを確かめる
//   node emu-seed.mjs check-login owner|member                  そのアカウントでエミュレータにログインした跡があることを確かめる
//
// プロジェクトIDが2つある理由:
// - アカウント（Auth）は、エミュレータの起動時のID（demo-ecorismap-e2e。Webのテストと同じ）に入る。
//   APIキーで来るログインを、Authエミュレータは起動時のIDのアカウントとして扱うため
// - データ（Firestore）は、ネイティブのSDKが GoogleService-Info.plist のプロジェクトIDで読み書きする。
//   エミュレータの中の同じ名前の入れ物で、実在のプロジェクトには届かない
// 暗号化はエミュレータ接続のとき切れている（FUNC_ENCRYPTION=false）。中身は JSON を deflate して base64 にしただけ（src/utils/Zip.ts の gzip）。
import zlib from 'zlib';

const AUTH_PROJECT = 'demo-ecorismap-e2e';
const AUTH = 'http://localhost:9099';
const FIRESTORE = 'http://localhost:8080';
const admin = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };

// アカウントは Web のテスト（e2e/web/support/emu.ts の USERS）と同じ値。エミュレータの中にだけ作る
const USERS = {
  owner: { email: 'owner@e2e.test', password: 'e2e-owner-pass', name: 'オーナー' },
  member: { email: 'member@e2e.test', password: 'e2e-member-pass', name: 'メンバー' },
};
const PROJECT_DOC = 'e2e-native-shared';
const PROJECT_NAME = 'E2E共有プロジェクト';
const LAYER_ID = 'e2e-shared-point';
const LAYER_NAME = 'E2E共有ポイント';

const pack = (data) => [zlib.deflateSync(Buffer.from(JSON.stringify(data))).toString('base64')];
const unpack = (encdata) => JSON.parse(zlib.inflateSync(Buffer.from(encdata[0], 'base64')).toString('utf-8'));

const toValue = (v) => {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
};
const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));
const fromValue = (v) => {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  return v;
};

const call = async (url, init) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${await res.text()}`);
  return res.json();
};
const docs = (project) => `${FIRESTORE}/v1/projects/${project}/databases/(default)/documents`;
const setDoc = (project, path, data) =>
  call(`${docs(project)}/${path}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ fields: toFields(data) }) });

const createUser = async (user) =>
  (
    await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${AUTH_PROJECT}/accounts`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ email: user.email, password: user.password, displayName: user.name, emailVerified: true }),
    })
  ).localId;
const lookup = async (email) =>
  (
    await call(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${AUTH_PROJECT}/accounts:lookup`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ email: [email] }),
    })
  ).users?.[0];

// 秒の端数を持たない時刻にする（設定の updatedAt は、平文の encryptedAt と同じ値でなければならない。firestore.ts の buildProjectSettingsFS）
const wholeSecond = () => new Date(Math.floor(Date.now() / 1000) * 1000);

const memberRecord = (uid, n) => ({
  id: `e2e-member-record-${n}`,
  userId: uid,
  displayName: USERS.member.name,
  visible: true,
  redraw: false,
  coords: { latitude: 35 + n * 0.001, longitude: 135 + n * 0.001 },
  field: { name: n, time: '', cmt: `member-${n}`, photo: [] },
  updatedAt: Date.now(),
});

/** メンバー名義の、共有レイヤの記録を count 件にする（送信1回分＝1文書。前の文書は置き換える） */
const putMemberData = async (dataProject, count) => {
  const uid = (await lookup(USERS.member.email)).localId;
  const records = Array.from({ length: count }, (_, i) => memberRecord(uid, i + 1));
  await setDoc(dataProject, `projects/${PROJECT_DOC}/data/e2e-member-data`, {
    userId: uid,
    layerId: LAYER_ID,
    permission: 'PUBLIC',
    encdata: pack({ data: records }),
    encryptedAt: new Date(),
    chunkIndex: 0,
    chunkCount: 1,
  });
};

const reset = async (dataProject) => {
  await fetch(`${AUTH}/emulator/v1/projects/${AUTH_PROJECT}/accounts`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error(`アカウントを空にできません: ${r.status}`);
  });
  for (const p of new Set([AUTH_PROJECT, dataProject])) {
    const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${p}/databases/(default)/documents`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`データを空にできません: ${p} ${r.status}`);
  }
  const owner = await createUser(USERS.owner);
  const member = await createUser(USERS.member);

  // 共有プロジェクト（オーナー＋メンバー）。形は src/lib/firebase/firestore.ts の addProject / uploadProjectSettings と同じ
  await setDoc(dataProject, `projects/${PROJECT_DOC}`, {
    ownerUid: owner,
    adminsUid: [owner],
    membersUid: [owner, member],
    encdata: pack({
      name: PROJECT_NAME,
      abstract: 'ネイティブのスモーク用',
      members: [
        { uid: owner, email: USERS.owner.email, verified: 'OK', role: 'OWNER' },
        { uid: member, email: USERS.member.email, verified: 'OK', role: 'MEMBER' },
      ],
    }),
    encryptedAt: new Date(),
  });
  const at = wholeSecond();
  await setDoc(dataProject, `projects/${PROJECT_DOC}/settings/default`, {
    editorUid: owner,
    encdata: pack({
      updatedAt: at.toISOString(),
      mapType: 'standard',
      mapRegion: { latitude: 35, longitude: 135, latitudeDelta: 0.00922, longitudeDelta: 0.00922, zoom: 15 },
      layers: [
        {
          id: LAYER_ID,
          name: LAYER_NAME,
          type: 'POINT',
          permission: 'PUBLIC',
          colorStyle: {
            colorType: 'SINGLE',
            transparency: 0.2,
            color: '#ff0000',
            fieldName: 'name',
            customFieldValue: '',
            colorRamp: 'RANDOM',
            colorList: [],
          },
          label: 'name',
          visible: true,
          active: true,
          field: [
            { id: 'e2e-f-name', name: 'name', format: 'SERIAL' },
            { id: 'e2e-f-time', name: 'time', format: 'DATETIME' },
            { id: 'e2e-f-cmt', name: 'cmt', format: 'STRING' },
            { id: 'e2e-f-photo', name: 'photo', format: 'PHOTO' },
          ],
        },
        // メモと軌跡は、アプリが必ず持つ固定のレイヤ（src/modules/layers.ts）。設定に無いと端末側で補われ、
        // 送信のたびに「クラウドで設定が変わっているためアップロードしませんでした: メモ」と出る
        {
          id: 'memo',
          name: 'メモ',
          type: 'LINE',
          permission: 'PRIVATE',
          colorStyle: {
            colorType: 'INDIVIDUAL',
            transparency: 0.2,
            color: '#ff0000',
            fieldName: '__CUSTOM',
            customFieldValue: '_strokeColor',
            colorRamp: 'RANDOM',
            colorList: [],
            lineWidth: 1.5,
          },
          label: '',
          visible: true,
          active: false,
          field: [],
        },
        {
          id: 'track',
          name: '軌跡',
          type: 'LINE',
          permission: 'PRIVATE',
          colorStyle: {
            colorType: 'SINGLE',
            transparency: 0.2,
            color: '#0000ff',
            fieldName: 'name',
            customFieldValue: '',
            colorRamp: 'RANDOM',
            colorList: [],
            lineWidth: 4,
          },
          label: 'name',
          visible: true,
          active: false,
          field: [
            { id: 'e2e-t-name', name: 'name', format: 'SERIAL' },
            { id: 'e2e-t-time', name: 'time', format: 'DATETIME' },
            { id: 'e2e-t-cmt', name: 'cmt', format: 'STRING' },
          ],
        },
      ],
      tileMaps: [],
      plugins: {},
    }),
    encryptedAt: at,
  });
  await putMemberData(dataProject, 1);
  console.log(`エミュレータを用意しました（アカウント2つ、プロジェクト「${PROJECT_NAME}」、メンバーの記録1件）`);
};

const checkUpload = async (dataProject) => {
  const owner = (await lookup(USERS.owner.email)).localId;
  const list = await call(`${docs(dataProject)}/projects/${PROJECT_DOC}/data?pageSize=100`, { headers: admin });
  const mine = (list.documents ?? []).filter(
    (d) => fromValue(d.fields.userId) === owner && fromValue(d.fields.layerId) === LAYER_ID
  );
  if (mine.length === 0) throw new Error('オーナーが送信した記録の文書が、サーバーにありません');
  if (mine.some((d) => fromValue(d.fields.permission) !== 'PUBLIC')) throw new Error('共有レイヤの記録が PUBLIC で届いていません');
  const records = mine.flatMap((d) => unpack(fromValue(d.fields.encdata)).data);
  if (!records.some((r) => r.field?.cmt === 'smoke' && r.userId === owner)) {
    throw new Error(`送信した記録（cmt=smoke）がサーバーにありません: ${JSON.stringify(records.map((r) => r.field))}`);
  }
  console.log(`サーバーに、オーナーが送信した記録があります（${records.length}件）`);
};

const checkLogin = async (who) => {
  const user = await lookup(USERS[who].email);
  if (!user?.lastLoginAt) throw new Error(`${USERS[who].email} がエミュレータにログインした跡がありません（端末がエミュレータにつながっていない）`);
  console.log(`${USERS[who].email} はエミュレータにログインしました`);
};

const [command, arg] = process.argv.slice(2);
const needArg = () => {
  if (!arg) throw new Error('引数が足りません（ファイル先頭の使い方を参照）');
  return arg;
};
try {
  if (command === 'reset') await reset(needArg());
  else if (command === 'member-add') await putMemberData(needArg(), 2);
  else if (command === 'check-upload') await checkUpload(needArg());
  else if (command === 'check-login') await checkLogin(needArg());
  else throw new Error('使い方: node emu-seed.mjs reset|member-add|check-upload <プロジェクトID> / check-login owner|member');
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
