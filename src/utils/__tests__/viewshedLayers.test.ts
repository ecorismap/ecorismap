import { DataType, LayerType, RecordType } from '../../types';
import {
  createViewshedLayer,
  getViewshedAttribution,
  missingViewshedLayers,
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

describe('missingViewshedLayers', () => {
  it('受信データにある可視領域レイヤIDだけを補完する', () => {
    const layers = missingViewshedLayers([], [VIEWSHED_LAYER_ID, VIEWSHED_POINT_LAYER_ID, 'other']);
    expect(layers.map((l) => l.id)).toEqual([VIEWSHED_LAYER_ID, VIEWSHED_POINT_LAYER_ID]);
  });

  it('可視領域データがなければ何も補完しない', () => {
    expect(missingViewshedLayers([], ['other1', 'other2'])).toEqual([]);
    expect(missingViewshedLayers([], [])).toEqual([]);
  });

  it('既存のレイヤは補完対象にしない', () => {
    const existing: LayerType = { ...createViewshedLayer(), name: 'カスタム名' };
    const layers = missingViewshedLayers([existing], [VIEWSHED_LAYER_ID, VIEWSHED_CIRCLE_LAYER_ID]);
    expect(layers.map((l) => l.id)).toEqual([VIEWSHED_CIRCLE_LAYER_ID]);
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
