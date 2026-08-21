import { DataType, LayerType, RecordType } from '../../types';
import {
  createViewshedLayer,
  ensureViewshedLayers,
  getViewshedAttribution,
  VIEWSHED_CIRCLE_LAYER_ID,
  VIEWSHED_LAYER_ID,
  VIEWSHED_POINT_LAYER_ID,
} from '../viewshedLayers';

const polygonRecord = (override: Partial<RecordType> = {}): RecordType =>
  ({
    id: 'record1',
    userId: 'user1',
    displayName: 'user',
    visible: true,
    redraw: false,
    coords: [],
    field: {},
    ...override,
  } as RecordType);

const dataSet = (data: RecordType[], layerId = VIEWSHED_LAYER_ID): DataType[] => [
  { layerId, userId: 'user1', data },
];

describe('ensureViewshedLayers', () => {
  it('可視領域の3レイヤを補完する', () => {
    const layers = ensureViewshedLayers([]);
    expect(layers.map((l) => l.id)).toEqual([VIEWSHED_LAYER_ID, VIEWSHED_CIRCLE_LAYER_ID, VIEWSHED_POINT_LAYER_ID]);
  });

  it('既存のレイヤは置き換えない', () => {
    const existing: LayerType = { ...createViewshedLayer(), name: 'カスタム名' };
    const layers = ensureViewshedLayers([existing]);
    expect(layers.filter((l) => l.id === VIEWSHED_LAYER_ID)).toHaveLength(1);
    expect(layers.find((l) => l.id === VIEWSHED_LAYER_ID)?.name).toBe('カスタム名');
  });
});

describe('getViewshedAttribution', () => {
  it('可視領域を表示中なら出典を返す', () => {
    const attribution = getViewshedAttribution([createViewshedLayer()], dataSet([polygonRecord()]));
    expect(attribution).toBeDefined();
    expect(attribution).not.toBe('');
  });

  it('レイヤがなければ返さない', () => {
    expect(getViewshedAttribution([], dataSet([polygonRecord()]))).toBeUndefined();
  });

  it('レイヤが非表示なら返さない', () => {
    const layer = { ...createViewshedLayer(), visible: false };
    expect(getViewshedAttribution([layer], dataSet([polygonRecord()]))).toBeUndefined();
  });

  it('データがなければ返さない', () => {
    expect(getViewshedAttribution([createViewshedLayer()], dataSet([]))).toBeUndefined();
  });

  it('非表示・削除済みのデータだけなら返さない', () => {
    const records = [polygonRecord({ visible: false }), polygonRecord({ id: 'record2', deleted: true })];
    expect(getViewshedAttribution([createViewshedLayer()], dataSet(records))).toBeUndefined();
  });

  it('他レイヤのデータでは返さない', () => {
    expect(getViewshedAttribution([createViewshedLayer()], dataSet([polygonRecord()], 'other'))).toBeUndefined();
  });
});
