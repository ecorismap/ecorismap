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
  getSnappedLine: jest.fn((start: [number, number], end: [number, number]) => [start, end]),
  refineArrowStroke: jest.fn((xy: [number, number][]) => xy),
  isClosedPolygon: jest.fn(
    (xy: [number, number][]) =>
      xy.length > 2 && xy[0][0] === xy[xy.length - 1][0] && xy[0][1] === xy[xy.length - 1][1]
  ),
  isNearWithPlot: jest.fn(() => false),
  modifyLineWithSource: jest.fn(() => ({ xy: [], latlon: [], junctions: [] })),
  smoothJunctions: jest.fn((xy: unknown[], latlon: unknown[]) => ({ xy, latlon })),
  closeFreehandPolygonSeam: jest.fn((xy: [number, number][], latlon: [number, number][]) => ({
    xy: [...xy, xy[0]],
    latlon: [...latlon, latlon[0]],
  })),
  simplify: jest.fn((xy: [number, number][]) => xy),
  smoothingByBezier: jest.fn((xy: [number, number][]) => xy),
  POINTS_TRANSFORM_HANDLE_RADIUS_PX: 14,
  getPointsTransformFrame: jest.fn((points: [number, number][]) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const pad = 20;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const center = [(minX + maxX) / 2, (minY + maxY) / 2];
    return { minX, maxX, minY, maxY, center, handle: [center[0], minY - 40] };
  }),
  getRotatedPointsTransformFrame: jest.fn((points: [number, number][]) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const pad = 20;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const center = [(minX + maxX) / 2, (minY + maxY) / 2];
    return {
      corners: [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
      ],
      center,
      topMid: [center[0], minY],
      handle: [center[0], minY - 40],
    };
  }),
}));

// OneEuroFilterの恒等モック（テストを決定的にする）
jest.mock('../../utils/OneEuroFilter', () => ({
  PositionFilter: class {
    filter(xy: [number, number]) {
      return xy;
    }
    reset() {}
  },
  getEventTimestamp: jest.fn(() => 0),
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
import dataSetReducer, { addDataAction } from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import userReducer from '../../modules/user';
import settingsReducer from '../../modules/settings';
import projectsReducer from '../../modules/projects';
import tileMapsReducer from '../../modules/tileMaps';
import {
  selectLineFeatureByLatLon,
  selectPointFeatureByLatLon,
  selectPointFeaturesByArea,
  selectLineFeaturesByArea,
  checkDistanceFromLine,
  findNearNodeIndex,
  isValidLine,
  modifyLineWithSource,
  xyArrayToLatLonArray,
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

//色分けが「個別（_strokeColor参照）」のレイヤ。手書きの色・太さはこのレイヤでのみ書き込まれる
const mockIndividualLineLayer = {
  ...mockLineLayer,
  colorStyle: {
    ...(mockLineLayer as any).colorStyle,
    colorType: 'INDIVIDUAL',
    fieldName: '__CUSTOM',
    customFieldValue: '_strokeColor',
  },
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
  return { ...renderHook(() => useDrawTool(null), { wrapper: createWrapper(store) }), store };
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
        result.current.setLineTool('SPLIT_LINE');
        result.current.setPolygonTool('HANDWRITING_POLYGON');
      });

      expect(result.current.currentPointTool).toBe('ADD_LOCATION_POINT');
      expect(result.current.currentLineTool).toBe('SPLIT_LINE');
      expect(result.current.currentPolygonTool).toBe('HANDWRITING_POLYGON');
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
      expect(result.current.drawLine.current[0].properties).not.toContain('HANDWRITING');
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
      expect(result.current.drawLine.current[0].properties).not.toContain('HANDWRITING');
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

  describe('位置なしポイントの位置編集', () => {
    it('位置なしレコードを選択後、タップした位置が既存レコードの更新として保存される', () => {
      const { result } = renderDrawTool();
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockPointLayer,
        recordSet: [],
      });
      mockFindLayer.mockReturnValue(mockPointLayer);

      const noCoordsRecord = { ...mockPointRecord, id: 'no-coords-1', coords: undefined } as unknown as PointRecordType;

      act(() => {
        result.current.selectObjectByFeature(mockPointLayer, noCoordsRecord);
      });

      // レコードが紐づいた空のプロットが編集対象として登録される
      expect(result.current.isEditingObject).toBe(true);
      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].record).toBe(noCoordsRecord);
      expect(result.current.drawLine.current[0].xy).toHaveLength(0);

      act(() => {
        result.current.setDrawTool('PLOT_POINT');
      });
      act(() => {
        result.current.handleGrantPlot([30, 40]);
      });
      act(() => {
        result.current.handleReleasePlotPoint();
      });

      expect(result.current.drawLine.current[0].xy).toEqual([[30, 40]]);

      // 保存は新規追加ではなく既存レコードの更新になる
      let res: ReturnType<typeof result.current.savePoint> | undefined;
      act(() => {
        res = result.current.savePoint();
      });

      expect(res?.isOK).toBe(true);
      expect(mockAddRecord).not.toHaveBeenCalled();
      expect(mockUpdateRecord).toHaveBeenCalledTimes(1);
      const updatedRecord = mockUpdateRecord.mock.calls[0][1];
      expect(updatedRecord.id).toBe('no-coords-1');
      expect(updatedRecord.coords).toEqual({ longitude: 30, latitude: 40 });
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

    it('_groupでぶら下がる行動記号（ブラシ・スタンプ）も一緒に消える', () => {
      const child = {
        ...mockLineRecord,
        id: 'child1',
        field: { _group: mockLineRecord.id, _stamp: 'TOMARI' },
      };
      const other = { ...mockLineRecord, id: 'other1', field: { _group: 'another-line' } };
      mockLineDataSet.push({ layerId: mockLineLayer.id, userId: 'user1', data: [child, other] });

      const { result, store } = renderDrawTool();
      act(() => {
        store.dispatch(
          addDataAction([
            { layerId: mockLineLayer.id, userId: 'user1', data: [mockLineRecord, child, other] as RecordType[] },
          ])
        );
      });
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

      act(() => {
        result.current.deleteDraw();
      });

      //親のレコードと、その_groupを持つ記号だけが消える
      const remaining = store.getState().dataSet.find((d) => d.layerId === mockLineLayer.id)?.data ?? [];
      expect(remaining.map((d) => d.id)).toEqual(['other1']);
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
      expect(result.current.drawLine.current[0].properties).not.toContain('HANDWRITING');
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

  describe('編集時の座標精度保存（latlonの部分更新）', () => {
    const selectExistingLine = (result: any) => {
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
    };

    afterEach(() => {
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: false, distance: 9999 });
      (findNearNodeIndex as jest.Mock).mockReturnValue(-1);
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(undefined);
    });

    it('ノード移動では動かした頂点のみ更新され、他頂点のlatlonは同一参照のまま保持される', () => {
      const { result } = renderDrawTool();
      selectExistingLine(result);

      const before = result.current.drawLine.current[0].latlon;
      const untouchedRef = before[0];

      //ノード1をつかんでドラッグ（6回移動=タップ扱いにならない）
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: true, distance: 1 });
      (findNearNodeIndex as jest.Mock).mockReturnValue(1);
      act(() => {
        result.current.handleGrantPlot([135.001, 35.001]);
      });
      act(() => {
        for (let i = 1; i <= 6; i++) result.current.handleMovePlot([135.001 + i, 35.001 + i]);
      });
      (xyArrayToLatLonArray as jest.Mock).mockClear();
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });

      const after = result.current.drawLine.current[0].latlon;
      //全再生成が走っていない＝画面ピクセル量子化が起きない
      expect(xyArrayToLatLonArray).not.toHaveBeenCalled();
      //動かしていない頂点は同一参照のまま（値の劣化ゼロの直接証明）
      expect(after[0]).toBe(untouchedRef);
      //動かした頂点のみ新しい位置
      expect(after[1]).toEqual([141.001, 41.001]);
      //不変条件: xyとlatlonは常に同数
      expect(after.length).toBe(result.current.drawLine.current[0].xy.length);
    });

    it('新規プロット作図でもrelease毎にlatlonが同数を保ち、全再生成が呼ばれない', () => {
      const { result } = renderDrawTool();
      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      (xyArrayToLatLonArray as jest.Mock).mockClear();

      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      act(() => {
        result.current.handleGrantPlot([20, 20]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });

      const line = result.current.drawLine.current[0];
      expect(line.latlon).toEqual([
        [10, 10],
        [20, 20],
      ]);
      expect(line.latlon.length).toBe(line.xy.length);
      expect(xyArrayToLatLonArray).not.toHaveBeenCalled();
    });

    it('ノード削除では該当頂点のみlatlonから除去され、他頂点は保持される', () => {
      const { result } = renderDrawTool();
      selectExistingLine(result);

      const before = result.current.drawLine.current[0].latlon;
      const untouchedRef = before[0];

      //ノード1をタップ（移動なし）→削除
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: true, distance: 1 });
      (findNearNodeIndex as jest.Mock).mockReturnValue(1);
      act(() => {
        result.current.handleGrantPlot([135.001, 35.001]);
      });
      (xyArrayToLatLonArray as jest.Mock).mockClear();
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });

      const line = result.current.drawLine.current[0];
      expect(xyArrayToLatLonArray).not.toHaveBeenCalled();
      expect(line.latlon.length).toBe(1);
      expect(line.latlon.length).toBe(line.xy.length);
      expect(line.latlon[0]).toBe(untouchedRef);
    });
  });

  describe('手書きペン描画（逐次latlon化・終点キャッチアップ・ピンチ確定）', () => {
    const penStyle = {
      strokeColor: 'rgba(0,0,0,0.7)',
      strokeWidth: 5,
      arrowStyle: 'NONE' as const,
      isStraightStyle: false,
      snapWithLine: true,
    };
    const start = (result: any) => {
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('HANDWRITING_LINE');
      });
    };

    it('描画中もxyとlatlonが同数で保たれ、離した位置まで線が届く', () => {
      const { result } = renderDrawTool();
      start(result);
      act(() => {
        result.current.handleGrantHandwriting([10, 10], penStyle);
      });
      act(() => {
        result.current.handleMoveHandwriting([20, 20], 16);
        result.current.handleMoveHandwriting([30, 30], 32);
        result.current.handleMoveHandwriting([40, 40], 48);
      });
      //描画中からlatlonが揃っている（ピンチ時の再投影で消えない）
      const during = result.current.drawLine.current[0];
      expect(during.latlon.length).toBe(during.xy.length);
      expect(during.latlon.length).toBeGreaterThanOrEqual(4);

      act(() => {
        result.current.handleReleaseHandwriting();
      });
      const line = result.current.drawLine.current[0];
      //終点は最後の生タッチ位置（切り捨てなし）
      expect(line.xy[line.xy.length - 1]).toEqual([40, 40]);
      expect(line.latlon[line.latlon.length - 1]).toEqual([40, 40]);
      //始点もそのまま
      expect(line.xy[0]).toEqual([10, 10]);
      expect(line.latlon.length).toBe(line.xy.length);
    });

    it('commitHandwritingStrokeで描きかけが確定してスタイルが付き、確定バーが維持される', () => {
      const { result } = renderDrawTool();
      start(result);
      act(() => {
        result.current.handleGrantHandwriting([10, 10], penStyle);
      });
      act(() => {
        result.current.handleMoveHandwriting([20, 20], 16);
        result.current.handleMoveHandwriting([40, 40], 32);
      });
      act(() => {
        result.current.commitHandwritingStroke();
      });
      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].style?.strokeColor).toBe('rgba(0,0,0,0.7)');
      expect(result.current.isEditingObject).toBe(true);
    });

    it('commitHandwritingStroke: 微小な動きだけのストロークは破棄される', () => {
      const { result } = renderDrawTool();
      start(result);
      act(() => {
        result.current.handleGrantHandwriting([10, 10], penStyle);
      });
      act(() => {
        result.current.handleMoveHandwriting([12, 12], 16);
        result.current.handleMoveHandwriting([14, 14], 32);
      });
      act(() => {
        result.current.commitHandwritingStroke();
      });
      expect(result.current.drawLine.current).toHaveLength(0);
      expect(result.current.isUndoable).toBe(false);
    });

    it('cancelHandwritingStroke: 新規ストロークは複数点でもオブジェクトごと破棄される', () => {
      const { result } = renderDrawTool();
      start(result);
      act(() => {
        result.current.handleGrantHandwriting([10, 10], penStyle);
      });
      act(() => {
        result.current.handleMoveHandwriting([20, 20], 16);
        result.current.handleMoveHandwriting([30, 30], 32);
      });
      act(() => {
        result.current.cancelHandwritingStroke();
      });
      expect(result.current.drawLine.current).toHaveLength(0);
      expect(result.current.isUndoable).toBe(false);
    });
  });

  describe('ピンチ意図の取り消し（cancelPlotGrant）', () => {
    it('cancelPlotGrant: 編集開始前のGrantで作られた新規プロットは取り消される', () => {
      const { result } = renderDrawTool();
      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      expect(result.current.drawLine.current).toHaveLength(1);
      act(() => {
        result.current.cancelPlotGrant();
      });
      expect(result.current.drawLine.current).toHaveLength(0);
      expect(result.current.isEditingObject).toBe(false);
      expect(result.current.isUndoable).toBe(false);
    });

    it('cancelPlotGrant: 編集中はGrantで追加されたノードが取り消される', () => {
      const { result } = renderDrawTool();
      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      act(() => {
        result.current.handleGrantPlot([50, 50]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      //ピンチの1本目の指でノードが追加された状態
      act(() => {
        result.current.handleGrantPlot([90, 90]);
      });
      expect(result.current.drawLine.current[0].xy).toHaveLength(3);
      act(() => {
        result.current.cancelPlotGrant();
      });
      //latlonを正としてxyが復元され、Grantで追加されたノードが消える
      const line = result.current.drawLine.current[0];
      expect(line.xy).toHaveLength(2);
      expect(line.xy.length).toBe(line.latlon.length);
      expect(result.current.isEditingObject).toBe(true);
    });
  });

  describe('Undo/Redo', () => {
    it('編集前はisUndoable/isRedoableがfalse、編集後にUndo可能になる', () => {
      const { result } = renderDrawTool();
      expect(result.current.isUndoable).toBe(false);
      expect(result.current.isRedoable).toBe(false);

      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      expect(result.current.isUndoable).toBe(true);
    });

    it('ノード編集をUndo→Redoすると編集後の状態に戻る', () => {
      const { result } = renderDrawTool();
      //既存ライン選択
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

      //ノード1を移動して確定
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: true, distance: 1 });
      (findNearNodeIndex as jest.Mock).mockReturnValue(1);
      act(() => {
        result.current.handleGrantPlot([135.001, 35.001]);
      });
      act(() => {
        for (let i = 1; i <= 6; i++) result.current.handleMovePlot([135.001 + i, 35.001 + i]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });

      const editedLatLon = result.current.drawLine.current[0].latlon.map((p) => [...p]);
      expect(result.current.isRedoable).toBe(false);

      //Undo → 移動前に戻る
      act(() => {
        result.current.undoDraw();
      });
      expect(result.current.drawLine.current[0].latlon[1]).toEqual([135.001, 35.001]);
      expect(result.current.isRedoable).toBe(true);

      //Redo → 移動後に戻る
      act(() => {
        result.current.redoDraw();
      });
      expect(result.current.drawLine.current[0].latlon).toEqual(editedLatLon);
      expect(result.current.isRedoable).toBe(false);
      expect(result.current.isUndoable).toBe(true);

      //後始末（モックを既定値に）
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: false, distance: 9999 });
      (findNearNodeIndex as jest.Mock).mockReturnValue(-1);
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(undefined);
    });

    it('新しい編集を行うとRedo履歴が無効化される', () => {
      const { result } = renderDrawTool();
      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      act(() => {
        result.current.handleGrantPlot([20, 20]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      //EDITをundo → redo可能
      act(() => {
        result.current.undoDraw();
      });
      expect(result.current.isRedoable).toBe(true);
      //新しい編集（release時にundoが積まれredo履歴が消える）
      act(() => {
        result.current.handleGrantPlot([30, 30]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      expect(result.current.isRedoable).toBe(false);
    });
  });

  describe('複数ポイントの一括移動・回転', () => {
    const multiPoints = [
      { ...mockPointRecord, id: 'p1', coords: { latitude: 10, longitude: 10 } },
      { ...mockPointRecord, id: 'p2', coords: { latitude: 10, longitude: 20 } },
      { ...mockPointRecord, id: 'p3', coords: { latitude: 20, longitude: 20 } },
    ] as unknown as PointRecordType[];
    //xy: p1=[10,10], p2=[20,10], p3=[20,20]（恒等変換モック）
    //frame: minX=-10, maxX=40, minY=-10, maxY=40, center=[15,15], handle=[15,-50]

    const selectMultiPoints = (result: { current: ReturnType<typeof useDrawTool> }, features = multiPoints) => {
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockPointLayer,
        recordSet: multiPoints,
      });
      (selectPointFeaturesByArea as jest.Mock).mockReturnValue(features);
      act(() => {
        result.current.setFeatureButton('POINT');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });
    };

    it('なげなわ選択で範囲内の全ポイントが選択され一括変形モードになる', () => {
      const { result } = renderDrawTool();
      selectMultiPoints(result);
      expect(result.current.drawLine.current.length).toBe(3);
      expect(result.current.drawLine.current.every((l) => l.properties.includes('POINT'))).toBe(true);
      expect(result.current.currentDrawTool).toBe('PLOT_POINT');
      expect(result.current.isEditingObject).toBe(true);
    });

    it('1件だけ囲んだ場合も変形モードになりドラッグで移動できる', () => {
      const { result } = renderDrawTool();
      selectMultiPoints(result, [multiPoints[0]] as unknown as PointRecordType[]);
      expect(result.current.drawLine.current.length).toBe(1);
      //ノード編集(EDIT)ではなく変形モード
      expect(result.current.drawLine.current[0].properties).not.toContain('EDIT');
      expect(result.current.isAreaSelected).toBe(true);
      act(() => {
        result.current.handleGrantPlot([10, 10]);
      });
      act(() => {
        result.current.handleMovePlot([15, 20]); //dx=5, dy=10
      });
      act(() => {
        result.current.handleReleasePlotPoint();
      });
      expect(result.current.drawLine.current[0].latlon[0]).toEqual([15, 20]);
    });

    it('ドラッグで全ポイントが平行移動しリリースでlatlonが更新される', () => {
      const { result } = renderDrawTool();
      selectMultiPoints(result);
      act(() => {
        result.current.handleGrantPlot([15, 15]);
      });
      act(() => {
        result.current.handleMovePlot([25, 20]); //dx=10, dy=5
      });
      act(() => {
        result.current.handleReleasePlotPoint();
      });
      expect(result.current.drawLine.current[0].latlon[0]).toEqual([20, 15]);
      expect(result.current.drawLine.current[1].latlon[0]).toEqual([30, 15]);
      expect(result.current.drawLine.current[2].latlon[0]).toEqual([30, 25]);
    });

    it('回転ハンドルのドラッグで全ポイントが中心周りに回転する', () => {
      const { result } = renderDrawTool();
      selectMultiPoints(result);
      act(() => {
        result.current.handleGrantPlot([15, -50]); //ハンドル位置から開始
      });
      act(() => {
        result.current.handleMovePlot([80, 15]); //center[15,15]周りに+90度
      });
      act(() => {
        result.current.handleReleasePlotPoint();
      });
      const latlons = result.current.drawLine.current.map((l) => l.latlon[0].map((v: number) => Math.round(v)));
      //90度回転: (x,y) -> (15-(y-15), 15+(x-15))
      expect(latlons[0]).toEqual([20, 10]);
      expect(latlons[1]).toEqual([20, 20]);
      expect(latlons[2]).toEqual([10, 20]);
    });

    it('一括変形はUNDOで元に戻りREDOでやり直せる', () => {
      const { result } = renderDrawTool();
      selectMultiPoints(result);
      act(() => {
        result.current.handleGrantPlot([15, 15]);
      });
      act(() => {
        result.current.handleMovePlot([25, 25]);
      });
      act(() => {
        result.current.handleReleasePlotPoint();
      });
      expect(result.current.drawLine.current[0].latlon[0]).toEqual([20, 20]);
      act(() => {
        result.current.undoDraw();
      });
      expect(result.current.drawLine.current[0].latlon[0]).toEqual([10, 10]);
      expect(result.current.drawLine.current[2].latlon[0]).toEqual([20, 20]);
      act(() => {
        result.current.redoDraw();
      });
      expect(result.current.drawLine.current[0].latlon[0]).toEqual([20, 20]);
    });

    it('動かさずにリリースした場合はundo履歴が積まれない', () => {
      const { result } = renderDrawTool();
      selectMultiPoints(result);
      const undoCountAfterSelect = result.current.isUndoable;
      act(() => {
        result.current.handleGrantPlot([15, 15]);
      });
      act(() => {
        result.current.handleReleasePlotPoint();
      });
      //SELECTのundoのみ（変形のEDIT_MULTIは積まれない）
      expect(result.current.isUndoable).toBe(undoCountAfterSelect);
      act(() => {
        result.current.undoDraw();
      });
      //SELECTのundoで選択が解除される
      expect(result.current.drawLine.current.length).toBe(0);
      expect(result.current.currentDrawTool).toBe('NONE');
    });

    it('保存で全ポイントのレコードが更新される', () => {
      const { result } = renderDrawTool();
      selectMultiPoints(result);
      mockFindLayer.mockReturnValue(mockPointLayer);
      act(() => {
        result.current.handleGrantPlot([15, 15]);
      });
      act(() => {
        result.current.handleMovePlot([25, 20]);
      });
      act(() => {
        result.current.handleReleasePlotPoint();
      });
      let saveResult;
      act(() => {
        saveResult = result.current.savePoint();
      });
      expect(saveResult!.isOK).toBe(true);
      expect(mockUpdateRecord).toHaveBeenCalledTimes(3);
      const savedCoords = mockUpdateRecord.mock.calls.map((c) => (c[1] as RecordType).coords);
      expect(savedCoords[0]).toEqual({ longitude: 20, latitude: 15 });
    });
  });

  describe('複数ラインの一括移動・回転', () => {
    const multiLines = [
      {
        ...mockLineRecord,
        id: 'l1',
        coords: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 10 },
        ],
      },
      {
        ...mockLineRecord,
        id: 'l2',
        coords: [
          { latitude: 20, longitude: 0 },
          { latitude: 20, longitude: 10 },
        ],
      },
    ] as unknown as LineRecordType[];

    const selectMultiLines = (result: { current: ReturnType<typeof useDrawTool> }) => {
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockLineLayer,
        recordSet: multiLines,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(multiLines);
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });
    };

    it('なげなわ選択で複数ラインが選択されPLOT_LINEの一括変形モードになる', () => {
      const { result } = renderDrawTool();
      selectMultiLines(result);
      expect(result.current.drawLine.current.length).toBe(2);
      expect(result.current.currentDrawTool).toBe('PLOT_LINE');
      expect(result.current.isAreaSelected).toBe(true);
      //単一編集(EDIT)にはなっていない
      expect(result.current.drawLine.current.every((l) => !l.properties.includes('EDIT'))).toBe(true);
    });

    it('ドラッグで全ラインの全頂点が平行移動しリリースでlatlonが更新される', () => {
      const { result } = renderDrawTool();
      selectMultiLines(result);
      act(() => {
        result.current.handleGrantPlot([5, 10]);
      });
      act(() => {
        result.current.handleMovePlot([15, 15]); //dx=10, dy=5
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      //l1: [0,0],[10,0] -> [10,5],[20,5] / l2: [0,20],[10,20] -> [10,25],[20,25]（恒等変換）
      expect(result.current.drawLine.current[0].latlon).toEqual([
        [10, 5],
        [20, 5],
      ]);
      expect(result.current.drawLine.current[1].latlon).toEqual([
        [10, 25],
        [20, 25],
      ]);
    });

    it('一括変形はUNDOで全ラインが元に戻る', () => {
      const { result } = renderDrawTool();
      selectMultiLines(result);
      act(() => {
        result.current.handleGrantPlot([5, 10]);
      });
      act(() => {
        result.current.handleMovePlot([15, 15]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      act(() => {
        result.current.undoDraw();
      });
      expect(result.current.drawLine.current[0].latlon).toEqual([
        [0, 0],
        [10, 0],
      ]);
      expect(result.current.drawLine.current[1].latlon).toEqual([
        [0, 20],
        [10, 20],
      ]);
    });

    it('保存で全ラインのレコードが更新される', () => {
      const { result } = renderDrawTool();
      selectMultiLines(result);
      mockFindLayer.mockReturnValue(mockLineLayer);
      mockFindRecord.mockImplementation((_layerId: string, _userId: string, id: string) =>
        multiLines.find((r) => r.id === id)
      );
      act(() => {
        result.current.handleGrantPlot([5, 10]);
      });
      act(() => {
        result.current.handleMovePlot([15, 15]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      let saveResult;
      act(() => {
        saveResult = result.current.saveLine();
      });
      expect(saveResult!.isOK).toBe(true);
      expect(mockUpdateRecord).toHaveBeenCalledTimes(2);
    });
  });

  describe('マップメモの編集選択', () => {
    const memoLines = [
      {
        ...mockLineRecord,
        id: 'm1',
        coords: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 10 },
        ],
        field: { _strokeWidth: 2, _strokeColor: '#ff0000' },
      },
      {
        ...mockLineRecord,
        id: 'm2',
        coords: [
          { latitude: 20, longitude: 0 },
          { latitude: 20, longitude: 10 },
        ],
        field: { _strokeWidth: 2, _strokeColor: '#ff0000' },
      },
    ] as unknown as LineRecordType[];

    it('MEMOモードのなげなわ選択でストロークが選択されPLOT_LINEの変形モードになる', () => {
      const { result } = renderDrawTool();
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockLineLayer,
        recordSet: memoLines,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(memoLines);
      act(() => {
        result.current.setFeatureButton('MEMO');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });
      expect(mockGetEditableLayerAndRecordSetWithCheck).toHaveBeenCalledWith('MEMO');
      expect(result.current.drawLine.current.length).toBe(2);
      expect(result.current.currentDrawTool).toBe('PLOT_LINE');
      expect(result.current.isAreaSelected).toBe(true);
      //一括移動してリリースで全頂点のlatlonが更新される
      act(() => {
        result.current.handleGrantPlot([5, 10]);
      });
      act(() => {
        result.current.handleMovePlot([15, 15]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      expect(result.current.drawLine.current[0].latlon).toEqual([
        [10, 5],
        [20, 5],
      ]);
      //保存でフィールド（太さ等）を保持したままレコードが更新される
      mockFindLayer.mockReturnValue(mockLineLayer);
      mockFindRecord.mockImplementation((_layerId: string, _userId: string, id: string) =>
        memoLines.find((r) => r.id === id)
      );
      let saveResult;
      act(() => {
        saveResult = result.current.saveLine();
      });
      expect(saveResult!.isOK).toBe(true);
      const saved = mockUpdateRecord.mock.calls.map((c) => c[1] as RecordType);
      expect(saved[0].field._strokeWidth).toBe(2);
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

  describe('手書きペン（HANDWRITING）セッション', () => {
    const penStyle = {
      strokeColor: 'rgba(255,0,0,0.7)',
      strokeWidth: 5,
      arrowStyle: 'NONE' as const,
      isStraightStyle: false,
      snapWithLine: true,
    };

    const startHandwritingLine = (result: any) => {
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('HANDWRITING_LINE');
      });
    };

    const drawPenStroke = (result: any, points: [number, number][]) => {
      act(() => {
        result.current.handleGrantHandwriting(points[0], penStyle);
      });
      points.slice(1).forEach((p) => {
        act(() => {
          result.current.handleMoveHandwriting(p, 0);
        });
      });
      act(() => {
        result.current.handleReleaseHandwriting();
      });
    };

    it('ペンは1オブジェクトだけ描ける（2回目のなぞりは修正になる）', () => {
      const { result } = renderDrawTool();
      startHandwritingLine(result);

      drawPenStroke(result, [
        [0, 0],
        [10, 0],
        [20, 0],
      ]);
      expect(result.current.drawLine.current).toHaveLength(1);

      //2回目は新しいストロークにならず、描いたオブジェクトのなぞり修正になる（長押し不要）
      (modifyLineWithSource as jest.Mock).mockReturnValue({
        xy: [
          [0, 0],
          [30, 0],
        ],
        latlon: [
          [0, 0],
          [30, 0],
        ],
        junctions: [],
      });
      drawPenStroke(result, [
        [10, 0],
        [20, 5],
        [30, 0],
      ]);

      expect(result.current.drawLine.current).toHaveLength(1);
      const line = result.current.drawLine.current[0];
      expect(line.xy).toEqual([
        [0, 0],
        [30, 0],
      ]);
      //修正のハイライトは合成後に解除される
      expect(line.properties).toEqual(['HANDWRITING']);
      expect(line.style).toMatchObject({
        strokeColor: 'rgba(255,0,0,0.7)',
        strokeWidth: 5,
        strokeStyle: 'NONE',
        stamp: '',
        zoom: 15,
      });
      expect(result.current.isEditingObject).toBe(true);
      expect(result.current.isEditingDraw).toBe(true);
    });

    it('saveLineでストロークが隠しフィールド付きで保存される', () => {
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: [],
      });
      const { result } = renderDrawTool();
      startHandwritingLine(result);

      drawPenStroke(result, [
        [0, 0],
        [10, 0],
      ]);

      let saveResult;
      act(() => {
        saveResult = result.current.saveLine();
      });

      expect(saveResult!.isOK).toBe(true);
      expect(mockAddRecord).toHaveBeenCalledTimes(1);
      const saved = mockAddRecord.mock.calls.map((c) => c[1] as RecordType);
      expect(saved[0].field._strokeColor).toBe('rgba(255,0,0,0.7)');
      expect(saved[0].field._strokeWidth).toBe(5);
      expect(saved[0].field._strokeStyle).toBe('NONE');
      expect(saved[0].field._stamp).toBe('');
      expect(saved[0].field._group).toBe('');
      expect(saved[0].field._zoom).toBe(15);
      //保存後はセッションがリセットされる
      expect(result.current.drawLine.current).toHaveLength(0);
      expect(result.current.isEditingObject).toBe(false);
    });

    it('スタンプはペンストロークにスナップして_groupで紐づく', () => {
      const { result } = renderDrawTool();
      startHandwritingLine(result);
      //スタンプ（1点ライン）を保存できるよう実実装と同じ判定にする
      (isValidLine as jest.Mock).mockImplementation((xy: unknown[]) => xy.length >= 1);
      //レコードIDを一意にして_group解決を検証する
      let recordCount = 0;
      mockGenerateRecord.mockImplementation(
        (_featureType: string, _layer: LayerType, _recordSet: RecordType[], coords: unknown) => ({
          id: `record-${++recordCount}`,
          userId: 'user1',
          displayName: 'tester',
          visible: true,
          redraw: false,
          coords,
          field: {},
        })
      );

      //親となるペンストローク
      drawPenStroke(result, [
        [0, 0],
        [10, 0],
      ]);
      const parentSessionId = result.current.drawLine.current[0].id;

      //スタンプ（スナップあり）
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: true, distance: 1 });
      act(() => {
        result.current.setHandwritingSubTool('TOMARI');
      });
      act(() => {
        result.current.handleGrantHandwriting([5, 0], penStyle);
      });
      act(() => {
        result.current.handleReleaseHandwriting();
      });

      expect(result.current.drawLine.current).toHaveLength(2);
      const stamp = result.current.drawLine.current[1];
      expect(stamp.style?.stamp).toBe('TOMARI');
      expect(stamp.style?.groupId).toBe(parentSessionId);

      //一括保存で親が先に保存され、子の_groupが親のレコードIDに解決される
      let saveResult;
      act(() => {
        saveResult = result.current.saveLine();
      });
      expect(saveResult!.isOK).toBe(true);
      const saved = mockAddRecord.mock.calls.map((c) => c[1] as RecordType);
      expect(saved).toHaveLength(2);
      expect(saved[0].field._group).toBe('');
      expect(saved[1].field._stamp).toBe('TOMARI');
      expect(saved[1].field._group).toBe(saved[0].id);
      //generateRecordにgroupIdオプションが渡り、属性継承が効く
      const childCall = mockGenerateRecord.mock.calls[1];
      expect(childCall[4]).toEqual({ groupId: saved[0].id });
    });

    it('ブラシはスナップできないと描けない', () => {
      const { result } = renderDrawTool();
      startHandwritingLine(result);
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: false, distance: 9999 });

      act(() => {
        result.current.setHandwritingSubTool('SENKAI');
      });
      act(() => {
        result.current.handleGrantHandwriting([5, 0], penStyle);
      });
      act(() => {
        result.current.handleReleaseHandwriting();
      });

      expect(result.current.drawLine.current).toHaveLength(0);
    });

    it('なぞり修正はundoで戻り、もう一度undoでストロークごと消える', () => {
      const { result } = renderDrawTool();
      startHandwritingLine(result);

      drawPenStroke(result, [
        [0, 0],
        [10, 0],
      ]);
      (modifyLineWithSource as jest.Mock).mockReturnValue({
        xy: [
          [0, 0],
          [30, 0],
        ],
        latlon: [
          [0, 0],
          [30, 0],
        ],
        junctions: [],
      });
      drawPenStroke(result, [
        [5, 0],
        [20, 5],
        [30, 0],
      ]);
      expect(result.current.drawLine.current).toHaveLength(1);

      //修正前の形に戻る（オブジェクトは残る）
      act(() => {
        result.current.undoDraw();
      });
      expect(result.current.drawLine.current).toHaveLength(1);
      expect(result.current.drawLine.current[0].latlon).toEqual([
        [0, 0],
        [10, 0],
      ]);
      expect(result.current.isEditingObject).toBe(true);

      //最後まで戻すと状態ごとリセットされる
      act(() => {
        result.current.undoDraw();
      });
      expect(result.current.drawLine.current).toHaveLength(0);
      expect(result.current.currentDrawTool).toBe('NONE');
    });

    it('resetDrawTools（キャンセル）で全ストロークが破棄される', () => {
      const { result } = renderDrawTool();
      startHandwritingLine(result);

      drawPenStroke(result, [
        [0, 0],
        [10, 0],
      ]);
      drawPenStroke(result, [
        [0, 10],
        [10, 10],
      ]);

      act(() => {
        result.current.resetDrawTools();
      });
      expect(result.current.drawLine.current).toHaveLength(0);
      expect(result.current.isEditingObject).toBe(false);
    });

    it('手書きポリゴンは閉じて隠しフィールド付きで保存される', () => {
      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('POLYGON');
      });
      act(() => {
        result.current.setDrawTool('HANDWRITING_POLYGON');
      });
      const mockPolygonLayer = { ...mockIndividualLineLayer, id: 'layer3', type: 'POLYGON' } as unknown as LayerType;
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockPolygonLayer,
        recordSet: [],
      });

      drawPenStroke(result, [
        [0, 0],
        [10, 0],
        [10, 10],
      ]);

      let saveResult;
      act(() => {
        saveResult = result.current.savePolygon();
      });
      expect(saveResult!.isOK).toBe(true);
      expect(mockAddRecord).toHaveBeenCalledTimes(1);
      const saved = mockAddRecord.mock.calls[0][1] as RecordType;
      expect(saved.field._strokeColor).toBe('rgba(255,0,0,0.7)');
      expect(saved.field._stamp).toBe('');
      //ポリゴンは閉じられている（closeFreehandPolygonSeamモックで始点が追記される）
      expect((saved.coords as unknown[]).length).toBeGreaterThanOrEqual(4);
    });

    it('LINEはなぞるだけでセッション内ストロークを修正できる（長押し不要）', () => {
      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('HANDWRITING_LINE');
      });
      drawPenStroke(result, [
        [0, 0],
        [10, 0],
        [10, 10],
      ]);

      (modifyLineWithSource as jest.Mock).mockReturnValue({
        xy: [
          [0, 0],
          [20, 0],
        ],
        latlon: [
          [0, 0],
          [20, 0],
        ],
        junctions: [],
      });
      act(() => {
        result.current.handleGrantHandwriting([5, 0], penStyle);
      });
      //待たずにその場で修正モードへ入る（オブジェクトは増えない）
      expect(result.current.drawLine.current).toHaveLength(1);
      act(() => {
        result.current.handleMoveHandwriting([15, 5], 0);
      });
      act(() => {
        result.current.handleReleaseHandwriting();
      });
      expect(result.current.drawLine.current[0].xy).toEqual([
        [0, 0],
        [20, 0],
      ]);
      expect(result.current.drawLine.current[0].properties).toEqual(['HANDWRITING']);
    });

    describe('手書きポリゴン（フリー）のなぞり修正', () => {
      const startHandwritingPolygon = (result: any) => {
        act(() => {
          result.current.setFeatureButton('POLYGON');
        });
        act(() => {
          result.current.setDrawTool('HANDWRITING_POLYGON');
        });
      };

      it('描いた面はなぞるだけで修正でき、オブジェクトは増えない', () => {
        const { result } = renderDrawTool();
        startHandwritingPolygon(result);

        //1面目を描く
        drawPenStroke(result, [
          [0, 0],
          [10, 0],
          [10, 10],
        ]);
        expect(result.current.drawLine.current).toHaveLength(1);

        //長押しなしで、なぞると修正になる（ポリゴンは1オブジェクトのみ）
        (modifyLineWithSource as jest.Mock).mockReturnValue({
          xy: [
            [0, 0],
            [20, 0],
            [20, 20],
          ],
          latlon: [
            [0, 0],
            [20, 0],
            [20, 20],
          ],
          junctions: [],
        });
        act(() => {
          result.current.handleGrantHandwriting([5, 0], penStyle);
        });
        act(() => {
          result.current.handleMoveHandwriting([15, 5], 0);
        });
        act(() => {
          result.current.handleReleaseHandwriting();
        });
        const line = result.current.drawLine.current[0];
        expect(result.current.drawLine.current).toHaveLength(1);
        expect(line.xy).toEqual([
          [0, 0],
          [20, 0],
          [20, 20],
        ]);
        expect(line.properties).toEqual(['HANDWRITING']);
        expect(line.style?.strokeColor).toBe('rgba(255,0,0,0.7)');
      });

      it('離れた場所をなぞっても新規オブジェクトは作られない', () => {
        const { result } = renderDrawTool();
        startHandwritingPolygon(result);
        drawPenStroke(result, [
          [0, 0],
          [10, 0],
          [10, 10],
        ]);

        (modifyLineWithSource as jest.Mock).mockReturnValue({
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
          junctions: [],
        });
        drawPenStroke(result, [
          [100, 100],
          [120, 100],
        ]);
        expect(result.current.drawLine.current).toHaveLength(1);
      });

      it('修正をundoすると座標が戻る', () => {
        const { result } = renderDrawTool();
        startHandwritingPolygon(result);
        drawPenStroke(result, [
          [0, 0],
          [10, 0],
          [10, 10],
        ]);

        (modifyLineWithSource as jest.Mock).mockReturnValue({
          xy: [
            [0, 0],
            [20, 0],
          ],
          latlon: [
            [0, 0],
            [20, 0],
          ],
          junctions: [],
        });
        act(() => {
          result.current.handleGrantHandwriting([5, 0], penStyle);
        });
        act(() => {
          result.current.handleMoveHandwriting([15, 5], 0);
        });
        act(() => {
          result.current.handleReleaseHandwriting();
        });
        expect(result.current.drawLine.current[0].xy).toEqual([
          [0, 0],
          [20, 0],
        ]);

        //undoで修正前の座標に戻る（EDITアクション）
        act(() => {
          result.current.undoDraw();
        });
        expect(result.current.drawLine.current[0].xy).toEqual([
          [0, 0],
          [10, 0],
          [10, 10],
        ]);
        expect(result.current.isEditingObject).toBe(true);
      });
    });
  });

  describe('個別色レイヤへの通常作図（色・太さの反映）', () => {
    const defaultStyle = { strokeColor: 'rgba(0,255,0,0.7)', strokeWidth: 10, strokeStyle: 'NONE', stamp: '', zoom: 15 };

    const drawPlotLine = (result: any) => {
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('PLOT_LINE');
      });
      act(() => {
        result.current.handleGrantPlot([0, 0]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
      act(() => {
        result.current.handleGrantPlot([10, 0]);
      });
      act(() => {
        result.current.handleReleasePlotLinePolygon();
      });
    };

    it('個別色レイヤではプロット作図の新規レコードに現在の色・太さが書き込まれる', () => {
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: [],
      });
      const { result } = renderDrawTool();
      drawPlotLine(result);

      let saveResult;
      act(() => {
        saveResult = result.current.saveLine(defaultStyle);
      });
      expect(saveResult!.isOK).toBe(true);
      const saved = mockAddRecord.mock.calls[0][1] as RecordType;
      expect(saved.field._strokeColor).toBe('rgba(0,255,0,0.7)');
      expect(saved.field._strokeWidth).toBe(10);
      expect(saved.field._stamp).toBe('');
      expect(saved.field._group).toBe('');
      expect(saved.field._zoom).toBe(15);
    });

    it('色分けが個別でないレイヤには書き込まれない', () => {
      //beforeEachのデフォルト（SINGLEのmockLineLayer）を使う
      const { result } = renderDrawTool();
      drawPlotLine(result);

      let saveResult;
      act(() => {
        saveResult = result.current.saveLine(defaultStyle);
      });
      expect(saveResult!.isOK).toBe(true);
      const saved = mockAddRecord.mock.calls[0][1] as RecordType;
      expect(saved.field._strokeColor).toBeUndefined();
      expect(saved.field._strokeWidth).toBeUndefined();
    });

    it('色分けが個別でないレイヤでは、手書きも色・太さを書かずレイヤのスタイルに従う（記号情報は書く）', () => {
      //beforeEachのデフォルト（SINGLEのmockLineLayer）を使う
      (isValidLine as jest.Mock).mockImplementation((xy: unknown[]) => xy.length >= 1);
      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('HANDWRITING_LINE');
      });
      const penStyle = {
        strokeColor: 'rgba(255,0,0,0.7)',
        strokeWidth: 5,
        arrowStyle: 'NONE' as const,
        isStraightStyle: false,
        snapWithLine: true,
      };
      //ペンストローク
      act(() => {
        result.current.handleGrantHandwriting([0, 0], penStyle);
      });
      act(() => {
        result.current.handleMoveHandwriting([10, 0], 0);
      });
      act(() => {
        result.current.handleReleaseHandwriting();
      });
      //スタンプ（スナップなし）
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: false, distance: 9999 });
      act(() => {
        result.current.setHandwritingSubTool('TOMARI');
      });
      act(() => {
        result.current.handleGrantHandwriting([50, 50], penStyle);
      });
      act(() => {
        result.current.handleReleaseHandwriting();
      });

      act(() => {
        result.current.saveLine(defaultStyle);
      });
      const saved = mockAddRecord.mock.calls.map((c) => c[1] as RecordType);
      //ペン: 色・太さ・_zoomは書かずレイヤのスタイルに従う。消しゴム互換の_stamp/_groupは書く
      expect(saved[0].field._strokeColor).toBeUndefined();
      expect(saved[0].field._strokeWidth).toBeUndefined();
      expect(saved[0].field._zoom).toBeUndefined();
      expect(saved[0].field._stamp).toBe('');
      expect(saved[0].field._group).toBe('');
      //スタンプ: 記号情報とズーム連動用の_zoomは書く
      expect(saved[1].field._stamp).toBe('TOMARI');
      expect(saved[1].field._zoom).toBe(15);
      expect(saved[1].field._strokeColor).toBeUndefined();
    });

    it('編集選択中に変更した色・太さが確定で選択オブジェクトへ反映される', () => {
      const memoLines = [
        {
          ...mockLineRecord,
          id: 'sel1',
          coords: [
            { latitude: 10, longitude: 0 },
            { latitude: 10, longitude: 10 },
          ],
          field: { _strokeWidth: 2, _strokeColor: '#ff0000', _zoom: 12 },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: memoLines,
      });
      //タップ選択はオブジェクト個別の編集に入る
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(memoLines[0]);
      mockFindLayer.mockReturnValue(mockIndividualLineLayer);
      mockFindRecord.mockImplementation((_layerId: string, _userId: string, id: string) =>
        memoLines.find((r) => r.id === id)
      );

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([0, 0]);
      });
      //タップ選択は移動・回転ではなく個別の編集モードに入る
      expect(result.current.isAreaSelected).toBe(false);
      expect(result.current.isEditingObject).toBe(true);

      //色・太さを変更した想定で保存
      let saveResult;
      act(() => {
        saveResult = result.current.saveLine(defaultStyle, { color: true, width: true });
      });
      expect(saveResult!.isOK).toBe(true);
      const saved = mockUpdateRecord.mock.calls.map((c) => c[1] as RecordType);
      expect(saved[0].field._strokeColor).toBe('rgba(0,255,0,0.7)');
      expect(saved[0].field._strokeWidth).toBe(10);
      expect(saved[0].field._zoom).toBe(15);
    });

    it('色・太さを変更していない編集選択の確定では元のスタイルが保持される', () => {
      const memoLines = [
        {
          ...mockLineRecord,
          id: 'sel2',
          coords: [
            { latitude: 10, longitude: 0 },
            { latitude: 10, longitude: 10 },
          ],
          field: { _strokeWidth: 2, _strokeColor: '#ff0000' },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: memoLines,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(memoLines);
      mockFindLayer.mockReturnValue(mockIndividualLineLayer);
      mockFindRecord.mockImplementation((_layerId: string, _userId: string, id: string) =>
        memoLines.find((r) => r.id === id)
      );

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });

      act(() => {
        result.current.saveLine(defaultStyle, { color: false, width: false });
      });
      const saved = mockUpdateRecord.mock.calls.map((c) => c[1] as RecordType);
      expect(saved[0].field._strokeColor).toBe('#ff0000');
      expect(saved[0].field._strokeWidth).toBe(2);
    });

    it('太さだけ変更した確定では色は元のまま保持される', () => {
      const memoLines = [
        {
          ...mockLineRecord,
          id: 'sel3',
          coords: [
            { latitude: 10, longitude: 0 },
            { latitude: 10, longitude: 10 },
          ],
          //ピンク・太のオブジェクト
          field: { _strokeWidth: 10, _strokeColor: 'rgba(255,105,180,0.7)' },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: memoLines,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(memoLines);
      mockFindLayer.mockReturnValue(mockIndividualLineLayer);
      mockFindRecord.mockImplementation((_layerId: string, _userId: string, id: string) =>
        memoLines.find((r) => r.id === id)
      );

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });

      //太さだけ操作（細=2へ）。色は操作していない
      act(() => {
        result.current.saveLine(
          { strokeColor: 'rgba(0,0,0,0.7)', strokeWidth: 2, strokeStyle: 'NONE', stamp: '', zoom: 15 },
          { color: false, width: true }
        );
      });
      const saved = mockUpdateRecord.mock.calls.map((c) => c[1] as RecordType);
      expect(saved[0].field._strokeWidth).toBe(2);
      //色はピンクのまま（グローバルのペン色で塗り替えない）
      expect(saved[0].field._strokeColor).toBe('rgba(255,105,180,0.7)');
    });

    it('編集選択→手書き切替で選択オブジェクトが手書きストロークに変換される', () => {
      const memoLines = [
        {
          ...mockLineRecord,
          id: 'conv1',
          coords: [
            { latitude: 10, longitude: 0 },
            { latitude: 10, longitude: 10 },
          ],
          field: { _strokeWidth: 2, _strokeColor: '#ff0000', _strokeStyle: 'NONE', _stamp: '', _zoom: 12 },
        },
        {
          ...mockLineRecord,
          id: 'conv2',
          coords: [
            { latitude: 20, longitude: 0 },
            { latitude: 20, longitude: 10 },
          ],
          //スタイルフィールドを持たないレコード（個別化前に作られた等）
          field: {},
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: memoLines,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(memoLines);

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });
      expect(result.current.drawLine.current[0].properties).not.toContain('HANDWRITING');

      act(() => {
        result.current.convertSelectionToHandwriting({
          strokeColor: 'rgba(255,0,0,0.7)',
          strokeWidth: 5,
          arrowStyle: 'NONE',
          isStraightStyle: false,
          snapWithLine: true,
        });
      });
      const lines = result.current.drawLine.current;
      //EDIT装飾が外れて手書きストロークになり、スタイルはレコードのフィールドから引き継ぐ
      expect(lines[0].properties).toEqual(['HANDWRITING']);
      expect(lines[0].style).toMatchObject({ strokeColor: '#ff0000', strokeWidth: 2, zoom: 12 });
      //フィールドが無いレコードは現在のペン設定にフォールバックする
      expect(lines[1].properties).toEqual(['HANDWRITING']);
      expect(lines[1].style).toMatchObject({ strokeColor: 'rgba(255,0,0,0.7)', strokeWidth: 5 });
      expect(result.current.isEditingObject).toBe(true);
    });

    it('編集選択時、単一選択で頂点が多いオブジェクトなら自動で手書きモードになる', () => {
      const handDrawn = [
        {
          ...mockLineRecord,
          id: 'auto1',
          coords: Array.from({ length: 20 }, (_, i) => ({ latitude: 10, longitude: i })),
          field: { _strokeWidth: 5, _strokeColor: '#ff0000', _strokeStyle: 'NONE', _stamp: '', _zoom: 15 },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: handDrawn,
      });
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(handDrawn[0]);

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([0, 0]);
      });
      //手書きモードに自動切替され、選択オブジェクトは手書きストロークに変換されている
      expect(result.current.currentDrawTool).toBe('HANDWRITING_LINE');
      expect(result.current.drawLine.current[0].properties).toEqual(['HANDWRITING']);
      expect(result.current.drawLine.current[0].style?.strokeColor).toBe('#ff0000');
    });

    it('なげなわ（ドラッグ）は頂点が多い単一選択でも移動・回転モードになる', () => {
      const handDrawn = [
        {
          ...mockLineRecord,
          id: 'lasso1',
          coords: Array.from({ length: 20 }, (_, i) => ({ latitude: 10, longitude: i })),
          field: { _strokeWidth: 5, _strokeColor: '#ff0000', _strokeStyle: 'NONE', _stamp: '', _zoom: 15 },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: handDrawn,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(handDrawn);

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });
      //ドラッグ選択は個別編集に入らず、一括変形（移動・回転）モードになる
      expect(result.current.isAreaSelected).toBe(true);
      expect(result.current.currentDrawTool).toBe('PLOT_LINE');
      expect(result.current.drawLine.current[0].properties).not.toContain('HANDWRITING');
    });

    it('編集選択時、頂点が少ないオブジェクトは_strokeColorを持っていてもプロット変形モードのまま', () => {
      const plotted = [
        {
          ...mockLineRecord,
          id: 'auto2',
          coords: [
            { latitude: 10, longitude: 0 },
            { latitude: 10, longitude: 10 },
            { latitude: 20, longitude: 10 },
          ],
          //個別スタイルのレイヤではプロットで描いたレコードも_strokeColorを持つ
          field: { _strokeColor: '#ff0000', _strokeWidth: 5 },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: plotted,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(plotted);

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });
      expect(result.current.currentDrawTool).toBe('PLOT_LINE');
      expect(result.current.drawLine.current[0].properties).not.toContain('HANDWRITING');
    });

    it('編集選択時、頂点が多くても複数選択なら移動・回転モードのまま', () => {
      const multi = [
        {
          ...mockLineRecord,
          id: 'multi1',
          coords: Array.from({ length: 20 }, (_, i) => ({ latitude: 10, longitude: i })),
          field: { _strokeColor: '#ff0000', _strokeWidth: 5 },
        },
        {
          ...mockLineRecord,
          id: 'multi2',
          coords: Array.from({ length: 20 }, (_, i) => ({ latitude: 20, longitude: i })),
          field: { _strokeColor: '#ff0000', _strokeWidth: 5 },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: multi,
      });
      (selectLineFeaturesByArea as jest.Mock).mockReturnValue(multi);

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
        for (let i = 1; i <= 6; i++) result.current.handleMoveSelect([i * 5, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([30, 0]);
      });
      expect(result.current.currentDrawTool).toBe('PLOT_LINE');
      expect(result.current.drawLine.current[0].properties).not.toContain('HANDWRITING');
    });

    it('switchSelectionToSplitで選択オブジェクトが分割対象になる', () => {
      const memoLines = [
        {
          ...mockLineRecord,
          id: 'split1',
          coords: Array.from({ length: 20 }, (_, i) => ({ latitude: 10, longitude: i })),
          field: { _strokeColor: '#ff0000', _strokeWidth: 5 },
        },
      ] as unknown as LineRecordType[];
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: memoLines,
      });
      (selectLineFeatureByLatLon as jest.Mock).mockReturnValue(memoLines[0]);

      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('SELECT');
      });
      act(() => {
        result.current.handleGrantSelect([0, 0]);
      });
      act(() => {
        result.current.handleReleaseSelect([0, 0]);
      });
      //タップ選択かつ頂点が多いので手書きモードに自動切替されている
      expect(result.current.currentDrawTool).toBe('HANDWRITING_LINE');

      let ok = false;
      act(() => {
        ok = result.current.switchSelectionToSplit();
      });
      expect(ok).toBe(true);
      //分割対象（EDIT表示）に戻り、checkSplitLineが機能する状態になる
      expect(result.current.drawLine.current[0].properties).toEqual(['EDIT']);
      (checkDistanceFromLine as jest.Mock).mockReturnValue({ isNear: true, distance: 1 });
      expect(result.current.checkSplitLine([5, 0])).toBe(true);
    });

    it('手書きストロークは自身のスタイルが優先される', () => {
      mockGetEditableLayerAndRecordSetWithCheck.mockReturnValue({
        isOK: true,
        message: '',
        layer: mockIndividualLineLayer,
        recordSet: [],
      });
      const { result } = renderDrawTool();
      act(() => {
        result.current.setFeatureButton('LINE');
      });
      act(() => {
        result.current.setDrawTool('HANDWRITING_LINE');
      });
      act(() => {
        result.current.handleGrantHandwriting([0, 0], {
          strokeColor: 'rgba(255,0,0,0.7)',
          strokeWidth: 5,
          arrowStyle: 'NONE',
          isStraightStyle: false,
          snapWithLine: true,
        });
      });
      act(() => {
        result.current.handleMoveHandwriting([10, 0], 0);
      });
      act(() => {
        result.current.handleReleaseHandwriting();
      });

      act(() => {
        result.current.saveLine(defaultStyle);
      });
      const saved = mockAddRecord.mock.calls[0][1] as RecordType;
      expect(saved.field._strokeColor).toBe('rgba(255,0,0,0.7)');
      expect(saved.field._strokeWidth).toBe(5);
    });
  });
});
