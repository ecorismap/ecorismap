import { combineReducers, configureStore } from '@reduxjs/toolkit';

// MMKVのstorageをMapベースのフェイクに差し替える
const mockKvStore = new Map<string, string>();
jest.mock('../mmkvStorage', () => ({
  storage: {
    contains: (key: string) => mockKvStore.has(key),
    getString: (key: string) => mockKvStore.get(key),
    set: (key: string, value: string) => {
      mockKvStore.set(key, value);
    },
    remove: (key: string) => {
      mockKvStore.delete(key);
    },
  },
}));

import {
  migrateDataSetFromPersistRoot,
  loadPersistedDataSet,
  attachDataSetPersistSubscriber,
  dataSetExcludingReconciler,
} from '../dataSetStorage';
import dataSetReducer, { setDataSetAction } from '../../modules/dataSet';
import { DataType } from '../../types';

const DATASET_KEY = 'persist:dataSet';
const ROOT_KEY = 'persist:root';

const sampleDataSet: DataType[] = [
  { layerId: 'layer1', userId: undefined, data: [] },
  { layerId: 'layer2', userId: 'user1', data: [] },
];

// persist:rootの実形式: トップレベルキーごとに個別JSON.stringifyされたレコード
const makePersistRoot = (dataSet?: DataType[]) => {
  const record: Record<string, string> = {
    layers: JSON.stringify([]),
    settings: JSON.stringify({ mapRegion: {} }),
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  };
  if (dataSet !== undefined) {
    record.dataSet = JSON.stringify(dataSet);
  }
  return JSON.stringify(record);
};

beforeEach(() => {
  mockKvStore.clear();
});

describe('migrateDataSetFromPersistRoot', () => {
  it('persist:rootのdataSetを専用キーへそのままコピーする', () => {
    mockKvStore.set(ROOT_KEY, makePersistRoot(sampleDataSet));
    migrateDataSetFromPersistRoot();
    expect(mockKvStore.get(DATASET_KEY)).toBe(JSON.stringify(sampleDataSet));
    // persist:rootは非破壊
    expect(mockKvStore.get(ROOT_KEY)).toBe(makePersistRoot(sampleDataSet));
  });

  it('冪等: persist:dataSetが既にあれば上書きしない', () => {
    mockKvStore.set(DATASET_KEY, JSON.stringify(sampleDataSet));
    mockKvStore.set(ROOT_KEY, makePersistRoot([]));
    migrateDataSetFromPersistRoot();
    expect(mockKvStore.get(DATASET_KEY)).toBe(JSON.stringify(sampleDataSet));
  });

  it('persist:rootが無ければキーを作らない', () => {
    migrateDataSetFromPersistRoot();
    expect(mockKvStore.has(DATASET_KEY)).toBe(false);
  });

  it('persist:rootにdataSetキーが無ければキーを作らない', () => {
    mockKvStore.set(ROOT_KEY, makePersistRoot(undefined));
    migrateDataSetFromPersistRoot();
    expect(mockKvStore.has(DATASET_KEY)).toBe(false);
  });

  it('persist:rootが破損JSONでも例外を投げずキーを作らない', () => {
    mockKvStore.set(ROOT_KEY, '{broken json');
    expect(() => migrateDataSetFromPersistRoot()).not.toThrow();
    expect(mockKvStore.has(DATASET_KEY)).toBe(false);
  });
});

describe('loadPersistedDataSet', () => {
  it('有効な配列を返す', () => {
    mockKvStore.set(DATASET_KEY, JSON.stringify(sampleDataSet));
    expect(loadPersistedDataSet()).toEqual(sampleDataSet);
  });

  it('キーが無ければundefined', () => {
    expect(loadPersistedDataSet()).toBeUndefined();
  });

  it('破損JSONならundefined', () => {
    mockKvStore.set(DATASET_KEY, '{broken');
    expect(loadPersistedDataSet()).toBeUndefined();
  });

  it('配列以外ならundefined', () => {
    mockKvStore.set(DATASET_KEY, JSON.stringify({ not: 'array' }));
    expect(loadPersistedDataSet()).toBeUndefined();
  });
});

describe('dataSetExcludingReconciler', () => {
  const config = { debug: false } as any;

  it('REHYDRATE流入のdataSetを除外し、他のキーはマージする', () => {
    const preloaded = [{ layerId: 'migrated', userId: undefined, data: [] }];
    const reducedState = { dataSet: preloaded, layers: ['initial'] };
    const inbound = { dataSet: [{ layerId: 'stale', userId: undefined, data: [] }], layers: ['persisted'] };

    const result = dataSetExcludingReconciler(inbound, reducedState, reducedState, config);
    // dataSetは流入せずpreloadedState（移行済み値）が保たれる
    expect(result.dataSet).toBe(preloaded);
    // 他のキーは通常どおりrehydrateされる
    expect(result.layers).toEqual(['persisted']);
  });

  it('inboundにdataSetが無い場合はそのままマージする', () => {
    const reducedState = { dataSet: [], layers: ['initial'] };
    const inbound = { layers: ['persisted'] };
    const result = dataSetExcludingReconciler(inbound, reducedState, reducedState, config);
    expect(result.layers).toEqual(['persisted']);
  });
});

describe('attachDataSetPersistSubscriber', () => {
  const createTestStore = () =>
    configureStore({
      reducer: combineReducers({ dataSet: dataSetReducer }),
      middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
    });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('dataSetの変更が1000ms後に書き込まれる', () => {
    const store = createTestStore();
    attachDataSetPersistSubscriber(store);

    store.dispatch(setDataSetAction(sampleDataSet));
    expect(mockKvStore.has(DATASET_KEY)).toBe(false);

    jest.advanceTimersByTime(1000);
    expect(mockKvStore.get(DATASET_KEY)).toBe(JSON.stringify(sampleDataSet));
  });

  it('スロットル窓内の連続変更は最新stateの1回書き込みになる', () => {
    const store = createTestStore();
    attachDataSetPersistSubscriber(store);

    store.dispatch(setDataSetAction([{ layerId: 'a', userId: undefined, data: [] }]));
    jest.advanceTimersByTime(500);
    store.dispatch(setDataSetAction(sampleDataSet));
    jest.advanceTimersByTime(500);

    // 最初の変更から1000msで発火し、その時点の最新stateが書かれる
    expect(mockKvStore.get(DATASET_KEY)).toBe(JSON.stringify(sampleDataSet));
  });

  it('dataSetが変わらなければ書き込まない', () => {
    const store = createTestStore();
    attachDataSetPersistSubscriber(store);

    // dataSetを変更しないアクション
    store.dispatch({ type: 'unrelated/action' });
    jest.advanceTimersByTime(2000);
    expect(mockKvStore.has(DATASET_KEY)).toBe(false);
  });

  it('書き込み後、さらに変更があれば再度書き込まれる', () => {
    const store = createTestStore();
    attachDataSetPersistSubscriber(store);

    store.dispatch(setDataSetAction(sampleDataSet));
    jest.advanceTimersByTime(1000);

    const updated: DataType[] = [{ layerId: 'layer3', userId: undefined, data: [] }];
    store.dispatch(setDataSetAction(updated));
    jest.advanceTimersByTime(1000);
    expect(mockKvStore.get(DATASET_KEY)).toBe(JSON.stringify(updated));
  });
});
