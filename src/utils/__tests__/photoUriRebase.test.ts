import { applyPhotoUriRebase, collectRebaseCandidates, rebasePhotoUri, runPhotoUriRebaseWith } from '../photoUriRebase';
import { DataType, PhotoType } from '../../types';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  getInfoAsync: jest.fn(),
}));

const OLD = 'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/projects';
const NEW = 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/projects';
const REL = 'LOCAL/layer1/OWNER/EMAP_1.jpeg';

const photo = (id: string, uri: PhotoType['uri']): PhotoType => ({
  id,
  name: `${id}.jpeg`,
  uri,
  url: null,
  key: null,
  width: 1,
  height: 1,
  thumbnail: null,
});

const dataSetOf = (...photos: PhotoType[]): DataType[] => [
  {
    layerId: 'layer1',
    userId: undefined,
    data: [
      {
        id: 'r1',
        userId: undefined,
        displayName: null,
        visible: true,
        redraw: false,
        coords: undefined,
        field: { name: 'a', count: 1, photo: photos },
      },
    ],
  },
];

const createStore = (dataSet: DataType[]) => {
  const state = { dataSet };
  const dispatch = jest.fn((action: { type: string; payload: DataType[] }) => {
    state.dataSet = action.payload;
    return action;
  });
  return { store: { getState: () => state as never, dispatch: dispatch as never }, state, dispatch };
};

describe('rebasePhotoUri', () => {
  it('別コンテナの写真フォルダを指すuriを、現在の写真フォルダの同じ相対パスへ付け替える', () => {
    expect(rebasePhotoUri(`${OLD}/${REL}`, NEW)).toBe(`${NEW}/${REL}`);
  });

  it('すでに現在の写真フォルダ配下なら対象外', () => {
    expect(rebasePhotoUri(`${NEW}/${REL}`, NEW)).toBeUndefined();
  });

  it('iOSの写真フォルダ形式でないuri・空値は対象外', () => {
    expect(rebasePhotoUri('file:///data/user/0/jp.co.ecoris.ecorismap/files/projects/a.jpeg', NEW)).toBeUndefined();
    expect(rebasePhotoUri('ph://ABC', NEW)).toBeUndefined();
    expect(rebasePhotoUri(null, NEW)).toBeUndefined();
    expect(rebasePhotoUri(undefined, NEW)).toBeUndefined();
  });

  it('付け替え後が写真フォルダの外を指すものは対象外', () => {
    expect(rebasePhotoUri(`${OLD}/../SQLite/db`, NEW)).toBeUndefined();
    expect(rebasePhotoUri(`${OLD}/a%2f..%2f..%2fmmkv`, NEW)).toBeUndefined();
  });
});

describe('collectRebaseCandidates / applyPhotoUriRebase', () => {
  it('候補だけを集め、対応表にあるuriだけを書き換える', () => {
    const dataSet = dataSetOf(photo('p1', `${OLD}/${REL}`), photo('p2', `${NEW}/x.jpeg`), photo('p3', undefined));
    const candidates = collectRebaseCandidates(dataSet, NEW);
    expect([...candidates]).toEqual([[`${OLD}/${REL}`, `${NEW}/${REL}`]]);

    const updated = applyPhotoUriRebase(dataSet, candidates);
    const photos = updated[0].data[0].field.photo as PhotoType[];
    expect(photos.map((p) => p.uri)).toEqual([`${NEW}/${REL}`, `${NEW}/x.jpeg`, undefined]);
    expect(updated[0].data[0].field.name).toBe('a');
    // 元のdataSetは書き換えない
    expect((dataSet[0].data[0].field.photo as PhotoType[])[0].uri).toBe(`${OLD}/${REL}`);
  });

  it('変更が無ければ同じ参照を返す', () => {
    const dataSet = dataSetOf(photo('p1', `${NEW}/${REL}`));
    expect(applyPhotoUriRebase(dataSet, new Map())).toBe(dataSet);
    expect(applyPhotoUriRebase(dataSet, new Map([['file:///other', 'file:///x']]))).toBe(dataSet);
  });
});

describe('runPhotoUriRebaseWith', () => {
  it('付け替え先に実ファイルがある写真だけ書き換える', async () => {
    const { store, state, dispatch } = createStore(
      dataSetOf(photo('mine', `${OLD}/${REL}`), photo('others', `${OLD}/proj/layer/uid/other.jpeg`))
    );
    const exists = jest.fn(async (uri: string) => uri === `${NEW}/${REL}`);
    await expect(runPhotoUriRebaseWith(store, NEW, exists)).resolves.toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const photos = state.dataSet[0].data[0].field.photo as PhotoType[];
    expect(photos.map((p) => p.uri)).toEqual([`${NEW}/${REL}`, `${OLD}/proj/layer/uid/other.jpeg`]);
  });

  it('候補が無い・実ファイルが無い・確認に失敗したときはdispatchしない', async () => {
    const none = createStore(dataSetOf(photo('p1', `${NEW}/${REL}`)));
    const exists = jest.fn(async () => true);
    await expect(runPhotoUriRebaseWith(none.store, NEW, exists)).resolves.toBe(0);
    expect(exists).not.toHaveBeenCalled();
    expect(none.dispatch).not.toHaveBeenCalled();

    const missing = createStore(dataSetOf(photo('p1', `${OLD}/${REL}`)));
    await expect(runPhotoUriRebaseWith(missing.store, NEW, async () => false)).resolves.toBe(0);
    expect(missing.dispatch).not.toHaveBeenCalled();

    const failing = createStore(dataSetOf(photo('p1', `${OLD}/${REL}`)));
    await expect(runPhotoUriRebaseWith(failing.store, NEW, () => Promise.reject(new Error('x')))).resolves.toBe(0);
    expect(failing.dispatch).not.toHaveBeenCalled();
  });

  it('存在確認の間に追加されたレコードを消さない', async () => {
    const { store, state } = createStore(dataSetOf(photo('p1', `${OLD}/${REL}`)));
    const exists = jest.fn(async () => {
      state.dataSet = [...state.dataSet, { layerId: 'layer2', userId: undefined, data: [] }];
      return true;
    });
    await runPhotoUriRebaseWith(store, NEW, exists);
    expect(state.dataSet.map((d) => d.layerId)).toEqual(['layer1', 'layer2']);
    expect((state.dataSet[0].data[0].field.photo as PhotoType[])[0].uri).toBe(`${NEW}/${REL}`);
  });
});
