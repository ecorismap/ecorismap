/**
 * 写真の写しの通し確認（写真監査 P-M8・P-M10。P-M9 の削除先 uid も）。Storage エミュレータと本番の storage.rules
 * （projects/{id} の Firestore doc を参照するクロスサービス Rules）で、写しの写真が写した人の名義のパスへ上がり、
 * 元の写真を消しても写しが残ることを確かめる。
 *
 * 写しを作る部品（utils/photoCopy.detachCopiedRecordPhotos）と、上げてよいかの判定（utils/photoUpload.isOwnUploadablePhotoUri）、
 * 消す前の参照確認（utils/photoReferences）は本物を使う。端末のファイル操作（expo-file-system）はメモリ上の表で置き換える。
 * アプリの写真のアップロード（storage.uploadPhoto）はネイティブの putFile と暗号化を使うので node では動かせない。
 * 同じパス（projects/{P}/PHOTO/{layer}/{uid}/{photo.id}）へ、Web SDK で同じ種類（image/jpeg）を put して再現する。
 *
 * 他の班が同じエミュレータを使っているので、clearStorage / clearFirestore は使わず、プロジェクト id を一意にする。
 *
 * 実行:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-ecorismap-test \
 *   npx jest --config jest.rules.config.js --runInBand src/lib/__tests__/firebase/e2e_data_photo_copy.test.ts
 */
import * as fs from 'fs';
import * as rulesTesting from '@firebase/rules-unit-testing';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ulid } from 'ulid';

const mockFiles = new Set<string>();
const MOCK_PHOTO_FOLDER = 'file:///data/user/0/app/files/projects';

jest.mock('expo-file-system/legacy', () => ({
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    if (!mockFiles.has(from)) throw new Error(`no such file: ${from}`);
    mockFiles.add(to);
  }),
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(uri) })),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
  }),
  documentDirectory: 'file:///data/user/0/app/files/',
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
}));
jest.mock('../../../constants/AppConstants', () => ({ PHOTO_FOLDER: 'file:///data/user/0/app/files/projects' }));
jest.mock('../../../utils/Layer', () => ({
  getPhotoFields: (l: { field: { format: string }[] }) => l.field.filter((f) => f.format === 'PHOTO'),
}));
jest.mock('../../../utils/Photo', () => ({
  hasLocalPhotoFile: async (uri: string | null | undefined) => typeof uri === 'string' && mockFiles.has(uri),
}));

import { detachCopiedRecordPhotos } from '../../../utils/photoCopy';
import { isOwnUploadablePhotoUri } from '../../../utils/photoUpload';
import {
  collectPhotoReferences,
  isPhotoReferenced,
  photoStorageOwnerUid,
  recordsOutsideUpload,
} from '../../../utils/photoReferences';
import { DataType, LayerType, PhotoType, RecordType } from '../../../types';

const RUN = `e2edataphoto_${ulid()}`;
const OWNER = `${RUN}_owner`;
const M1 = `${RUN}_m1`;
const M2 = `${RUN}_m2`;
const L = 'photoLayer';

let testEnv: rulesTesting.RulesTestEnvironment;
let P = '';

const LAYER = {
  id: L,
  name: L,
  type: 'POINT',
  permission: 'PUBLIC',
  field: [{ id: 'f-photo', name: 'photo', format: 'PHOTO' }],
} as unknown as LayerType;

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const ctx = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true });
const photoPath = (uid: string, photoId: string) => `projects/${P}/PHOTO/${L}/${uid}/${photoId}`;
const ownFolder = (uid: string) => `${MOCK_PHOTO_FOLDER}/${P}/${L}/${uid}`;

/** storage.uploadPhoto と同じパスへ上げて、ダウンロード URL を返す */
const uploadAs = async (uid: string, photoId: string) => {
  const r = ctx(uid).storage().ref(photoPath(uid, photoId));
  await r.put(jpeg(), { contentType: 'image/jpeg' }).then();
  return (await r.getDownloadURL()) as string;
};
const exists = async (uid: string, path: string) => {
  try {
    await ctx(uid).storage().ref(path).getMetadata();
    return true;
  } catch (e) {
    return false;
  }
};

const photo = (id: string, extra: Partial<PhotoType> = {}): PhotoType => ({
  id,
  name: `${id}.jpg`,
  uri: null,
  url: null,
  key: null,
  width: 10,
  height: 10,
  thumbnail: null,
  ...extra,
});
const rec = (id: string, userId: string, photos: PhotoType[], extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field: { photo: photos },
  updatedAt: 100,
  ...extra,
});

/** 写しを作った端末が、クラウドの原画を写真フォルダへ取得する（useDataEdit が渡す downloadPhoto の代わり） */
const downloaderFor = (uid: string) => async (p: PhotoType, filename: string) => {
  const path = decodeURIComponent((p.url as string).split('/o/')[1].split('?')[0]);
  if (!(await exists(uid, path))) return undefined;
  const uri = `${ownFolder(uid)}/${filename}`;
  mockFiles.add(uri);
  return uri;
};

beforeAll(async () => {
  testEnv = await rulesTesting.initializeTestEnvironment({
    projectId: 'demo-ecorismap-test',
    firestore: { host: '127.0.0.1', port: 8080 },
    storage: { host: '127.0.0.1', port: 9199, rules: fs.readFileSync('./storage.rules', 'utf8') },
  });
});

beforeEach(async () => {
  P = `e2e_data_photo_${ulid()}`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${P}`), {
      ownerUid: OWNER,
      adminsUid: [OWNER],
      membersUid: [OWNER, M1, M2],
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

jest.setTimeout(60000);

describe('P-M10: テンプレートの写しは、写した人の名義で写真を上げ直す', () => {
  test('写しの写真は新しい id で写した人のパスへ上がり、管理者がテンプレートの写真を消しても写しは残る', async () => {
    // 管理者がテンプレートの写真を上げる（テンプレートの写真は管理者の uid の下）
    const origUrl = await uploadAs(OWNER, 'orig');
    const template = rec('T', 'template', [photo('orig', { url: origUrl, key: 'k' })]);

    // M1 がテンプレートを編集して自分の写しを作る。M1 の端末に原画は無い（uri:null）のでクラウドから取得して写す
    const { record: copy, droppedPhotoCount, sharedPhotoCount } = await detachCopiedRecordPhotos(
      LAYER,
      { ...template, userId: M1 },
      ownFolder(M1),
      new Set(),
      { source: template, projectId: P, uid: M1, downloadPhoto: downloaderFor(M1) }
    );
    expect(droppedPhotoCount).toBe(0);
    expect(sharedPhotoCount).toBe(0);
    const copied = (copy.field.photo as PhotoType[])[0];
    expect(copied.id).not.toBe('orig');
    expect(copied.url).toBeNull();
    expect(copied.key).toBeNull();
    // アップロードの判定（updateStoragePhoto）を通る＝写した人の名義で上げ直される
    expect(isOwnUploadablePhotoUri(copied.uri, P, L, M1, { record: copy })).toBe(true);
    const copyUrl = await uploadAs(M1, copied.id);

    // 管理者がテンプレートの写真を外して送る。消す前の参照確認: 手元の他の集合（M1 の写し）は別の id・url なので参照に数えない
    const ownerDataSet: DataType[] = [
      { layerId: L, userId: 'template', data: [template] },
      { layerId: L, userId: M1, data: [{ ...copy, field: { photo: [{ ...copied, url: copyUrl, key: 'k2', uri: 'file:///elsewhere' }] } }] },
    ];
    const pending = { id: 'orig', url: origUrl };
    const refs = collectPhotoReferences(recordsOutsideUpload(ownerDataSet, LAYER, OWNER, true), LAYER.field, undefined, {
      conservative: true,
    });
    expect(isPhotoReferenced(pending, refs)).toBe(false);
    // 消すパスの uid は url から読む（P-M9）
    expect(photoStorageOwnerUid(pending, P, L, OWNER)).toBe(OWNER);
    await assertSucceeds(ctx(OWNER).storage().ref(photoPath(OWNER, 'orig')).delete());

    // 他のメンバーは写しの写真を取得でき、元の写真はもう無い
    expect(await exists(M2, photoPath(M1, copied.id))).toBe(true);
    expect(await exists(M2, photoPath(OWNER, 'orig'))).toBe(false);
  });

  test('原画を取得できないときは元の url を指したまま残し、その写真は参照確認で消さない', async () => {
    const origUrl = await uploadAs(OWNER, 'orig2');
    const template = rec('T2', 'template', [photo('orig2', { url: origUrl, key: 'k' })]);
    const { record: copy, sharedPhotoCount } = await detachCopiedRecordPhotos(
      LAYER,
      { ...template, userId: M1 },
      ownFolder(M1),
      new Set(),
      { source: template, projectId: P, uid: M1, downloadPhoto: async () => undefined } // 圏外
    );
    expect(sharedPhotoCount).toBe(1);
    const copied = (copy.field.photo as PhotoType[])[0];
    expect(copied.id).not.toBe('orig2');
    expect(copied.url).toBe(origUrl);
    // M1 の端末は上げない（uri:null）
    expect(isOwnUploadablePhotoUri(copied.uri, P, L, M1, { record: copy })).toBe(false);
    // 管理者の端末に写しがあれば、url の一致で参照とみなし Storage から消さない
    const refs = collectPhotoReferences(
      recordsOutsideUpload([{ layerId: L, userId: M1, data: [copy] }], LAYER, OWNER, true),
      LAYER.field,
      undefined,
      { conservative: true }
    );
    expect(isPhotoReferenced({ id: 'orig2', url: origUrl }, refs)).toBe(true);
  });

  test('修正前の共有（同じ photo.id）のまま一般メンバーが上げようとすると、管理者のパスには書けず失敗し続ける', async () => {
    await uploadAs(OWNER, 'orig3');
    await assertFails(ctx(M1).storage().ref(photoPath(OWNER, 'orig3')).put(jpeg(), { contentType: 'image/jpeg' }).then());
  });
});

describe('P-M8: 記録の複製は写真を別の実体にする', () => {
  test('自分の記録の複製: 原画を別名でコピーし新しい id で上げる。元の記録の写真を消しても複製の写真は残る', async () => {
    const origUri = `${ownFolder(M1)}/own.jpg`;
    mockFiles.add(origUri);
    const origUrl = await uploadAs(M1, 'own');
    const original = rec('R', M1, [photo('own', { name: 'own.jpg', uri: origUri, url: origUrl, key: 'k' })]);

    const { record: dup } = await detachCopiedRecordPhotos(LAYER, { ...original, id: ulid() }, ownFolder(M1), new Set(), {
      source: original,
      projectId: P,
      uid: M1,
      downloadPhoto: downloaderFor(M1),
    });
    const copied = (dup.field.photo as PhotoType[])[0];
    expect(copied.id).not.toBe('own');
    expect(copied.uri).not.toBe(origUri);
    expect(mockFiles.has(copied.uri as string)).toBe(true);
    expect(copied.url).toBeNull();
    expect(isOwnUploadablePhotoUri(copied.uri, P, L, M1, { record: dup })).toBe(true);
    // 複製の写真は別パスなので、元と並行に上げても上書き（Rules の拒否）にならない
    await uploadAs(M1, copied.id);

    // 元の記録から写真を外して送る → 元の実体を消す。複製は別の id なので参照に数えず、消しても複製は残る
    const refs = collectPhotoReferences([dup], LAYER.field);
    expect(isPhotoReferenced({ id: 'own', url: origUrl }, refs)).toBe(false);
    await assertSucceeds(ctx(M1).storage().ref(photoPath(M1, 'own')).delete());
    expect(await exists(M2, photoPath(M1, copied.id))).toBe(true);
  });

  test('他のメンバーの記録の複製: 送り手の端末パスは写さず、クラウドから取得して自分の名義で上げる。持ち主が元を消しても残る', async () => {
    const m2Url = await uploadAs(M2, 'm2photo');
    // 送り手（M2）の端末のパスがそのまま届く。M1 の端末に同じ文字列のファイルがあっても写してはいけない
    const m2DevicePath = `${ownFolder(M2)}/m2photo.jpg`;
    mockFiles.add(m2DevicePath);
    const others = rec('O', M2, [photo('m2photo', { uri: m2DevicePath, url: m2Url, key: 'k' })]);
    const { record: dup } = await detachCopiedRecordPhotos(
      LAYER,
      { ...others, id: ulid(), userId: M1 },
      ownFolder(M1),
      new Set(),
      { source: others, projectId: P, uid: M1, downloadPhoto: downloaderFor(M1) }
    );
    const copied = (dup.field.photo as PhotoType[])[0];
    expect(copied.uri?.startsWith(`${ownFolder(M1)}/`)).toBe(true);
    expect(copied.url).toBeNull();
    await uploadAs(M1, copied.id);

    // 持ち主（M2）が写真を消す
    await assertSucceeds(ctx(M2).storage().ref(photoPath(M2, 'm2photo')).delete());
    expect(await exists(OWNER, photoPath(M1, copied.id))).toBe(true);
    // 一般メンバーは他人の写しを消せない
    await assertFails(ctx(M2).storage().ref(photoPath(M1, copied.id)).delete());
  });
});
