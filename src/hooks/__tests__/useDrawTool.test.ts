// i18nモックを最初に設定
jest.mock('../../i18n/config', () => ({
  __esModule: true,
  default: { language: 'en', t: jest.fn((key: string) => key) },
  i18n: { language: 'en', t: jest.fn((key: string) => key) },
  t: jest.fn((key: string) => key),
}));

// Coordsのモック（座標変換は恒等変換にして決定的にする）
jest.mock('../../utils/Coords', () => ({
  latLonObjectsToXYArray: jest.fn((objs: { longitude: number; latitude: number }[]) =>
    objs.map((o) => [o.longitude, o.latitude])
  ),
  latLonObjectsToLatLonArray: jest.fn((objs: { longitude: number; latitude: number }[]) =>
    objs.map((o) => [o.longitude, o.latitude])
  ),
  latlonArrayToLatLonObjects: jest.fn((arr: [number, number][]) =>
    arr.map(([lon, lat]) => ({ longitude: lon, latitude: lat }))
  ),
  xyArrayToLatLonArray: jest.fn((xy: [number, number][]) => xy.map((p) => [...p])),
  latLonArrayToXYArray: jest.fn((latlon: [number, number][]) => latlon.map((p) => [...p])),
  xyToLatLon: jest.fn((xy: [number, number]) => [...xy]),
  calcDegreeRadius: jest.fn(() => 0.001),
  selectPointFeatureByLatLon: jest.fn(() => undefined),
  selectLineFeatureByLatLon: jest.fn(() => undefined),
  selectPolygonFeatureByLatLon: jest.fn(() => undefined),
  selectPointFeaturesByArea: jest.fn(() => []),
  selectLineFeaturesByArea: jest.fn(() => []),
  selectPolygonFeaturesByArea: jest.fn(() => []),
  isValidPoint: jest.fn((xy: unknown[]) => xy.length === 1),
  isValidLine: jest.fn((xy: unknown[]) => xy.length >= 2),
  isValidPolygon: jest.fn((latlon: unknown[]) => latlon.length >= 4),
  calcCentroid: jest.fn(() => ({ longitude: 0, latitude: 0 })),
  calcLineMidPoint: jest.fn(() => ({ longitude: 0, latitude: 0 })),
  checkDistanceFromLine: jest.fn(() => ({ isNear: false, distance: 9999 })),
  findNearNodeIndex: jest.fn(() => -1),
  getSnappedPositionWithLine: jest.fn(() => ({ position: [0, 0], distance: 0, index: 0 })),
  isClosedPolygon: jest.fn(
    (xy: [number, number][]) =>
      xy.length > 2 && xy[0][0] === xy[xy.length - 1][0] && xy[0][1] === xy[xy.length - 1][1]
  ),
  isNearWithPlot: jest.fn(() => false),
  modifyLine: jest.fn(() => []),
  simplify: jest.fn((xy: [number, number][]) => xy),
  smoothingByBezier: jest.fn((xy: [number, number][]) => xy),
}));

// useRecordのモック（テストから差し替え可能にする）
const mockAddRecord = jest.fn();
const mockUpdateRecord = jest.fn();
const mockGenerateRecord = jest.fn();
const mockFindLayer = jest.fn();
const mockFindRecord = jest.fn();
const mockGetEditableLayerAndRecordSetWithCheck = jest.fn();
const mockPointDataSet: { layerId: string; userId: string; data: unknown[] }[] = [];
const mockLineDataSet: { layerId: string; userId: string; data: unknown[] }[] = [];
const mockPolygonDataSet: { layerId: string; userId: string; data: unknown[] }[] = [];
jest.mock('../useRecord', () => ({
  useRecord: () => ({
    dataUser: { uid: 'user1', displayName: 'tester' },
    pointDataSet: mockPointDataSet,
    lineDataSet: mockLineDataSet,
    polygonDataSet: mockPolygonDataSet,
    addRecord: mockAddRecord,
    updateRecord: mockUpdateRecord,
    getEditableLayerAndRecordSetWithCheck: mockGetEditableLayerAndRecordSetWithCheck,
    generateRecord: mockGenerateRecord,
    findLayer: mockFindLayer,
    findRecord: mockFindRecord,
  }),
}));

// useWindowのモック
// 注意: mapSize/mapRegionは毎回同じ参照を返すこと。
// 参照が変わるとuseDrawTool内のuseEffectが再実行され、xyがlatlonから再計算されてしまう。
const mockMapSize = { width: 800, height: 600 };
const mockMapRegion = {
  latitude: 35,
  longitude: 135,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
  zoom: 15,
};
jest.mock('../useWindow', () => ({
  useWindow: () => ({
    mapSize: mockMapSize,
    mapRegion: mockMapRegion,
  }),
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import React from 'react';
import { GestureResponderEvent } from 'react-native';
import { useDrawTool } from '../useDrawTool';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import userReducer from '../../modules/user';
import settingsReducer from '../../modules/settings';
import projectsReducer from '../../modules/projects';
import tileMapsReducer from '../../modules/tileMaps';
import {
  selectLineFeatureByLatLon,
  selectPointFeatureByLatLon,
  isNearWithPlot,
} from '../../utils/Coords';
import { LayerType, LineRecordType, PointRecordType, RecordType } from '../../types';

const mockLineLayer = {
  id: 'layer1',
  name: 'ラインレイヤー',
  type: 'LINE',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.8,
    color: '#FF0000',
    fieldName: '',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
  },
  label: '',
  visible: true,
  active: true,
  field: [],
} as unknown as LayerType;

const mockPointLayer = {
  ...mockLineLayer,
  id: 'layer2',
  name: 'ポイントレイヤー',
  type: 'POINT',
} as unknown as LayerType;

const mockLineRecord = {
  id: 'line-record-1',
  userId: 'user1',
  displayName: 'tester',
  visible: true,
  redraw: false,
  coords: [
    { latitude: 35.0, longitude: 135.0 },
    { latitude: 35.001, longitude: 135.001 },
  ],
  field: {},
} as unknown as LineRecordType;

const mockPointRecord = {
  id: 'point-record-1',
  userId: 'user1',
  displayName: 'tester',
  visible: true,
  redraw: false,
  coords: { latitude: 35.0, longitude: 135.0 },
  field: {},
} as unknown as PointRecordType;

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      dataSet: dataSetReducer,
      layers: layersReducer,
      user: userReducer,
      settings: settingsReducer,
      projects: projectsReducer,
      tileMaps: tileMapsReducer,
    }),
  });

const createWrapper = (store: ReturnType<typeof createTestStore>) => {
  return ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line react/no-children-prop
    return React.createElement(Provider, { store, children });
  };
};

const renderDrawTool = () => {
  const store = createTestStore();
  return renderHook(() => useDrawTool(null), { wrapper: createWrapper(store) });
};

const createTouchEvent = (x: number, y: number) =>
  ({ nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y } } as unknown as GestureResponderEvent);

describe('useDrawTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPointDataSet.length = 0;
    mockLineDataSet.length = 0;
    mockPolygonDataSet.length = 0;
    mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
      isOK: true,
      message: '',
      layer: mockLineLayer,
      recordSet: [],
    });
    mockGenerateRecord.mockImplementation((featureType: string, layer: LayerType, recordSet: RecordType[], coords: unknown) => ({
      id: 'new-record',
      userId: 'user1',
      displayName: 'tester',
      visible: true,
      redraw: false,
      coords,
      field: {},
    }));
    mockFindLayer.mockReturnValue(undefined);
    mockFindRecord.mockReturnValue(undefined);
  });

  describe('初期状態', () => {
    it('各ツールが初期値になっている', () => {
      const { result } = renderDrawTool();

      expect(result.current.currentDrawTool).toBe('NONE');
      expect(result.current.currentPointTool).toBe('PLOT_POINT');
      expect(result.current.currentLineTool).toBe('PLOT_LINE');
      expect(result.current.currentPolygonTool).toBe('PLOT_POLYGON');
      expect(result.current.featureButton).toBe('NONE');
      expect(result.current.isDrawLineVisible).toBe(true);
      expect(result.current.isEditingDraw).toBe(false);
      expect(result.current.isEditingObject).toBe(false);
      expect(result.current.drawLine.current).toEqual([]);
    });
  });

  describe('ツール切替', () => {
    it('setDrawTool / setFeatureButtonで状態が更新される', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
        result.current.setFeatureButton('LINE');
      });

      expect(result.current.currentDrawTool).toBe('PLOT_LINE');
      expect(result.current.featureButton).toBe('LINE');
    });

    it('setPointTool / setLineTool / setPolygonToolで各ツールが更新される', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setPointTool('ADD_LOCATION_POINT');
        result.current.setLineTool('FREEHAND_LINE');
        result.current.setPolygonTool('FREEHAND_POLYGON');
      });

      expect(result.current.currentPointTool).toBe('ADD_LOCATION_POINT');
      expect(result.current.currentLineTool).toBe('FREEHAND_LINE');
      expect(result.current.currentPolygonTool).toBe('FREEHAND_POLYGON');
    });
  });

  describe('handleGrantPlot（プロット描画）', () => {
    it('編集中でなければ新規オブジェクトを開始する', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });

      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].xy).toEqual([[10, 10]]);
      expect(result.current.drawLine.current[0].properties).toContain('EDIT');
    });

    it('PLOT_LINEで2回目のタッチはノードを追加する', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
        result.current.handleGrantPlot([20, 20]);
      });

      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].xy).toEqual([
        [10, 10],
        [20, 20],
      ]);
    });

    it('PLOT_POINTで2回目のタッチは位置を更新する（ノードを増やさない）', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_POINT');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
        result.current.handleGrantPlot([30, 30]);
      });

      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].xy).toEqual([[30, 30]]);
    });

    it('handleMovePlotでノードが移動する', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.handleMovePlot([50, 50]);
      });

      expect(result.current.drawLine.current[0].xy).toEqual([[50, 50]]);
    });
  });

  describe('finishEditObject（描画確定）', () => {
    it('編集中でなければfalseを返す', () => {
      const { result } = renderDrawTool();

      let finished: boolean | undefined;
      act(() => {
        finished = result.current.finishEditObject();
      });

      expect(finished).toBe(false);
    });

    it('PLOT_LINEで2点未満の場合はfalseを返す', () => {
      const { result, rerender } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });

      let finished: boolean | undefined;
      act(() => {
        finished = result.current.finishEditObject();
      });

      expect(finished).toBe(false);
      // finishEditObjectがfalseの場合は再レンダリングされないため、明示的に再レンダリングして確認
      rerender();
      expect(result.current.isEditingObject).toBe(true);
    });

    it('PLOT_LINEで2点以上あれば確定してEDITプロパティを外す', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
        result.current.handleGrantPlot([20, 20]);
      });

      let finished: boolean | undefined;
      act(() => {
        finished = result.current.finishEditObject();
      });

      expect(finished).toBe(true);
      expect(result.current.isEditingObject).toBe(false);
      expect(result.current.drawLine.current[0].properties).not.toContain('EDIT');
      expect(result.current.drawLine.current[0].latlon).toEqual([
        [10, 10],
        [20, 20],
      ]);
    });
  });

  describe('undoDraw', () => {
    it('undo対象が無ければ何もしない', () => {
      const { result } = renderDrawTool();

      let undoResult: true | undefined;
      act(() => {
        undoResult = result.current.undoDraw();
      });

      expect(undoResult).toBeUndefined();
      expect(result.current.drawLine.current).toEqual([]);
    });

    it('新規オブジェクト作成をundoすると描画が消えツールがNONEに戻る', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.undoDraw();
      });

      expect(result.current.drawLine.current).toEqual([]);
      expect(result.current.currentDrawTool).toBe('NONE');
      expect(result.current.isEditingObject).toBe(false);
    });

    it('確定(FINISH)をundoすると編集状態に戻る', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
        result.current.handleGrantPlot([20, 20]);
      });
      act(() => {
        result.current.finishEditObject();
      });
      act(() => {
        result.current.undoDraw();
      });

      expect(result.current.isEditingObject).toBe(true);
      expect(result.current.drawLine.current[0].properties).toContain('EDIT');
    });
  });

  describe('saveLine', () => {
    it('無効なライン（2点未満）はエラーメッセージを返す', () => {
      const { result } = renderDrawTool();

      result.current.drawLine.current = [
        { id: 'draw1', layerId: undefined, record: undefined, xy: [[10, 10]], latlon: [], properties: ['EDIT'] },
      ];

      const res = result.current.saveLine();

      expect(res.isOK).toBe(false);
      expect(res.message).toBe('hooks.message.invalidLine');
      expect(mockAddRecord).not.toHaveBeenCalled();
    });

    it('編集可能レイヤーが無い場合はそのメッセージを返す', () => {
      const { result } = renderDrawTool();
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: false,
        message: 'no editable layer',
        layer: undefined,
        recordSet: undefined,
      });

      result.current.drawLine.current = [
        {
          id: 'draw1',
          layerId: undefined,
          record: undefined,
          xy: [
            [10, 10],
            [20, 20],
          ],
          latlon: [
            [10, 10],
            [20, 20],
          ],
          properties: ['EDIT'],
        },
      ];

      const res = result.current.saveLine();

      expect(res.isOK).toBe(false);
      expect(res.message).toBe('no editable layer');
    });

    it('新規ラインを保存するとaddRecordが呼ばれ描画ツールがリセットされる', () => {
      const { result } = renderDrawTool();

      result.current.drawLine.current = [
        {
          id: 'draw1',
          layerId: undefined,
          record: undefined,
          xy: [
            [10, 10],
            [20, 20],
          ],
          latlon: [
            [10, 10],
            [20, 20],
          ],
          properties: [],
        },
      ];

      let res: ReturnType<typeof result.current.saveLine> | undefined;
      act(() => {
        res = result.current.saveLine();
      });

      expect(res?.isOK).toBe(true);
      expect(res?.layer).toBe(mockLineLayer);
      expect(res?.recordSet).toHaveLength(1);
      expect(mockGenerateRecord).toHaveBeenCalledWith('LINE', mockLineLayer, [], [
        { longitude: 10, latitude: 10 },
        { longitude: 20, latitude: 20 },
      ]);
      expect(mockAddRecord).toHaveBeenCalledWith(mockLineLayer, expect.objectContaining({ id: 'new-record' }));
      expect(result.current.drawLine.current).toEqual([]);
    });

    it('既存レコードのラインは更新（updateRecord）される', () => {
      const { result } = renderDrawTool();
      mockFindLayer.mockReturnValue(mockLineLayer);
      mockFindRecord.mockReturnValue(mockLineRecord);

      result.current.drawLine.current = [
        {
          id: mockLineRecord.id,
          layerId: mockLineLayer.id,
          record: mockLineRecord,
          xy: [
            [10, 10],
            [20, 20],
          ],
          latlon: [
            [10, 10],
            [20, 20],
          ],
          properties: [],
        },
      ];

      let res: ReturnType<typeof result.current.saveLine> | undefined;
      act(() => {
        res = result.current.saveLine();
      });

      expect(res?.isOK).toBe(true);
      expect(mockUpdateRecord).toHaveBeenCalledWith(
        mockLineLayer,
        expect.objectContaining({ id: mockLineRecord.id })
      );
      expect(mockAddRecord).not.toHaveBeenCalled();
    });
  });

  describe('savePoint', () => {
    it('新規ポイントを保存するとaddRecordが呼ばれる', () => {
      const { result } = renderDrawTool();
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockPointLayer,
        recordSet: [],
      });

      result.current.drawLine.current = [
        { id: 'draw1', layerId: undefined, record: undefined, xy: [[10, 10]], latlon: [[10, 10]], properties: ['POINT'] },
      ];

      let res: ReturnType<typeof result.current.savePoint> | undefined;
      act(() => {
        res = result.current.savePoint();
      });

      expect(res?.isOK).toBe(true);
      expect(mockGenerateRecord).toHaveBeenCalledWith('POINT', mockPointLayer, [], { longitude: 10, latitude: 10 });
      expect(mockAddRecord).toHaveBeenCalledTimes(1);
    });

    it('無効なポイントはエラーメッセージを返す', () => {
      const { result } = renderDrawTool();

      result.current.drawLine.current = [
        {
          id: 'draw1',
          layerId: undefined,
          record: undefined,
          xy: [
            [10, 10],
            [20, 20],
          ],
          latlon: [],
          properties: ['POINT'],
        },
      ];

      const res = result.current.savePoint();

      expect(res.isOK).toBe(false);
      expect(res.message).toBe('hooks.message.invalidPoint');
    });
  });

  describe('savePolygon', () => {
    it('閉じていないポリゴンを自動で閉じて保存する', () => {
      const { result } = renderDrawTool();
      const polygonLayer = { ...mockLineLayer, id: 'layer3', type: 'POLYGON' } as unknown as LayerType;
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: polygonLayer,
        recordSet: [],
      });

      result.current.drawLine.current = [
        {
          id: 'draw1',
          layerId: undefined,
          record: undefined,
          xy: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          latlon: [
            [0, 0],
            [10, 0],
            [10, 10],
          ],
          properties: [],
        },
      ];

      let res: ReturnType<typeof result.current.savePolygon> | undefined;
      act(() => {
        res = result.current.savePolygon();
      });

      expect(res?.isOK).toBe(true);
      // 始点と同じ座標が終点に追加されて閉じている
      expect(mockGenerateRecord).toHaveBeenCalledWith('POLYGON', polygonLayer, [], [
        { longitude: 0, latitude: 0 },
        { longitude: 10, latitude: 0 },
        { longitude: 10, latitude: 10 },
        { longitude: 0, latitude: 0 },
      ]);
      expect(mockAddRecord).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteDraw', () => {
    it('編集可能レイヤーが無い場合はisOK=falseを返す', () => {
      const { result } = renderDrawTool();
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: false,
        message: 'no editable layer',
        layer: undefined,
        recordSet: undefined,
      });

      let res: ReturnType<typeof result.current.deleteDraw> | undefined;
      act(() => {
        res = result.current.deleteDraw();
      });

      expect(res?.isOK).toBe(false);
      expect(res?.message).toBe('no editable layer');
    });

    it('削除に成功すると描画がリセットされツールがNONEに戻る', () => {
      const { result } = renderDrawTool();

      result.current.drawLine.current = [
        {
          id: mockLineRecord.id,
          layerId: mockLineLayer.id,
          record: mockLineRecord,
          xy: [
            [10, 10],
            [20, 20],
          ],
          latlon: [
            [10, 10],
            [20, 20],
          ],
          properties: ['EDIT'],
        },
      ];

      let res: ReturnType<typeof result.current.deleteDraw> | undefined;
      act(() => {
        res = result.current.deleteDraw();
      });

      expect(res?.isOK).toBe(true);
      expect(res?.layer).toBe(mockLineLayer);
      expect(result.current.drawLine.current).toEqual([]);
      expect(result.current.currentDrawTool).toBe('NONE');
    });
  });

  describe('選択（handleReleaseSelect / selectSingleFeature）', () => {
    it('フィーチャーを選択すると編集状態になりツールが切り替わる', () => {
      const { result } = renderDrawTool();
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(mockLineRecord);
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockLineLayer,
        recordSet: [mockLineRecord],
      });

      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.handleReleaseSelect([135, 35]);
      });

      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].record).toBe(mockLineRecord);
      expect(result.current.drawLine.current[0].properties).toContain('EDIT');
      expect(result.current.currentDrawTool).toBe('PLOT_LINE');
      expect(result.current.isEditingDraw).toBe(true);
      expect(result.current.isEditingObject).toBe(true);
    });

    it('選択(SELECT)をundoするとリセットされtrueを返す', () => {
      const { result } = renderDrawTool();
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(mockLineRecord);
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockLineLayer,
        recordSet: [mockLineRecord],
      });

      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.handleReleaseSelect([135, 35]);
      });

      let undoResult: true | undefined;
      act(() => {
        undoResult = result.current.undoDraw();
      });

      expect(undoResult).toBe(true);
      expect(result.current.drawLine.current).toEqual([]);
      expect(result.current.currentDrawTool).toBe('NONE');
    });

    it('selectSingleFeature: 何もヒットしなければundefinedを返す', () => {
      const { result } = renderDrawTool();

      let res: ReturnType<typeof result.current.selectSingleFeature> | undefined;
      act(() => {
        res = result.current.selectSingleFeature(createTouchEvent(100, 100));
      });

      expect(res).toEqual({ layer: undefined, feature: undefined, recordSet: undefined, recordIndex: undefined });
    });

    it('selectSingleFeature: ポイントにヒットするとレイヤーとフィーチャーを返す', () => {
      const { result } = renderDrawTool();
      mockPointDataSet.push({ layerId: mockPointLayer.id, userId: 'user1', data: [mockPointRecord] });
      (selectPointFeatureByLatLon as jest.Mock).mockReturnValue(mockPointRecord);
      mockFindLayer.mockReturnValue(mockPointLayer);

      let res: ReturnType<typeof result.current.selectSingleFeature> | undefined;
      act(() => {
        res = result.current.selectSingleFeature(createTouchEvent(100, 100));
      });

      expect(res?.layer).toBe(mockPointLayer);
      expect(res?.feature).toBe(mockPointRecord);
      expect(res?.recordIndex).toBe(0);
    });
  });

  describe('handleReleaseDeletePoint（オブジェクト削除）', () => {
    it('始点近くをタッチしたオブジェクトは座標が空になる', () => {
      const { result } = renderDrawTool();
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(mockLineRecord);
      (isNearWithPlot as jest.Mock).mockReturnValue(true);
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockLineLayer,
        recordSet: [mockLineRecord],
      });

      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.handleReleaseDeletePoint([135, 35]);
      });

      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].xy).toEqual([]);
      expect(result.current.drawLine.current[0].latlon).toEqual([]);
    });
  });

  describe('resetDrawTools / 表示制御', () => {
    it('resetDrawToolsで描画状態がすべてクリアされる', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.resetDrawTools();
      });

      expect(result.current.drawLine.current).toEqual([]);
      expect(result.current.editingLineXY.current).toEqual([]);
      expect(result.current.selectLine.current).toEqual([]);
    });

    it('hideDrawLine / showDrawLineで表示状態が切り替わる', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.hideDrawLine();
      });
      expect(result.current.isDrawLineVisible).toBe(false);

      act(() => {
        result.current.showDrawLine();
      });
      expect(result.current.isDrawLineVisible).toBe(true);
    });
  });

  describe('getPXY / convertPointFeatureToDrawLine', () => {
    it('getPXYはタッチイベントからlocation座標を返す', () => {
      const { result } = renderDrawTool();

      const pXY = result.current.getPXY(createTouchEvent(120, 240));

      expect(pXY).toEqual([120, 240]);
    });

    it('convertPointFeatureToDrawLineでポイントがdrawLineに変換される', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.convertPointFeatureToDrawLine(mockPointLayer.id, [mockPointRecord]);
      });

      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].layerId).toBe(mockPointLayer.id);
      expect(result.current.drawLine.current[0].record).toBe(mockPointRecord);
      expect(result.current.drawLine.current[0].properties).toEqual(['POINT']);
    });
  });

  describe('toggleTerrain', () => {
    it('Webでない場合は何もしない（isTerrainActiveはfalseのまま）', () => {
      const { result } = renderDrawTool();

      act(() => {
        result.current.toggleTerrain(true);
      });

      expect(result.current.isTerrainActive).toBe(false);
    });
  });
});
