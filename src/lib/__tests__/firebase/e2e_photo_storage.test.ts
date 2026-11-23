/**
 * 写真と Storage の通し確認（docs/PHOTO_AUDIT_2026-11.md の P-H1・P-M5・P-H2・P-M7・P-M13・P-M12・P-M16・P-L6・P-L15）。
 * Firestore / Storage エミュレータと本番の firestore.rules・storage.rules で、src/lib/firebase/storage.ts・firestore.ts と
 * useCloudDataManagement の deletePhotosOfDeletedData をそのまま動かす。利用者は rules-unit-testing の認証済みコンテキストで切り替える。
 *
 * - 暗号化は FUNC_ENCRYPTION=false（データは gzip のみ）。写真ファイルの暗号化（e3kit）は1バイトの XOR に置き換えている（暗号方式の検証は対象外）
 * - ネイティブの経路（RNFB の putFile・expo-file-system・写真の JPEG 変換）は node で動かないので、
 *   putFile は「ローカルファイルの拡張子から contentType を決めて送る」（RNFB iOS の挙動）、expo-file-system は node の fs、
 *   ネイティブの JPEG 変換モジュールは JPEG の印を付けて書き出すだけの代役にしている。src/utils/Photo.ts の判定（中身・拡張子）は本物
 * - React のフック（useRepository.updateStoragePhoto・useCloudDataManagement.deleteCloudData）は node で動かせないので、
 *   同じ部品を同じ順で呼んで再現している（updateStoragePhotoReplica・deleteCloudDataFlow）
 * - 他の班が同じエミュレータを使うので、clearFirestore / clearStorage は使わない。プロジェクト id・uid はテストごとに一意にする
 *
 * 実行: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 GCLOUD_PROJECT=demo-ecorismap-test \
 *   npx jest --config jest.rules.config.js --runInBand src/lib/__tests__/firebase/e2e_photo_storage.test.ts
 */
import * as nodeFs from 'fs';
import * as nodePath from 'path';
import { resolveObjectURL } from 'buffer';
import * as rulesTesting from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { ref as stRef, uploadBytes as stUploadBytes } from 'firebase/storage';
import { ulid } from 'ulid';

// ---------------------------------------------------------------------------------------------
// モック
// ---------------------------------------------------------------------------------------------
const mockActor: { db: unknown; storage: unknown; uid: string } = { db: undefined, storage: undefined, uid: '' };
const mockPlatform = { OS: 'web' };
/** Web の blob: URL → Blob（node の fetch は blob: を読めないので、取り込んだ写真の Blob をここに置く） */
const mockBlobs = new Map<string, Blob>();
/** putFile / uploadBytes で送ったパス（上げ直しの有無を数える） */
const mockUploadLog: string[] = [];
const mockConverter = { fail: false, calls: 0 };

// jest.mock の工場より先に使うので、巻き上げられる関数宣言にする
function mockRoot() {
  return `${require('os').tmpdir()}/ecorismap-e2e-photo-${process.pid}`;
}

jest.mock('../../firebase/firebase', () => {
  const fsMod = jest.requireActual('firebase/firestore');
  const st = jest.requireActual('firebase/storage');
  const fsNode = jest.requireActual('fs');
  const contentTypeByExt = (p: string) => {
    const m = p.match(/\.([A-Za-z0-9]+)$/);
    const ext = m ? m[1].toLowerCase() : '';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'heic' || ext === 'heif') return 'image/heic';
    return 'application/octet-stream';
  };
  const mod: Record<string, unknown> = {
    ...fsMod,
    functions: {},
    httpsCallable: jest.fn(),
    getDocsFromServer: fsMod.getDocs,
    firebaseReady: Promise.resolve(),
    uploadBytes: async (r: { fullPath: string }, data: unknown, meta?: unknown) => {
      mockUploadLog.push(r.fullPath);
      return st.uploadBytes(r, data, meta);
    },
    uploadString: st.uploadString,
    getDownloadURL: st.getDownloadURL,
    deleteObject: st.deleteObject,
    listAll: st.listAll,
    getMetadata: st.getMetadata,
    // ネイティブ（RNFB）の ref には putFile がある。RNFB の iOS 版は contentType をローカルファイルの拡張子だけで決める
    ref: (service: unknown, path?: string) => {
      const r = st.ref(service, path);
      r.putFile = async (localPath: string) => {
        mockUploadLog.push(r.fullPath);
        const bytes = new Uint8Array(fsNode.readFileSync(localPath.replace(/^file:\/\//, '')));
        return st.uploadBytes(r, bytes, { contentType: contentTypeByExt(localPath) });
      };
      return r;
    },
  };
  Object.defineProperty(mod, 'firestore', { get: () => mockActor.db, enumerable: true });
  Object.defineProperty(mod, 'storage', { get: () => mockActor.storage, enumerable: true });
  Object.defineProperty(mod, 'auth', { get: () => ({ currentUser: { uid: mockActor.uid } }), enumerable: true });
  return mod;
});
jest.mock('../../../constants/AppConstants', () => ({
  FUNC_ENCRYPTION: false,
  CREATE_DEK_PROJECTS: false,
  ENABLE_KEY_LEDGER: false,
  PHOTO_FOLDER: `file://${mockRoot()}/doc/projects`,
}));
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      try {
        return mockPlatform.OS;
      } catch {
        return 'web';
      }
    },
    select: (o: Record<string, unknown>) => o.ios ?? o.default,
  },
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
}));
jest.mock('expo-file-system/legacy', () => {
  const fsNode = jest.requireActual('fs');
  const pathNode = jest.requireActual('path');
  const root = mockRoot();
  const p = (u: string) => decodeURI(u.replace(/^file:\/\//, ''));
  return {
    documentDirectory: `file://${root}/doc/`,
    cacheDirectory: `file://${root}/cache/`,
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    getInfoAsync: async (u: string) => ({ exists: fsNode.existsSync(p(u)), uri: u }),
    readAsStringAsync: async (u: string, o: { encoding?: string; position?: number; length?: number } = {}) => {
      let buf: Buffer = fsNode.readFileSync(p(u));
      if (o.position !== undefined || o.length !== undefined) {
        const start = o.position ?? 0;
        buf = buf.subarray(start, o.length !== undefined ? start + o.length : undefined);
      }
      return o.encoding === 'base64' ? buf.toString('base64') : buf.toString('utf8');
    },
    downloadAsync: async (url: string, to: string) => {
      const res = await fetch(url);
      const bytes = Buffer.from(await res.arrayBuffer());
      fsNode.mkdirSync(pathNode.dirname(p(to)), { recursive: true });
      fsNode.writeFileSync(p(to), bytes);
      return { uri: to, status: res.status };
    },
    copyAsync: async ({ from, to }: { from: string; to: string }) => {
      fsNode.mkdirSync(pathNode.dirname(p(to)), { recursive: true });
      fsNode.copyFileSync(p(from), p(to));
    },
    makeDirectoryAsync: async (u: string) => {
      fsNode.mkdirSync(p(u), { recursive: true });
    },
    deleteAsync: async (u: string, o: { idempotent?: boolean } = {}) => {
      if (!fsNode.existsSync(p(u))) {
        if (o.idempotent) return;
        throw new Error(`not found: ${u}`);
      }
      fsNode.rmSync(p(u), { recursive: true, force: true });
    },
  };
});
// 写真ファイルの暗号化の代役（1バイトの XOR）。Web は元の Blob の種類を引き継ぐ（e3kit-browser と同じ）。
// ネイティブは入力の拡張子を引き継いだ出力先に書く（encryptedOutputPath と同じ）
jest.mock('../../virgilsecurity/e3kit', () => {
  const pako = jest.requireActual('pako');
  const { Buffer: B } = jest.requireActual('buffer');
  const fsNode = jest.requireActual('fs');
  const { ulid: mkId } = jest.requireActual('ulid');
  const gzip = (str: string) => B.from(pako.deflate(str)).toString('base64');
  const unzip = (value: string) => B.from(pako.inflate(new Uint8Array(B.from(value, 'base64')))).toString('utf-8');
  const xor = (bytes: Uint8Array, key: string) => {
    const k = parseInt(key, 16);
    return Uint8Array.from(bytes, (b) => b ^ k);
  };
  const newKey = () => (1 + Math.floor(Math.random() * 254)).toString(16).padStart(2, '0');
  const cache = () => `${mockRoot()}/cache`;
  return {
    encryptEThree: async (data: unknown) => [gzip(JSON.stringify(data))],
    decryptEThree: async (_at: Date, encdata: string[]) => {
      try {
        return JSON.parse(unzip(encdata[0]));
      } catch (e) {
        return undefined;
      }
    },
    encryptFileEThree: async (uri: string) => {
      const src = mockBlobs.get(uri);
      if (src === undefined) return { encdata: undefined, key: undefined };
      const key = newKey();
      const enc = xor(new Uint8Array(await src.arrayBuffer()), key);
      return { encdata: new Blob([enc], { type: src.type }), key };
    },
    decryptFileEThree: async (blob: Blob, key: string) => ({
      decdata: new Blob([xor(new Uint8Array(await blob.arrayBuffer()), key)]),
    }),
    encryptFileEThreeRN: async (uri: string) => {
      const input = uri.replace(/^file:\/\//, '');
      const key = newKey();
      const ext = input.match(/(\.[A-Za-z0-9]+)$/)?.[1] ?? '';
      fsNode.mkdirSync(cache(), { recursive: true });
      const out = `${cache()}/enc_${mkId()}${ext}`;
      fsNode.writeFileSync(out, xor(new Uint8Array(fsNode.readFileSync(input)), key));
      return { encUri: out, key };
    },
    decryptFileEThreeRN: async (uri: string, key: string) => {
      const input = uri.replace(/^file:\/\//, '');
      fsNode.mkdirSync(cache(), { recursive: true });
      const out = `${cache()}/dec_${mkId()}`;
      fsNode.writeFileSync(out, xor(new Uint8Array(fsNode.readFileSync(input)), key));
      return { decUri: out };
    },
  };
});
jest.mock('../../virgilsecurity/dek', () => ({}));
jest.mock('../../crypto', () => ({}));
jest.mock('../../firebase/publicKeys', () => ({ clearPublicKeyLedgerCache: jest.fn(), getPublicKeyFromLedger: jest.fn() }));
jest.mock('../../../i18n/config', () => ({ t: (key: string) => key }));
jest.mock('../../../i18n/dayjs', () => jest.requireActual('dayjs'));
jest.mock('../../../utils/db', () => ({ db: {} }));
jest.mock('../../../utils/Layer', () => ({ getPhotoFields: jest.fn(() => []) }));
jest.mock('expo-image-picker', () => ({}));
// expo-image-manipulator はネイティブ変換が使えないときの代わり。ここでは使えない（変換の失敗）として扱う
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: async () => {
    throw new Error('expo-image-manipulator is not available in node');
  },
}));
// ネイティブの JPEG 変換（modules/photo-converter）の代役。JPEG の印（FF D8 FF E0）を付けて書き出す
jest.mock('../../../../modules/photo-converter/src', () => {
  const fsNode = jest.requireActual('fs');
  const pathNode = jest.requireActual('path');
  return {
    isPhotoConverterAvailable: () => true,
    convertPhotoToJpeg: async (src: string, dst: string) => {
      mockConverter.calls += 1;
      if (mockConverter.fail) throw new Error('conversion failed');
      const bytes = fsNode.readFileSync(src.replace(/^file:\/\//, ''));
      const out = dst.replace(/^file:\/\//, '');
      fsNode.mkdirSync(pathNode.dirname(out), { recursive: true });
      fsNode.writeFileSync(out, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), bytes]));
    },
  };
});
jest.mock('../../../modules/projects', () => ({ updateProjectAction: jest.fn() }));
jest.mock('react-redux', () => ({ useDispatch: jest.fn(), useSelector: jest.fn() }));

import * as projectStore from '../../firebase/firestore';
import * as projectStorage from '../../firebase/storage';
import { deletePhotosOfDeletedData } from '../../../hooks/useCloudDataManagement';
import dataSetReducer, { applyUploadedPhotosAction, UploadedPhotosPayload } from '../../../modules/dataSet';
import { canReadPhotoForUpload, isOwnUploadablePhotoUri } from '../../../utils/photoUpload';
import { findLocalPhotoUri, photoDownloadTarget } from '../../../utils/photoDownloadPath';
import { PHOTO_FOLDER } from '../../../constants/AppConstants';
import { canDeleteProject } from '../../../utils/projectPermission';
import { DataType, PermissionType, PhotoType, RecordType } from '../../../types';

// ---------------------------------------------------------------------------------------------
// 準備
// ---------------------------------------------------------------------------------------------
const PROJECT_ID = 'demo-ecorismap-test';
const RUN = ulid().slice(-8).toLowerCase();
const OWNER = `ph_owner_${RUN}`;
const ADMIN2 = `ph_admin2_${RUN}`;
const M1 = `ph_m1_${RUN}`;
const M2 = `ph_m2_${RUN}`;
const OUTSIDER = `ph_out_${RUN}`;
const MIN = 60 * 1000;
/** 写真を「照合の10分より前に上がったもの」として扱う開始時刻（RECENT_UPLOAD_MARGIN_MS を越える） */
const AFTER_MARGIN = () => Date.now() + 11 * MIN;

let testEnv: rulesTesting.RulesTestEnvironment;
jest.setTimeout(180000);

const as = (uid: string) => {
  const ctx = testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true });
  mockActor.uid = uid;
  mockActor.db = ctx.firestore();
  mockActor.storage = ctx.storage();
};

const newProject = async (members: string[] = [OWNER, ADMIN2, M1, M2]) => {
  const pid = `e2ephoto_${ulid()}`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `projects/${pid}`), {
      ownerUid: OWNER,
      adminsUid: [OWNER, ADMIN2],
      membersUid: members,
      encdata: [''],
      encryptedAt: Timestamp.now(),
    });
  });
  return pid;
};

type CompatRef = ReturnType<ReturnType<rulesTesting.RulesTestContext['storage']>['ref']>;
/** Rules を通さずに、prefix 配下の全ファイルのパスを数える */
const listRaw = async (prefix: string): Promise<string[]> => {
  let out: string[] = [];
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const walk = async (r: CompatRef): Promise<string[]> => {
      const res = await r.listAll();
      const nested = await Promise.all(res.prefixes.map(walk));
      return [...res.items.map((i) => i.fullPath), ...nested.flat()];
    };
    out = await walk(context.storage().ref(prefix));
  });
  return out.sort();
};
const metaRaw = async (path: string) => {
  let meta: { contentType?: string; generation?: string; timeCreated?: string; updated?: string } = {};
  await testEnv.withSecurityRulesDisabled(async (context) => {
    meta = (await context.storage().ref(path).getMetadata()) as unknown as typeof meta;
  });
  return meta;
};
const seedRaw = async (path: string, contentType = 'image/jpeg', bytes = new Uint8Array([0xff, 0xd8, 0xff, 1])) => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(path).put(bytes, { contentType }).then();
  });
};
const downloadRaw = async (path: string): Promise<Uint8Array> => {
  let url = '';
  await testEnv.withSecurityRulesDisabled(async (context) => {
    url = await context.storage().ref(path).getDownloadURL();
  });
  return new Uint8Array(await (await fetch(url)).arrayBuffer());
};

const photoPath = (pid: string, layerId: string, uid: string, photoId: string) =>
  `projects/${pid}/PHOTO/${layerId}/${uid}/${photoId}`;

const bytesOf = (label: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(label)]);
const xorBytes = (bytes: Uint8Array, key: string) => Uint8Array.from(bytes, (b) => b ^ parseInt(key, 16));

/** Web の経路（uploadPhoto）で写真を上げ、記録に入れる PhotoType を返す */
const uploadWebPhoto = async (
  uid: string,
  pid: string,
  layerId: string,
  label: string,
  opts: { name?: string; blobType?: string; photoId?: string } = {}
): Promise<PhotoType> => {
  mockPlatform.OS = 'web';
  as(uid);
  const id = opts.photoId ?? ulid();
  const uri = `blob:mock/${id}`;
  mockBlobs.set(uri, new Blob([bytesOf(label)], { type: opts.blobType ?? 'image/jpeg' }));
  const name = opts.name ?? `EMAP_20261123_101010_${id.slice(-6)}.jpg`;
  const res = await projectStorage.uploadPhoto(pid, layerId, uid, id, uri, name);
  expect(res.isOK).toBe(true);
  return { id, name, uri: null, url: res.url, key: res.key, width: 10, height: 10, thumbnail: null };
};

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

const putData = async (pid: string, uid: string, layerId: string, permission: PermissionType | 'TEMPLATE', data: RecordType[]) => {
  as(uid);
  const res = await projectStore.uploadDataHelper(pid, { layerId, userId: uid, permission, data } as never);
  expect(res.isOK).toBe(true);
};

type DeleteTarget = { layerId: string; permission: PermissionType | 'TEMPLATE'; userId?: string };

/**
 * useCloudDataManagement.deleteCloudData の手順（持ち主のフォルダの一覧 → 照合データ → doc の削除 → 消した後のデータ → 写真の削除）を
 * 同じ部品で同じ順に行う。allItems は画面が表示していた行（getCloudDataSummary の結果）
 */
const deleteCloudDataFlow = async (
  actor: string,
  pid: string,
  targets: DeleteTarget[],
  startedAt: number = Date.now()
) => {
  as(actor);
  const summary = await projectStore.getCloudDataSummary(pid);
  expect(summary.isOK).toBe(true);
  const layerIds = Array.from(new Set(targets.map((t) => t.layerId)));
  const foldersByLayer = new Map<string, Map<string, string[]>>();
  const beforeByLayer = new Map<string, Awaited<ReturnType<typeof projectStore.downloadLayerDataGroups>>>();
  for (const layerId of layerIds) {
    const owners = Array.from(new Set(targets.filter((t) => t.layerId === layerId && t.userId).map((t) => t.userId as string)));
    const lists = await Promise.all(
      owners.map((u) => projectStorage.listLayerPhotoPaths(pid, layerId, u).catch(() => [] as string[]))
    );
    foldersByLayer.set(layerId, new Map(owners.map((u, i) => [u, lists[i]])));
    beforeByLayer.set(layerId, await projectStore.downloadLayerDataGroups(pid, layerId));
  }
  const deletePhotosFor = async (done: DeleteTarget[]) => {
    for (const layerId of layerIds) {
      const doneInLayer = done.filter((t) => t.layerId === layerId);
      if (doneInLayer.length === 0) continue;
      const after = await projectStore.downloadLayerDataGroups(pid, layerId);
      await deletePhotosOfDeletedData(
        pid,
        layerId,
        doneInLayer,
        (summary.data ?? []).filter((s) => s.layerId === layerId),
        Array.from(new Set(doneInLayer.map((t) => t.userId).filter((u): u is string => !!u))).flatMap(
          (u) => foldersByLayer.get(layerId)?.get(u) ?? []
        ),
        beforeByLayer.get(layerId)!,
        after,
        startedAt
      );
    }
  };
  const done: DeleteTarget[] = [];
  for (const target of targets) {
    const res = await projectStore.deleteData(pid, target.layerId, target.permission, target.userId);
    if (!res.isOK) {
      await deletePhotosFor(done);
      return { isOK: false };
    }
    done.push(target);
  }
  await deletePhotosFor(done);
  return { isOK: true };
};

/**
 * useRepository.updateStoragePhoto の写真ごとの分岐（P-M13 の判定 → 読めるか → uploadPhoto → url/key を積む／
 * 上げる前に外した印（uri:undefined, url:null）は取り除く／上げ済みはそのまま）を同じ部品で再現する
 */
const updateStoragePhotoReplica = async (
  data: RecordType,
  pid: string,
  layerId: string,
  uid: string,
  uploadedPhotos: UploadedPhotosPayload['records'],
  photoOwner?: { userId?: string; takenOverFrom?: string[] }
) => {
  const newData: RecordType = JSON.parse(JSON.stringify(data));
  const photos = (data.field.photo as PhotoType[]).map(async (photo) => {
    if (photo.uri !== null && photo.uri !== undefined && photo.url === null) {
      if (!isOwnUploadablePhotoUri(photo.uri, pid, layerId, uid, { record: photoOwner ?? data })) return photo;
      if (!(await canReadPhotoForUpload(photo.uri))) return photo;
      const { isOK, url, key } = await projectStorage.uploadPhoto(pid, layerId, uid, photo.id, photo.uri, photo.name);
      if (!isOK || url === null || key === null) return photo;
      uploadedPhotos[data.id] = { ...uploadedPhotos[data.id], [photo.id]: { url, key } };
      return mockPlatform.OS === 'web' ? { ...photo, url, key, uri: null } : { ...photo, url, key };
    } else if (photo.uri === undefined && photo.url !== null) {
      return undefined;
    } else if (photo.uri === undefined && photo.url === null) {
      return undefined;
    }
    return photo;
  });
  newData.field.photo = (await Promise.all(photos)).filter((v): v is PhotoType => v !== undefined);
  return newData;
};

const localPath = (u: string) => u.replace(/^file:\/\//, '');
const writeLocal = (u: string, bytes: Uint8Array) => {
  nodeFs.mkdirSync(nodePath.dirname(localPath(u)), { recursive: true });
  nodeFs.writeFileSync(localPath(u), bytes);
};
const sameBytes = (a: Uint8Array | ArrayBuffer, b: Uint8Array) => Buffer.compare(new Uint8Array(a), b) === 0;
const readLocal = (u: string) => new Uint8Array(nodeFs.readFileSync(localPath(u)));
const HEIF_HEAD = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 1, 2, 3]); // ....ftypheic

const realFetch = global.fetch;
beforeAll(async () => {
  // canReadPhotoForUpload（Web）は blob: を fetch で読めるか確かめる。node の fetch は blob: を読めないので、取り込んだ写真だけ返す
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('blob:mock/')) {
      const blob = mockBlobs.get(url);
      return blob === undefined ? new Response(null, { status: 404 }) : new Response(blob, { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  nodeFs.mkdirSync(`${mockRoot()}/cache`, { recursive: true });
  nodeFs.mkdirSync(`${mockRoot()}/doc`, { recursive: true });
  testEnv = await rulesTesting.initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: nodeFs.readFileSync('./firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 9199, rules: nodeFs.readFileSync('./storage.rules', 'utf8') },
  });
});

beforeEach(() => {
  projectStore.clearProjectCryptoCache();
  mockPlatform.OS = 'web';
  mockConverter.fail = false;
  mockConverter.calls = 0;
  mockUploadLog.length = 0;
});

afterAll(async () => {
  global.fetch = realFetch;
  await testEnv.cleanup();
  nodeFs.rmSync(mockRoot(), { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// P-H1 / P-M5: アップロードの contentType と Rules
// ---------------------------------------------------------------------------------------------
describe('P-M5: Web の写真は contentType を明示して上げる', () => {
  test('ZIP から取り込んだ種類なしの Blob でも、名前が .jpg なら image/jpeg で Rules を通り、取得して元に戻せる', async () => {
    const pid = await newProject();
    const photo = await uploadWebPhoto(M1, pid, 'L', 'zip-jpg', { blobType: '' });
    const path = photoPath(pid, 'L', M1, photo.id);
    expect((await metaRaw(path)).contentType).toBe('image/jpeg');
    // 別のメンバーが取得して復号できる
    as(M2);
    const fetched = await projectStorage.fetchPhoto(photo.url!, photo.key!);
    expect(fetched.isOK).toBe(true);
    const blob = resolveObjectURL(fetched.data as string);
    expect(Buffer.from(await blob!.arrayBuffer()).toString('latin1')).toBe(Buffer.from(bytesOf('zip-jpg')).toString('latin1'));
  });

  test('種類なしの Blob で名前が .png なら image/png、名前から分からなければ image/jpeg で上がる', async () => {
    const pid = await newProject();
    const png = await uploadWebPhoto(M1, pid, 'L', 'zip-png', { blobType: '', name: 'scan.png' });
    expect((await metaRaw(photoPath(pid, 'L', M1, png.id))).contentType).toBe('image/png');
    const noExt = await uploadWebPhoto(M1, pid, 'L', 'zip-noext', { blobType: '', name: 'photo' });
    expect((await metaRaw(photoPath(pid, 'L', M1, noExt.id))).contentType).toBe('image/jpeg');
  });

  test('（対照）contentType を付けずに種類なしの Blob を送ると Rules で拒否される＝修正前の失敗が実在する', async () => {
    const pid = await newProject();
    as(M1);
    const r = stRef(mockActor.storage as never, photoPath(pid, 'L', M1, ulid()));
    await expect(stUploadBytes(r, new Blob([bytesOf('raw')]))).rejects.toThrow();
  });
});

describe('P-H1: ネイティブは HEIC 等を JPEG にしてから上げる（putFile の contentType は拡張子で決まる）', () => {
  const nativeUpload = async (pid: string, uid: string, fileName: string, content: Uint8Array, os = 'ios') => {
    mockPlatform.OS = os;
    as(uid);
    const id = ulid();
    const uri = `${PHOTO_FOLDER}/${pid}/L/${uid}/${fileName}`;
    writeLocal(uri, content);
    const res = await projectStorage.uploadPhoto(pid, 'L', uid, id, uri, fileName);
    return { id, uri, res };
  };
  const convertedLeftovers = () =>
    nodeFs.readdirSync(`${mockRoot()}/cache`).filter((f) => /^photo_.*\.jpg$/.test(f));

  test('iOS の .heic（中身も HEIF）は JPEG に変換され image/jpeg で Rules を通る。変換の一時ファイルは残らない', async () => {
    const pid = await newProject();
    const before = convertedLeftovers().length;
    const { id, uri, res } = await nativeUpload(pid, M1, 'EMAP_20261123_101010_ABCDEF.heic', HEIF_HEAD);
    expect(res.isOK).toBe(true);
    expect(mockConverter.calls).toBe(1);
    const path = photoPath(pid, 'L', M1, id);
    expect((await metaRaw(path)).contentType).toBe('image/jpeg');
    // 復号すると JPEG の印で始まる（変換後のファイルが送られた）
    const plain = xorBytes(await downloadRaw(path), res.key!);
    expect(Array.from(plain.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    // 端末の元ファイル（.heic）はそのまま
    expect(Array.from(readLocal(uri))).toEqual(Array.from(HEIF_HEAD));
    expect(convertedLeftovers().length).toBe(before);
  });

  test('Android で .jpeg の名前のまま中身が HEIF（P-L1）でも、中身で判定して JPEG にしてから上げる', async () => {
    const pid = await newProject();
    const { id, res } = await nativeUpload(pid, M1, 'EMAP_20261123_101010_ABCDEG.jpeg', HEIF_HEAD, 'android');
    expect(res.isOK).toBe(true);
    expect(mockConverter.calls).toBe(1);
    const plain = xorBytes(await downloadRaw(photoPath(pid, 'L', M1, id)), res.key!);
    expect(Array.from(plain.slice(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(Array.from(plain.slice(4))).toEqual(Array.from(HEIF_HEAD));
  });

  test('中身が JPEG の写真は変換せずにそのまま上げる', async () => {
    const pid = await newProject();
    const content = bytesOf('plain-jpeg');
    const { id, res } = await nativeUpload(pid, M1, 'EMAP_20261123_101010_ABCDEH.jpg', content);
    expect(res.isOK).toBe(true);
    expect(mockConverter.calls).toBe(0);
    const path = photoPath(pid, 'L', M1, id);
    expect((await metaRaw(path)).contentType).toBe('image/jpeg');
    expect(Array.from(xorBytes(await downloadRaw(path), res.key!))).toEqual(Array.from(content));
  });

  test('変換に失敗したときは .heic のまま送られ Rules に拒否される（失敗として返り、写真は未アップロードのまま）', async () => {
    const pid = await newProject();
    mockConverter.fail = true;
    const { id, res } = await nativeUpload(pid, M1, 'EMAP_20261123_101010_ABCDEJ.heic', HEIF_HEAD);
    expect(res.isOK).toBe(false);
    expect(res.url).toBeNull();
    expect(await listRaw(photoPath(pid, 'L', M1, id))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// P-H2: クラウドデータ管理で行を消したときの写真
// ---------------------------------------------------------------------------------------------
describe('P-H2: クラウドデータ管理の行削除は、残すデータの写真を消さない', () => {
  test('例A: 管理者の PUBLIC を消しても、同じ管理者のテンプレートの写真とメンバーの写真は残り、消した行の写真だけ消える', async () => {
    const pid = await newProject();
    const t1 = await uploadWebPhoto(OWNER, pid, 'L', 'template');
    const o1 = await uploadWebPhoto(OWNER, pid, 'L', 'owner-public');
    const m1 = await uploadWebPhoto(M1, pid, 'L', 'member');
    await putData(pid, OWNER, 'L', 'TEMPLATE', [rec('T1', 'template', [t1])]);
    await putData(pid, OWNER, 'L', 'PUBLIC', [rec('O1', OWNER, [o1])]);
    await putData(pid, M1, 'L', 'PUBLIC', [rec('R1', M1, [m1])]);
    // 他人の PRIVATE（管理者は Rules 上読める。照合に入る）
    const m2p = await uploadWebPhoto(M2, pid, 'L', 'm2-private');
    await putData(pid, M2, 'L', 'PRIVATE', [rec('P1', M2, [m2p])]);

    // オーナーでない管理者が操作しても同じ
    const res = await deleteCloudDataFlow(ADMIN2, pid, [{ layerId: 'L', permission: 'PUBLIC', userId: OWNER }], AFTER_MARGIN());
    expect(res.isOK).toBe(true);
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual(
      [photoPath(pid, 'L', OWNER, t1.id), photoPath(pid, 'L', M1, m1.id), photoPath(pid, 'L', M2, m2p.id)].sort()
    );
    // 残したデータも残っている
    as(OWNER);
    const after = await projectStore.downloadLayerDataGroups(pid, 'L');
    expect(after.groups.map((g) => `${g.permission}:${g.userId}`).sort()).toEqual(
      [`PRIVATE:${M2}`, `PUBLIC:${M1}`, `TEMPLATE:${OWNER}`].sort()
    );
  });

  test('例B: メンバーの行を消しても、管理者が引き継いだ記録が参照するそのメンバーの写真は残る', async () => {
    const pid = await newProject();
    const keep = await uploadWebPhoto(M1, pid, 'L', 'taken-over');
    const drop = await uploadWebPhoto(M1, pid, 'L', 'only-member');
    await putData(pid, M1, 'L', 'PUBLIC', [rec('R1', M1, [drop])]);
    // 管理者が M1 の R2 を引き継いだ（名義は管理者、写真は M1 のフォルダのまま）
    await putData(pid, OWNER, 'L', 'PUBLIC', [rec('R2', OWNER, [keep], { takenOverFrom: [M1] } as Partial<RecordType>)]);

    const res = await deleteCloudDataFlow(OWNER, pid, [{ layerId: 'L', permission: 'PUBLIC', userId: M1 }], AFTER_MARGIN());
    expect(res.isOK).toBe(true);
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual([photoPath(pid, 'L', M1, keep.id)]);
  });

  test('消す行が他人のフォルダの写真を参照していて、残す行が参照していなければ、その写真も消える', async () => {
    const pid = await newProject();
    const taken = await uploadWebPhoto(M1, pid, 'L', 'taken-over-only');
    const m1own = await uploadWebPhoto(M1, pid, 'L', 'm1-own');
    await putData(pid, M1, 'L', 'PUBLIC', [rec('R1', M1, [m1own])]);
    await putData(pid, OWNER, 'L', 'PUBLIC', [rec('R2', OWNER, [taken], { takenOverFrom: [M1] } as Partial<RecordType>)]);

    await deleteCloudDataFlow(OWNER, pid, [{ layerId: 'L', permission: 'PUBLIC', userId: OWNER }], AFTER_MARGIN());
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual([photoPath(pid, 'L', M1, m1own.id)]);
  });

  test('復号できないデータがレイヤにあると照合できないので、写真は1枚も消さない（データの行は消える）', async () => {
    const pid = await newProject();
    const o1 = await uploadWebPhoto(OWNER, pid, 'L', 'owner');
    const m2 = await uploadWebPhoto(M2, pid, 'L', 'm2');
    await putData(pid, OWNER, 'L', 'PUBLIC', [rec('O1', OWNER, [o1])]);
    // M2 の doc は復号できない（壊れた暗号文）
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `projects/${pid}/data/${ulid()}`), {
        layerId: 'L',
        userId: M2,
        permission: 'PUBLIC',
        encdata: ['!!broken!!'],
        encryptedAt: Timestamp.now(),
      });
    });
    const res = await deleteCloudDataFlow(OWNER, pid, [{ layerId: 'L', permission: 'PUBLIC', userId: OWNER }], AFTER_MARGIN());
    expect(res.isOK).toBe(true);
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual(
      [photoPath(pid, 'L', OWNER, o1.id), photoPath(pid, 'L', M2, m2.id)].sort()
    );
  });

  test('照合を始めた10分前より後に上がった写真は消さない（getMetadata の作成時刻ガード）', async () => {
    const pid = await newProject();
    const o1 = await uploadWebPhoto(OWNER, pid, 'L', 'fresh');
    await putData(pid, OWNER, 'L', 'PUBLIC', [rec('O1', OWNER, [o1])]);
    // 本物と同じく startedAt = 今
    await deleteCloudDataFlow(OWNER, pid, [{ layerId: 'L', permission: 'PUBLIC', userId: OWNER }], Date.now());
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual([photoPath(pid, 'L', OWNER, o1.id)]);
    // 同じ写真も、10分より前に上がったものとして扱えば消える
    await deletePhotosOfDeletedData(
      pid,
      'L',
      [{ layerId: 'L', permission: 'PUBLIC', userId: OWNER }],
      [],
      [photoPath(pid, 'L', OWNER, o1.id)],
      { isOK: true, groups: [], complete: true },
      { isOK: true, groups: [], complete: true },
      AFTER_MARGIN()
    );
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual([]);
  });

  test('listLayerPhotoPaths は管理者だけが使え（一般メンバーは Rules で拒否）、deletePhotoPaths は写真フォルダの外を消さない', async () => {
    const pid = await newProject();
    const o1 = await uploadWebPhoto(OWNER, pid, 'L', 'owner');
    as(OWNER);
    expect(await projectStorage.listLayerPhotoPaths(pid, 'L', OWNER)).toEqual([photoPath(pid, 'L', OWNER, o1.id)]);
    as(M1);
    await expect(projectStorage.listLayerPhotoPaths(pid, 'L', OWNER)).rejects.toBeTruthy();

    await seedRaw(`projects/${pid}/PDF/map1`, 'application/pdf');
    as(OWNER);
    const failed = await projectStorage.deletePhotoPaths(pid, [`projects/${pid}/PDF/map1`, `projects/${pid}/PHOTO/../PDF/map1`]);
    expect(failed).toBe(0);
    expect(await listRaw(`projects/${pid}/PDF`)).toEqual([`projects/${pid}/PDF/map1`]);
  });

  test('レイヤ定義の削除はレイヤの全データと写真フォルダを丸ごと消し、別のレイヤの写真は残す', async () => {
    const pid = await newProject();
    const a = await uploadWebPhoto(OWNER, pid, 'L', 'a');
    const b = await uploadWebPhoto(M1, pid, 'L', 'b');
    const other = await uploadWebPhoto(M1, pid, 'L2', 'other');
    await putData(pid, OWNER, 'L', 'PUBLIC', [rec('A', OWNER, [a])]);
    await putData(pid, M1, 'L', 'PRIVATE', [rec('B', M1, [b])]);
    await putData(pid, M1, 'L2', 'PUBLIC', [rec('C', M1, [other])]);
    // deleteLayerDefinition の手順（レイヤのデータを layerId だけの条件で消し、消せたらフォルダを消す）
    as(OWNER);
    expect((await projectStore.deleteData(pid, 'L')).isOK).toBe(true);
    expect((await projectStorage.deleteLayerPhotos(pid, 'L')).isOK).toBe(true);
    expect(await listRaw(`projects/${pid}/PHOTO`)).toEqual([photoPath(pid, 'L2', M1, other.id)]);
    const groups = await projectStore.downloadLayerDataGroups(pid, 'L');
    expect(groups.groups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// P-M7: プロジェクト削除で Storage も消える
// ---------------------------------------------------------------------------------------------
describe('P-M7: プロジェクト削除で Storage の写真・PDF・スタイル・辞書も消える', () => {
  const seedProjectFiles = async (pid: string) => {
    await seedRaw(photoPath(pid, 'L', OWNER, 'p1'));
    await seedRaw(photoPath(pid, 'L', M1, 'p2'));
    await seedRaw(photoPath(pid, 'L2', M2, 'p3'), 'image/png');
    await seedRaw(`projects/${pid}/PDF/map1`, 'application/pdf');
    await seedRaw(`projects/${pid}/STYLE/map2`, 'application/json');
    await seedRaw(`projects/${pid}/DICTIONARY/L/dictionary_v1.sqlite`, 'application/x-sqlite3');
    await seedRaw(`projects/${pid}/DICTIONARY/L/dictionary.sqlite`, 'application/x-sqlite3');
  };

  test('オーナーが削除すると projects/{id} 配下が全部消え、そのあと project doc も消せる。別のプロジェクトには触れない', async () => {
    const pid = await newProject();
    const other = await newProject();
    await seedProjectFiles(pid);
    await seedRaw(photoPath(other, 'L', OWNER, 'keep'));
    expect((await listRaw(`projects/${pid}`)).length).toBe(7);

    as(OWNER);
    // useRepository.deleteProject の順（Storage → doc）
    expect(await projectStorage.deleteProjectStorageData(pid)).toEqual({ isOK: true, message: '' });
    expect((await projectStore.deleteProject(pid)).isOK).toBe(true);

    expect(await listRaw(`projects/${pid}`)).toEqual([]);
    expect(await listRaw(`projects/${other}`)).toEqual([photoPath(other, 'L', OWNER, 'keep')]);
    let exists = true;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      exists = (await getDoc(doc(context.firestore(), `projects/${pid}`))).exists();
    });
    expect(exists).toBe(false);
  });

  test('Storage が空のプロジェクトでも成功する。deleteAllProjectStorageData は複数のプロジェクトを順に消す', async () => {
    const empty = await newProject();
    as(OWNER);
    expect((await projectStorage.deleteProjectStorageData(empty)).isOK).toBe(true);
    const p1 = await newProject();
    const p2 = await newProject();
    await seedProjectFiles(p1);
    await seedProjectFiles(p2);
    as(OWNER);
    expect((await projectStorage.deleteAllProjectStorageData([p1, p2])).isOK).toBe(true);
    expect(await listRaw(`projects/${p1}`)).toEqual([]);
    expect(await listRaw(`projects/${p2}`)).toEqual([]);
  });

  // 2026-11-23 の通しテストで見つかった不具合の再発防止: Storage Rules は管理者に projects/{id} 配下の一覧・削除を許す
  // （クラウドデータ管理・PDF/STYLE の掃除のため）ので、オーナーでない管理者が Storage → doc の順に進めると Storage だけ全部消え、
  // project doc の削除は Firestore Rules（オーナーのみ）で拒否されて、プロジェクトとデータが残る。
  // 修正: useRepository.deleteProject が先頭で canDeleteProject を確かめ、オーナー以外は Storage に触れずに失敗を返す
  // （削除ボタンもオーナーにだけ出す）
  test('オーナーでない管理者がプロジェクト削除（useRepository.deleteProject の順）を実行しても、削除は失敗し Storage のファイルは消えない', async () => {
    const pid = await newProject();
    await seedProjectFiles(pid);
    as(ADMIN2);
    // useRepository.deleteProject と同じ順（オーナー確認 → Storage → doc）。どれかが失敗したら止める
    const deleteProjectLike = async (project: { id: string; ownerUid: string }, uid: string) => {
      if (!canDeleteProject(project, uid)) return { isOK: false, message: 'ownerOnly' };
      const storageResult = await projectStorage.deleteProjectStorageData(project.id);
      return storageResult.isOK ? await projectStore.deleteProject(project.id) : storageResult;
    };
    const docResult = await deleteProjectLike({ id: pid, ownerUid: OWNER }, ADMIN2);
    expect(docResult).toEqual({ isOK: false, message: 'ownerOnly' });
    let exists = false;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      exists = (await getDoc(doc(context.firestore(), `projects/${pid}`))).exists();
    });
    expect(exists).toBe(true);
    // プロジェクトが残るなら、その写真・PDF なども残る
    expect((await listRaw(`projects/${pid}`)).length).toBe(7);

    // 確認を外すと（修正前の順）、Storage Rules は管理者の削除を通してしまう。クライアント側で止める必要がある理由
    const unguarded = await projectStorage.deleteProjectStorageData(pid);
    expect(unguarded.isOK).toBe(true);
    expect((await projectStore.deleteProject(pid)).isOK).toBe(false);
    expect(await listRaw(`projects/${pid}`)).toEqual([]);
  });

  test('一般メンバー・部外者は消せず（一覧が Rules で拒否される）、ファイルは1つも消えない', async () => {
    const pid = await newProject();
    await seedProjectFiles(pid);
    as(M1);
    expect((await projectStorage.deleteProjectStorageData(pid)).isOK).toBe(false);
    as(OUTSIDER);
    expect((await projectStorage.deleteProjectStorageData(pid)).isOK).toBe(false);
    expect((await listRaw(`projects/${pid}`)).length).toBe(7);
  });
});

// ---------------------------------------------------------------------------------------------
// P-M13 / P-M12: 自分の写真フォルダ以外の写真は上げない／他人のフォルダへの書き込みは Rules で拒否
// ---------------------------------------------------------------------------------------------
describe('P-M13・P-M12: 他人の写真を自分の名義で上げない', () => {
  test('他人のフォルダへの uploadPhoto は Rules で拒否される（メンバー・管理者とも）。自分のフォルダへは上がる', async () => {
    const pid = await newProject();
    mockPlatform.OS = 'web';
    const uri = `blob:mock/${ulid()}`;
    mockBlobs.set(uri, new Blob([bytesOf('x')], { type: 'image/jpeg' }));
    as(M1);
    const toOther = await projectStorage.uploadPhoto(pid, 'L', M2, 'px', uri, 'x.jpg');
    expect(toOther.isOK).toBe(false);
    as(OWNER);
    const adminToMember = await projectStorage.uploadPhoto(pid, 'L', M1, 'py', uri, 'x.jpg');
    expect(adminToMember.isOK).toBe(false);
    as(M1);
    const own = await projectStorage.uploadPhoto(pid, 'L', M1, 'pz', uri, 'x.jpg');
    expect(own.isOK).toBe(true);
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual([photoPath(pid, 'L', M1, 'pz')]);
  });

  test('ネイティブ: 他のメンバーの記録の uri（自分の写真フォルダの外・LOCAL）は、読めても上げない。自分の写真は上げる', async () => {
    const pid = await newProject();
    mockPlatform.OS = 'android';
    // 他のメンバーが ZIP から取り込んだ写真の uri が、自分の端末の LOCAL の写真と同じ文字列になった場面
    const sharedLocal = `${PHOTO_FOLDER}/LOCAL/L/OWNER/EMAP_20261123_101010.jpg`;
    writeLocal(sharedLocal, bytesOf('my-private-photo'));
    const otherFolder = `${PHOTO_FOLDER}/${pid}/L/${M2}/EMAP_20261123_101011.jpg`;
    writeLocal(otherFolder, bytesOf('m2'));
    const ownUri = `${PHOTO_FOLDER}/${pid}/L/${OWNER}/EMAP_20261123_101012_ABCDEF.jpg`;
    writeLocal(ownUri, bytesOf('own'));
    const ph = (id: string, uri: string): PhotoType => ({ id, name: nodePath.basename(uri), uri, url: null, key: null, width: 1, height: 1, thumbnail: null });

    as(OWNER);
    const uploaded: UploadedPhotosPayload['records'] = {};
    // COMMON の統合: 送るときは自分の名義に書き換えるが、写真の判定は書き換える前の名義（M2）で行う
    const fromM2 = rec('R2', OWNER, [ph('pLocal', sharedLocal), ph('pOther', otherFolder)]);
    const out2 = await updateStoragePhotoReplica(fromM2, pid, 'L', OWNER, uploaded, { userId: M2 });
    // 引き継いだ記録の LOCAL も上げない
    const takenOver = rec('R3', OWNER, [ph('pTaken', sharedLocal)], { takenOverFrom: [M2] } as Partial<RecordType>);
    const out3 = await updateStoragePhotoReplica(takenOver, pid, 'L', OWNER, uploaded);
    const own = rec('R1', OWNER, [ph('pOwn', ownUri)]);
    const out1 = await updateStoragePhotoReplica(own, pid, 'L', OWNER, uploaded);

    expect((out2.field.photo as PhotoType[]).map((p) => p.url)).toEqual([null, null]);
    expect((out3.field.photo as PhotoType[])[0].url).toBeNull();
    expect((out1.field.photo as PhotoType[])[0].url).not.toBeNull();
    expect(Object.keys(uploaded)).toEqual(['R1']);
    expect(await listRaw(`projects/${pid}/PHOTO/L`)).toEqual([photoPath(pid, 'L', OWNER, 'pOwn')]);
  });

  test('Web: 他人の名義の記録の blob: は上げない', async () => {
    const pid = await newProject();
    mockPlatform.OS = 'web';
    const uri = `blob:mock/${ulid()}`;
    mockBlobs.set(uri, new Blob([bytesOf('w')], { type: 'image/jpeg' }));
    expect(isOwnUploadablePhotoUri(uri, pid, 'L', OWNER, { platform: 'web', record: { userId: M1 } })).toBe(false);
    expect(isOwnUploadablePhotoUri(uri, pid, 'L', OWNER, { platform: 'web', record: { userId: OWNER } })).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// P-M16: 写真が上がった時点で url/key を手元へ反映し、データの書き込みに失敗しても上げ直さない
// ---------------------------------------------------------------------------------------------
describe('P-M16: データの書き込みに失敗しても写真は上げ直さない', () => {
  test('写真は上がりデータは別端末の更新で書けなかった → 手元に url/key が残り、やり直しで写真を送らず、他のメンバーが取得できる', async () => {
    const pid = await newProject();
    mockPlatform.OS = 'web';
    const photoId = ulid();
    const uri = `blob:mock/${photoId}`;
    mockBlobs.set(uri, new Blob([bytesOf('field-photo')], { type: 'image/jpeg' }));
    const photo: PhotoType = { id: photoId, name: `EMAP_20261123_120000_${photoId.slice(-6)}.jpg`, uri, url: null, key: null, width: 1, height: 1, thumbnail: null };
    let state: DataType[] = [{ layerId: 'L', userId: M1, data: [rec('R1', M1, [photo])] }];

    // 1回目: 判定に使ったクラウドの版（なし）のあとに別の端末が書いた → staleExpectation で失敗
    await putData(pid, M1, 'L', 'PUBLIC', [rec('X', M1, [])]);
    as(M1);
    const uploaded: UploadedPhotosPayload['records'] = {};
    const toSend = await Promise.all(state[0].data.map((r) => updateStoragePhotoReplica(r, pid, 'L', M1, uploaded)));
    state = dataSetReducer(state, applyUploadedPhotosAction({ layerId: 'L', records: uploaded }));
    const first = await projectStore.uploadDataHelper(
      pid,
      { layerId: 'L', userId: M1, permission: 'PUBLIC', data: toSend } as never,
      { expected: { encryptedAt: undefined } }
    );
    expect(first.isOK).toBe(false);
    expect(first.staleExpectation).toBe(true);
    const path = photoPath(pid, 'L', M1, photoId);
    const meta1 = await metaRaw(path);
    expect(mockUploadLog.filter((p) => p === path)).toHaveLength(1);

    // 手元の記録には url/key が入り、uri は残る
    const local = state[0].data[0].field.photo as PhotoType[];
    expect(local[0].url).toBe(uploaded.R1[photoId].url);
    expect(local[0].key).toBe(uploaded.R1[photoId].key);
    expect(local[0].uri).toBe(uri);

    // 2回目（やり直し）: 写真は送らず、データだけ書ける
    const uploaded2: UploadedPhotosPayload['records'] = {};
    const toSend2 = await Promise.all(state[0].data.map((r) => updateStoragePhotoReplica(r, pid, 'L', M1, uploaded2)));
    expect(uploaded2).toEqual({});
    const second = await projectStore.uploadDataHelper(pid, { layerId: 'L', userId: M1, permission: 'PUBLIC', data: toSend2 } as never);
    expect(second.isOK).toBe(true);
    expect(mockUploadLog.filter((p) => p === path)).toHaveLength(1);
    expect((await metaRaw(path)).generation).toBe(meta1.generation);

    // 別のメンバーが取得すると、記録の url/key で写真を復号できる
    as(M2);
    const pub = await projectStore.downloadPublicData(pid);
    const got = (pub.data ?? []).find((d) => d.userId === M1)!.data.find((r) => r.id === 'R1')!;
    const gotPhoto = (got.field.photo as PhotoType[])[0];
    const fetched = await projectStorage.fetchPhoto(gotPhoto.url!, gotPhoto.key!);
    expect(fetched.isOK).toBe(true);
    const blob = resolveObjectURL(fetched.data as string);
    expect(sameBytes(await blob!.arrayBuffer(), bytesOf('field-photo'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// P-L6: 上げる前に外した写真の印はクラウドに上がらない
// ---------------------------------------------------------------------------------------------
describe('P-L6: 未アップロードの写真を外した印（uri:undefined, url:null）はクラウドに上がらない', () => {
  test('以前の版が残した印も、次のアップロードで取り除かれ、他のメンバーには見えない項目が届かない', async () => {
    const pid = await newProject();
    const real = await uploadWebPhoto(M1, pid, 'L', 'real');
    const marker: PhotoType = { id: ulid(), name: 'gone.jpg', uri: undefined, url: null, key: null, width: 1, height: 1, thumbnail: 'data:image/jpeg;base64,AAAA' };
    // 以前の版で印ごと上がっていた
    await putData(pid, M1, 'L', 'PUBLIC', [rec('R1', M1, [{ ...real, uri: 'blob:x' }, marker])]);
    as(M2);
    const before = await projectStore.downloadPublicData(pid);
    expect(((before.data ?? [])[0].data[0].field.photo as PhotoType[]).length).toBe(2);

    // 次のアップロード
    mockPlatform.OS = 'web';
    as(M1);
    const uploaded: UploadedPhotosPayload['records'] = {};
    const cleaned = await updateStoragePhotoReplica(rec('R1', M1, [{ ...real, uri: 'blob:x' }, marker]), pid, 'L', M1, uploaded);
    await putData(pid, M1, 'L', 'PUBLIC', [cleaned]);
    expect(uploaded).toEqual({});
    as(M2);
    const after = await projectStore.downloadPublicData(pid);
    const photos = (after.data ?? [])[0].data[0].field.photo as PhotoType[];
    expect(photos.map((p) => p.id)).toEqual([real.id]);
  });
});

// ---------------------------------------------------------------------------------------------
// P-L15: ダウンロード時の名前の衝突回避
// ---------------------------------------------------------------------------------------------
describe('P-L15: 同じ名前の別の写真を取り違えずに取得する', () => {
  const OLD_NAME = 'EMAP_20261123_101010.jpg'; // 以前の秒単位の名前

  /** useRepository.downloadPhoto の1枚分（photoDownloadTarget → projectStorage.downloadPhoto） */
  const downloadOne = async (pid: string, uid: string, recordUserId: string, photo: PhotoType, localDataSet: DataType[]) => {
    mockPlatform.OS = 'ios';
    as(uid);
    const target = photoDownloadTarget({
      projectId: pid,
      layerId: 'L',
      ownUid: uid,
      recordUserId,
      photoId: photo.id,
      photoName: photo.name,
      photoUrl: photo.url,
      localPhotoUri: findLocalPhotoUri(localDataSet, 'L', photo.id),
    });
    expect(target).toBeDefined();
    return projectStorage.downloadPhoto(photo.url!, photo.key!, target!.filename, target!.folder, {
      photoId: photo.id,
      reuseExisting: target!.reuseExisting,
    });
  };

  test('同じアカウントの別端末で同じ秒に撮った写真は、手元の同名の写真を使い回さず id 付きの名前で取得する', async () => {
    const pid = await newProject();
    // 端末A が撮って上げた写真
    const fromA = await uploadWebPhoto(M1, pid, 'L', 'device-A', { name: OLD_NAME });
    // 端末B には同じ名前の自分の写真（別の id）がある
    const idB = ulid();
    const folder = `${PHOTO_FOLDER}/${pid}/L/${M1}`;
    writeLocal(`${folder}/${OLD_NAME}`, bytesOf('device-B'));
    const localDataSet: DataType[] = [
      { layerId: 'L', userId: M1, data: [rec('RB', M1, [{ id: idB, name: OLD_NAME, uri: `${folder}/${OLD_NAME}`, url: null, key: null, width: 1, height: 1, thumbnail: null }])] },
    ];
    const res = await downloadOne(pid, M1, M1, fromA, localDataSet);
    expect(res.isOK).toBe(true);
    expect(res.uri).toBe(`${folder}/${fromA.id}_${OLD_NAME}`);
    expect(sameBytes(readLocal(res.uri!), bytesOf('device-A'))).toBe(true);
    // 端末B の写真は上書きされない
    expect(sameBytes(readLocal(`${folder}/${OLD_NAME}`), bytesOf('device-B'))).toBe(true);
  });

  test('手元の記録が同じ id で同じファイルを指していると確かめられたときは、取得せずに使い回す', async () => {
    const pid = await newProject();
    const mine = await uploadWebPhoto(M1, pid, 'L', 'cloud-copy', { name: OLD_NAME });
    const folder = `${PHOTO_FOLDER}/${pid}/L/${M1}`;
    writeLocal(`${folder}/${OLD_NAME}`, bytesOf('local-original'));
    const localDataSet: DataType[] = [{ layerId: 'L', userId: M1, data: [rec('R', M1, [{ ...mine, uri: `${folder}/${OLD_NAME}` }])] }];
    const res = await downloadOne(pid, M1, M1, mine, localDataSet);
    expect(res.uri).toBe(`${folder}/${OLD_NAME}`);
    expect(sameBytes(readLocal(res.uri!), bytesOf('local-original'))).toBe(true);
    expect(nodeFs.existsSync(localPath(`${folder}/${mine.id}_${OLD_NAME}`))).toBe(false);
  });

  test('他のメンバーが撮った同名の写真は、その人のフォルダに id 付きの名前で取得し、自分の写真と混ざらない', async () => {
    const pid = await newProject();
    const m2photo = await uploadWebPhoto(M2, pid, 'L', 'member-2', { name: OLD_NAME });
    const ownFolder = `${PHOTO_FOLDER}/${pid}/L/${M1}`;
    writeLocal(`${ownFolder}/${OLD_NAME}`, bytesOf('mine'));
    const res = await downloadOne(pid, M1, M2, m2photo, []);
    expect(res.isOK).toBe(true);
    expect(res.uri).toBe(`${PHOTO_FOLDER}/${pid}/L/${M2}/${m2photo.id}_${OLD_NAME}`);
    expect(sameBytes(readLocal(res.uri!), bytesOf('member-2'))).toBe(true);
    expect(sameBytes(readLocal(`${ownFolder}/${OLD_NAME}`), bytesOf('mine'))).toBe(true);
  });

  test('取得の一時ファイル（暗号文）はキャッシュに残らない（P-M11）', async () => {
    const pid = await newProject();
    const p = await uploadWebPhoto(M1, pid, 'L', 'tmp', { name: `EMAP_20261123_101010_${ulid().slice(-6)}.jpg` });
    const before = nodeFs.readdirSync(`${mockRoot()}/cache`).filter((f) => /^photo_[0-9A-Z]{26}$/.test(f)).length;
    const res = await downloadOne(pid, M1, M1, p, []);
    expect(res.isOK).toBe(true);
    const after = nodeFs.readdirSync(`${mockRoot()}/cache`).filter((f) => /^photo_[0-9A-Z]{26}$/.test(f)).length;
    expect(after).toBe(before);
  });
});
