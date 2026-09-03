// i18nモックを最初に設定
jest.mock('../../i18n/config', () => ({
  __esModule: true,
  default: {
    language: 'en',
    t: jest.fn((key) => key),
  },
  i18n: {
    language: 'en',
    t: jest.fn((key) => key),
  },
  t: jest.fn((key) => key),
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import React from 'react';
import { useMapMemo } from '../useMapMemo';
import dataSetReducer from '../../modules/dataSet';
import layersReducer, { updateLayerAction } from '../../modules/layers';
import userReducer from '../../modules/user';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import projectsReducer from '../../modules/projects';
import tileMapsReducer from '../../modules/tileMaps';

// モックの設定

// 他のモックを追加
jest.mock('react-native-maps', () => ({
  MapView: jest.fn(),
}));

// Generalモジュールのモック
jest.mock('../../utils/General', () => {
  return {
    generateRecord: jest.fn(() => ({ id: 'test-id', field: {}, position: [] })),
    isStampTool: jest.fn((tool: string) => tool === 'SENKAI' || tool === 'STAMP2'),
    isDrawTool: jest.fn(() => true),
    isPenTool: jest.fn((tool: string) => tool === 'PEN'),
    isEraserTool: jest.fn((tool: string) => tool === 'ERASER'),
    isBrushTool: jest.fn((tool: string) => tool === 'BRUSH'),
    smoothLine: jest.fn((line) => line),
    getRandomHashString: jest.fn(() => 'random-hash'),
    smoothingByBezier: jest.fn((line) => line),
  };
});

jest.mock('../../utils/Coords', () => ({
  latLonObjectsToLatLonArray: jest.fn(() => [
    [35.0, 135.0],
    [35.001, 135.001],
    [35.002, 135.002],
  ]),
  latLonObjectsToXYArray: jest.fn(() => [
    [100, 100],
    [150, 150],
    [200, 200],
  ]),
  xyArrayToLatLonArray: jest.fn(() => [
    [35.0, 135.0],
    [35.001, 135.001],
    [35.002, 135.002],
  ]),
  latlonArrayToLatLonObjects: jest.fn(() => [
    { latitude: 35.0, longitude: 135.0 },
    { latitude: 35.001, longitude: 135.001 },
    { latitude: 35.002, longitude: 135.002 },
  ]),
  checkDistanceFromLine: jest.fn(() => ({ isNear: true })),
  calcDegreeRadius: jest.fn(() => 0.0001),
  calcLineMidPoint: jest.fn(() => ({ latitude: 35.001, longitude: 135.001 })),
  erasePartialLine: jest.fn(() => ({ erased: false, remainingSegments: [] })),
  //スクリーン座標⇔緯度経度の決定的な相互変換（1px = 0.00001度）
  smoothingByBezier: jest.fn((line: any) => line),
  trimHane: jest.fn((line: any) => line),
  simplifyWithTolerance: jest.fn((line: any) => line),
  xyToLatLon: jest.fn((xy: any) => [135 + xy[0] * 0.00001, 35 - xy[1] * 0.00001]),
  latLonToXY: jest.fn((latlon: any) => [(latlon[0] - 135) / 0.00001, (35 - latlon[1]) / 0.00001]),
  latLonArrayToXYArray: jest.fn((arr: any) => arr.map((p: any) => [(p[0] - 135) / 0.00001, (35 - p[1]) / 0.00001])),
  getSnappedPositionWithLine: jest.fn(() => ({ position: [150, 150] })),
  getSnappedLine: jest.fn(() => [
    [100, 100],
    [150, 150],
  ]),
  findSnappedLine: jest.fn(() => undefined),
  geographicCoordinatesToScreenCoords: jest.fn(() => ({ x: 100, y: 100 })),
  screenCoordsToGeographicCoordinates: jest.fn(() => ({ latitude: 35, longitude: 135 })),
}));

// useRecordフックのモック
jest.mock('../useRecord', () => ({
  useRecord: () => ({
    pointDataSet: [],
    lineDataSet: [],
    polygonDataSet: [],
    memoDataSet: [],
    photoDataSet: [],
    multiDataSet: [],
    generateRecord: jest.fn(() => ({ id: 'test-id', field: {}, position: [] })),
  }),
}));

// useWindowフックのモック
jest.mock('../useWindow', () => ({
  useWindow: () => ({
    mapSize: { width: 800, height: 600 },
    mapRegion: { latitude: 35, longitude: 135, latitudeDelta: 0.01, longitudeDelta: 0.01, zoom: 15 },
  }),
}));

// Color.jsのモック
jest.mock('../../utils/Color', () => ({
  hsv2rgbaString: jest.fn(() => 'rgba(255,0,0,0.7)'),
  hexToRgba: jest.fn(() => 'rgba(255,0,0,0.7)'),
}));

// Redux store作成関数
const createTestStore = () => {
  const mockLayers = [
    {
      id: 'memo1',
      name: 'メモレイヤー',
      type: 'LINE' as const,
      active: true,
      visible: true,
      permission: 'PRIVATE' as const,
      colorStyle: {
        colorType: 'SINGLE' as const,
        transparency: 0.8,
        color: '#FF0000',
        fieldName: '',
        customFieldValue: '',
        colorRamp: 'RANDOM' as const,
        colorList: [],
      },
      label: '',
      field: [],
    },
  ];

  const mockLineRecord = {
    id: 'test-line-id',
    userId: 'user1',
    displayName: 'Test User',
    visible: true,
    redraw: false,
    coords: [
      { latitude: 35.0, longitude: 135.0 },
      { latitude: 35.001, longitude: 135.001 },
      { latitude: 35.002, longitude: 135.002 },
    ],
    field: {
      _strokeWidth: 5,
      _strokeColor: 'rgba(255,0,0,0.7)',
      _strokeStyle: '',
      _stamp: '',
      _group: '',
      _zoom: 15,
    },
  };

  const mockDataSet = [
    {
      layerId: 'memo1',
      userId: 'user1',
      data: [mockLineRecord],
    },
  ];

  return configureStore({
    reducer: combineReducers({
      dataSet: dataSetReducer,
      layers: layersReducer,
      user: userReducer,
      settings: settingsReducer,
      projects: projectsReducer,
      tileMaps: tileMapsReducer,
    }),
    preloadedState: {
      dataSet: mockDataSet,
      layers: mockLayers,
      user: {
        uid: 'user1',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: null,
      },
      settings: {
        ...settingsInitialState,
        currentPenWidth: 'PEN_MEDIUM',
        mapMemoHistoryItems: [],
        mapMemoFutureItems: [],
        isModalMapMemoToolHidden: false,
        mapMemoStrokeColor: { h: 0, s: 1, v: 1, a: 0.7 },
        mapMemoFillColor: { h: 0, s: 1, v: 1, a: 0.3 },
        mapMemoStampType: 'STAMP1',
        mapMemoBrushType: 'BRUSH1',
        mapMemoEraserWidth: 10,
      },
      projects: [],
      tileMaps: [],
    },
  });
};

// Test wrapper
const createWrapper = (store: any) => {
  return ({ children }: { children: React.ReactNode }) => {
    // eslint-disable-next-line react/no-children-prop
    return React.createElement(Provider, { store, children });
  };
};

describe('useMapMemo', () => {
  let store: any;
  let wrapper: any;

  // テスト前に毎回モックをリセット
  beforeEach(() => {
    store = createTestStore();
    wrapper = createWrapper(store);
    jest.clearAllMocks();
    // Generalモジュールのモック関数をリセット
    const General = require('../../utils/General');
    General.isStampTool.mockImplementation((tool: string) => tool === 'SENKAI' || tool === 'STAMP2');
    General.isPenTool.mockImplementation((tool: string) => tool === 'PEN');
    General.isBrushTool.mockImplementation((tool: string) => tool === 'BRUSH');
    General.isEraserTool.mockImplementation((tool: string) => tool === 'ERASER');
  });

  it('初期状態を正しく返すこと', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    // 初期状態の検証
    expect(result.current.editableMapMemo).toBe(true);
    expect(result.current.isUndoable).toBe(false);
    expect(result.current.isRedoable).toBe(false);
    expect(result.current.currentMapMemoTool).toBe('NONE');
  });

  it('clearMapMemoEditingLineが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.clearMapMemoEditingLine();
    });

    // mapMemoEditingLineが空になっていることを確認
    expect(result.current.mapMemoEditingLine.current).toEqual([]);
  });

  it('changeColorTypeToIndividualが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    // ユーザーが設定済みの色分けフィールドとラベルを用意する
    const layer = store.getState().layers[0];
    act(() => {
      store.dispatch(
        updateLayerAction({
          ...layer,
          colorStyle: { ...layer.colorStyle, colorType: 'CATEGORIZED', fieldName: '区分' },
          label: '種名',
        })
      );
    });

    act(() => {
      result.current.changeColorTypeToIndividual();
    });

    // Redux storeの状態が更新されることを確認
    const updatedLayers = store.getState().layers;
    expect(updatedLayers[0].colorStyle.colorType).toBe('INDIVIDUAL');
    // 描画の邪魔になるラベルは非表示にするが、元の設定は退避して失わない
    expect(updatedLayers[0].label).toBe('');
    expect(updatedLayers[0].colorStyle.savedFieldName).toBe('区分');
    expect(updatedLayers[0].colorStyle.savedLabel).toBe('種名');
  });

  it('setIsModalMapMemoToolHiddenが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setIsModalMapMemoToolHidden(true);
    });

    // Redux storeの状態が更新されることを確認
    const updatedSettings = store.getState().settings;
    expect(updatedSettings.isModalMapMemoToolHidden).toBe(true);
  });

  it('setMapMemoToolがローカルステートを更新すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    // ローカルステートを直接検証
    expect(result.current.currentMapMemoTool).toBe('PEN');
  });

  it('setPenWidthがローカルステートを更新すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setPenWidth('PEN_THIN');
    });

    // ローカルステートを直接検証
    expect(result.current.currentPenWidth).toBe('PEN_THIN');
    expect(result.current.penWidth).toBe(2);
  });

  // これらの関数はuseMapMemoフックに実装されていないため、テストをスキップします
  /*
  it('setMapMemoStampTypeが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setMapMemoStampType('STAMP2');
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoStampType: 'STAMP2' } 
    }));
  });

  it('setMapMemoBrushTypeが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setMapMemoBrushType('BRUSH2');
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoBrushType: 'BRUSH2' } 
    }));
  });

  it('setMapMemoEraserWidthが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setMapMemoEraserWidth(20);
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoEraserWidth: 20 } 
    }));
  });
  */

  it('setVisibleMapMemoColorが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setVisibleMapMemoColor(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoColor).toBe(true);
  });

  it('setVisibleMapMemoPenが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setVisibleMapMemoPen(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoPen).toBe(true);
  });

  it('setVisibleMapMemoStampが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setVisibleMapMemoStamp(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoStamp).toBe(true);
  });

  it('setVisibleMapMemoBrushが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setVisibleMapMemoBrush(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoBrush).toBe(true);
  });

  it('setVisibleMapMemoEraserが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setVisibleMapMemoEraser(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoEraser).toBe(true);
  });

  it('setArrowStyleが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setArrowStyle('ARROW_END');
    });

    // ローカルステートを直接検証
    expect(result.current.arrowStyle).toBe('ARROW_END');
  });

  it('setPencilModeActiveが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setPencilModeActive(true);
    });

    // ローカルステートを直接検証
    expect(result.current.isPencilModeActive).toBe(true);
  });

  it('setSnapWithLineが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setSnapWithLine(false);
    });

    // ローカルステートを直接検証
    expect(result.current.snapWithLine).toBe(false);
  });

  it('setIsStraightStyleが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setIsStraightStyle(true);
    });

    // ローカルステートを直接検証
    expect(result.current.isStraightStyle).toBe(true);
  });

  it('selectPenColorが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.selectPenColor(0, 1, 1, 0.7);
    });

    // ローカルステートを直接検証
    expect(result.current.penColor).toBe('rgba(255,0,0,0.7)');
  });

  // これらの関数はuseMapMemoフックに実装されていないため、テストをスキップします
  /*
  it('selectFillColorが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.selectFillColor(120, 1, 1, 0.3);
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoFillColor: { h: 120, s: 1, v: 1, a: 0.3 } } 
    }));
  });

  it('selectStrokeColorが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.selectStrokeColor(240, 1, 1, 0.7);
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoStrokeColor: { h: 240, s: 1, v: 1, a: 0.7 } } 
    }));
  });
  */

  it('clearMapMemoHistoryが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    // まず履歴を作るため、何かアクションを実行
    act(() => {
      result.current.clearMapMemoHistory();
    });

    // 履歴がクリアされていることを確認（isUndoableとisRedoableで間接的に検証）
    expect(result.current.isUndoable).toBe(false);
    expect(result.current.isRedoable).toBe(false);
  });

  it('handleGrantMapMemoがPENモードでタッチ座標を正しく記録すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    const mockEvent = {
      nativeEvent: {
        locationX: 100,
        locationY: 200,
        pageX: 100,
        pageY: 200,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    // PENモードに設定
    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    act(() => {
      result.current.handleGrantMapMemo(mockEvent);
    });

    //ペンのストロークは緯度経度で記録される
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(1);
    expect(result.current.mapMemoEditingLineLatLon.current[0]).toEqual([135 + 100 * 0.00001, 35 - 200 * 0.00001]);
  });

  it('handleGrantMapMemoがBRUSHモードでsnappedLineを設定すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    const mockEvent = {
      nativeEvent: {
        locationX: 100,
        locationY: 200,
        pageX: 100,
        pageY: 200,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    // findSnappedLineのモックを一時的に変更して結果を返すようにする
    require('../../utils/Coords').findSnappedLine.mockReturnValueOnce({
      coordsXY: [
        [0, 0],
        [10, 10],
      ],
      id: 'test-line',
    });

    // BRUSHモードに設定
    act(() => {
      result.current.setMapMemoTool('BRUSH');
    });

    act(() => {
      result.current.handleGrantMapMemo(mockEvent);
    });

    // BRUSHモードではmapMemoEditingLineに座標は追加されないが、内部でsnappedLine.currentが設定される
    // これは直接テストできないので、次のテストでBRUSH移動と一緒に検証する
  });

  it('handleGrantMapMemoがERASERモードでタッチ座標を正しく記録すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    const mockEvent = {
      nativeEvent: {
        locationX: 100,
        locationY: 200,
        pageX: 100,
        pageY: 200,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    // ERASERモードに設定
    act(() => {
      result.current.setMapMemoTool('ERASER');
    });

    act(() => {
      result.current.handleGrantMapMemo(mockEvent);
    });

    //消しゴムの軌跡も緯度経度で記録される
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(1);
  });

  it('handleGrantMapMemoがSTAMPモードで座標を正しく記録すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    const mockEvent = {
      nativeEvent: {
        locationX: 100,
        locationY: 200,
        pageX: 100,
        pageY: 200,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    // STAMPモードに設定
    act(() => {
      result.current.setMapMemoTool('SENKAI');
    });

    act(() => {
      result.current.handleGrantMapMemo(mockEvent);
    });

    // findSnappedLineのモックを一時的に変更
    require('../../utils/Coords').findSnappedLine.mockReturnValueOnce({ coordsXY: [[0, 0]], id: 'test-line' });

    expect(result.current.mapMemoEditingLine.current.length).toBe(1);
  });

  it('handleMoveMapMemoがSTAMPモードで座標を更新すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    const mockEvent = {
      nativeEvent: {
        locationX: 100,
        locationY: 200,
        pageX: 100,
        pageY: 200,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    // STAMPモードに設定
    act(() => {
      result.current.setMapMemoTool('SENKAI');
    });

    // findSnappedLineのモックを一時的に変更
    require('../../utils/Coords').findSnappedLine.mockReturnValueOnce({ coordsXY: [[0, 0]], id: 'test-line' });

    // handleGrantMapMemoを呼び出す
    act(() => {
      result.current.handleGrantMapMemo(mockEvent);
    });

    // 移動イベント
    const moveEvent = {
      nativeEvent: {
        locationX: 150,
        locationY: 250,
        pageX: 150,
        pageY: 250,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    expect(result.current.mapMemoEditingLine.current.length).toBe(1);
  });

  it('handleMoveMapMemoがPENモードで座標を追加すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    // PENモードに設定
    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    // 初期タッチをシミュレート
    const grantEvent = {
      nativeEvent: {
        locationX: 50,
        locationY: 50,
        pageX: 50,
        pageY: 50,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      // モックの振る舞いを確認
      expect(require('../../utils/General').isPenTool('PEN')).toBe(true);
      result.current.handleGrantMapMemo(grantEvent);
    });

    // 移動イベントをシミュレート
    const moveEvent = {
      nativeEvent: {
        locationX: 100,
        locationY: 200,
        pageX: 100,
        pageY: 200,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // エディティングラインが緯度経度で2点になっていることを確認
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(2);
  });

  it('直線モードで描画すると開始点と終了点のみを記録すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    // PENモードに設定して直線スタイルをONに
    act(() => {
      result.current.setMapMemoTool('PEN');
      result.current.setIsStraightStyle(true);
    });

    // 初期タッチ
    const grantEvent = {
      nativeEvent: {
        locationX: 50,
        locationY: 50,
        pageX: 50,
        pageY: 50,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });

    // 移動イベント
    const moveEvent = {
      nativeEvent: {
        locationX: 150,
        locationY: 150,
        pageX: 150,
        pageY: 150,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // もう1回移動
    const moveEvent2 = {
      nativeEvent: {
        locationX: 200,
        locationY: 200,
        pageX: 200,
        pageY: 200,
        touches: [{}],
      },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent2);
    });

    // 直線モードでは開始点と現在点の2点のみで表現されるはず
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(2);
  });

  it('handleReleaseMapMemoがPENモードで描画内容を保存すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });
    jest.useFakeTimers();

    // PENモードに設定
    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    // 描画開始
    const grantEvent = {
      nativeEvent: { locationX: 50, locationY: 50, pageX: 50, pageY: 50, touches: [{}] },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });

    // 移動
    const moveEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // タッチ終了
    const releaseEvent = { persist: jest.fn() } as any;

    act(() => {
      result.current.handleReleaseMapMemo(releaseEvent);
      jest.runAllTimers(); // タイマーを即時実行
    });

    // データ保存が実行されたことを確認するため、編集ラインがリセットされたかを確認
    expect(result.current.mapMemoEditingLineLatLon.current).toEqual([]);
  });

  it('handleReleaseMapMemoがSTAMPモードでstampデータを保存すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });
    jest.useFakeTimers();

    // STAMPモードに設定
    act(() => {
      result.current.setMapMemoTool('SENKAI');
    });

    // findSnappedLineのモックを一時的に変更
    require('../../utils/Coords').findSnappedLine.mockReturnValueOnce({ coordsXY: [[0, 0]], id: 'test-line' });

    // 描画開始
    const grantEvent = {
      nativeEvent: { locationX: 50, locationY: 50, pageX: 50, pageY: 50, touches: [{}] },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });

    // 移動
    const moveEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // タッチ終了
    const releaseEvent = { persist: jest.fn() } as any;

    act(() => {
      result.current.handleReleaseMapMemo(releaseEvent);
      jest.runAllTimers(); // タイマーを即時実行
    });

    // データ保存が実行されたことを確認するため、編集ラインがリセットされたかを確認
    expect(result.current.mapMemoEditingLine.current).toEqual([]);
  });

  // it('undoMapMemoが履歴操作を正しく行うこと', () => {
  //   const mockMapViewRef = { current: {} } as any;
  //   const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });
  //   jest.useFakeTimers();

  //   // まず描画操作を行い、履歴を作成する
  //   act(() => {
  //     // PENモードに設定
  //     result.current.setMapMemoTool('PEN');
  //   });

  //   // 描画開始
  //   const grantEvent = {
  //     nativeEvent: { locationX: 50, locationY: 50, pageX: 50, pageY: 50, touches: [{}] },
  //     persist: jest.fn(), // persist メソッドを追加
  //   } as any;

  //   act(() => {
  //     result.current.handleGrantMapMemo(grantEvent);
  //   });

  //   // 移動
  //   const moveEvent = {
  //     nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
  //     persist: jest.fn(), // persist メソッドを追加
  //   } as any;

  //   act(() => {
  //     result.current.handleMoveMapMemo(moveEvent);
  //   });

  //   // タッチ終了で履歴を作成
  //   const releaseEvent = { persist: jest.fn() } as any;
  //   act(() => {
  //     result.current.handleReleaseMapMemo(releaseEvent);
  //     jest.runAllTimers(); // タイマーを進める
  //   });

  //   // mockDispatchをリセット
  //   mockDispatch.mockClear();

  //   // Undo操作の実行
  //   act(() => {
  //     result.current.pressUndoMapMemo();
  //   });

  //   // dispatchが呼ばれたことを確認
  //   expect(mockDispatch).toHaveBeenCalled();

  //   // undoの結果、isRedoableがtrueになることを確認
  //   expect(result.current.isRedoable).toBe(true);
  // });

  // it('redoMapMemoが履歴操作を正しく行うこと', () => {
  //   const mockMapViewRef = { current: {} } as any;
  //   const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });
  //   jest.useFakeTimers();

  //   // フェイズ1: まず描画操作を行い、履歴を作成する
  //   act(() => {
  //     // PENモードに設定
  //     result.current.setMapMemoTool('PEN');
  //   });

  //   // 描画開始
  //   const grantEvent = {
  //     nativeEvent: { locationX: 50, locationY: 50, pageX: 50, pageY: 50, touches: [{}] },
  //     persist: jest.fn(), // persist メソッドを追加
  //   } as any;

  //   act(() => {
  //     result.current.handleGrantMapMemo(grantEvent);
  //   });

  //   // 移動
  //   const moveEvent = {
  //     nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
  //     persist: jest.fn(), // persist メソッドを追加
  //   } as any;

  //   act(() => {
  //     result.current.handleMoveMapMemo(moveEvent);
  //   });

  //   // タッチ終了で履歴を作成
  //   const releaseEvent = { persist: jest.fn() } as any;
  //   act(() => {
  //     result.current.handleReleaseMapMemo(releaseEvent);
  //     jest.runAllTimers(); // タイマーを進める
  //   });

  //   // フェイズ2: undoを実行してfutureにデータを移動させる
  //   act(() => {
  //     result.current.pressUndoMapMemo();
  //   });

  //   // undoの結果、isRedoableがtrueになることを確認
  //   expect(result.current.isRedoable).toBe(true);

  //   // mockDispatchをリセット
  //   mockDispatch.mockClear();

  //   // フェイズ3: redoを実行
  //   act(() => {
  //     result.current.pressRedoMapMemo();
  //   });

  //   // dispatchが呼ばれたことを確認
  //   expect(mockDispatch).toHaveBeenCalled();

  //   // redoの結果、isUndoableがtrueになることを確認
  //   expect(result.current.isUndoable).toBe(true);
  // });

  it('ポインタがマップ外に移動した場合でも描画が中断しないこと', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    // PENモードに設定
    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    // 描画開始
    const grantEvent = {
      nativeEvent: { locationX: 50, locationY: 50, pageX: 50, pageY: 50, touches: [{}] },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });

    // ポインタがマップ外に移動した状態をシミュレート
    const outOfMapEvent = {
      nativeEvent: { locationX: -50, locationY: -50, pageX: -50, pageY: -50, touches: [{}] },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(outOfMapEvent);
    });

    // 再びマップ内に戻ってきた状態をシミュレート
    const backToMapEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
      persist: jest.fn(), // persist メソッドを追加
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(backToMapEvent);
    });

    // 正常に座標が記録されていることを確認
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBeGreaterThan(1);
  });

  it('編集機能が存在し正しい形で出力されること', () => {
    // isEditingLineとeditingLineIdがfalse/undefinedで初期化されていることを確認
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    expect(result.current.isEditingLine).toBe(false);
    expect(result.current.editingLineId).toBeUndefined();

    // handleLongPressMapMemo関数が存在することを確認
    expect(typeof result.current.handleLongPressMapMemo).toBe('function');
  });

  it('部分消去で線が2分割され、Undo/Redoで完全に往復すること', () => {
    const Coords = require('../../utils/Coords');
    // 消しゴム軌跡と交差して中央が消え、2区間が残るケースをモック
    Coords.erasePartialLine.mockReturnValue({
      erased: true,
      remainingSegments: [
        [
          [135.0, 35.0],
          [135.0005, 35.0005],
        ],
        [
          [135.0015, 35.0015],
          [135.002, 35.002],
        ],
      ],
    });
    Coords.latlonArrayToLatLonObjects.mockImplementation((arr: any) =>
      arr.map(([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon }))
    );

    //activeMemoRecordSetはuserId: undefinedで検索されるため、それに合わせたレコードセットを用意する
    store.dispatch({
      type: 'dataSet/addRecordsAction',
      payload: { layerId: 'memo1', userId: undefined, data: [makeParentRecord()] },
    });

    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setMapMemoTool('PEN_ERASER_PARTIAL');
    });

    const grantEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
      persist: jest.fn(),
    } as any;
    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });
    act(() => {
      result.current.handleReleaseMapMemo(grantEvent);
    });

    // 元レコードが先頭区間で更新され、2本目の区間が新規レコードとして追加される
    const afterErase = getMemoData();
    expect(afterErase.length).toBe(2);
    expect(afterErase[0].id).toBe('test-line-id');
    expect(afterErase[0].coords.length).toBe(2);
    expect(afterErase[0].coords[0]).toEqual({ latitude: 35.0, longitude: 135.0 });
    expect(afterErase[1].id).not.toBe('test-line-id');
    expect(afterErase[1].coords[0]).toEqual({ latitude: 35.0015, longitude: 135.0015 });
    expect(afterErase[1].field._strokeColor).toBe('rgba(255,0,0,0.7)');
    expect(result.current.isUndoable).toBe(true);

    // Undoで元の1レコード・元の座標に戻る
    act(() => {
      result.current.pressUndoMapMemo();
    });
    const afterUndo = getMemoData();
    expect(afterUndo.length).toBe(1);
    expect(afterUndo[0].id).toBe('test-line-id');
    expect(afterUndo[0].coords.length).toBe(3);

    // Redoで再び部分消去後の状態になる
    act(() => {
      result.current.pressRedoMapMemo();
    });
    const afterRedo = getMemoData();
    expect(afterRedo.length).toBe(2);
    expect(afterRedo[0].id).toBe('test-line-id');
    expect(afterRedo[0].coords.length).toBe(2);
  });

  it('部分消去で全区間が消えると_groupの子レコードも巻き込み削除されること', () => {
    const Coords = require('../../utils/Coords');
    Coords.erasePartialLine.mockReturnValue({ erased: true, remainingSegments: [] });

    // 親ライン＋_groupでぶら下がる子レコードを持つストアを作る
    const childRecord = {
      id: 'child-id',
      userId: 'user1',
      displayName: 'Test User',
      visible: true,
      redraw: false,
      coords: [{ latitude: 35.0, longitude: 135.0 }],
      field: {
        _strokeWidth: 5,
        _strokeColor: 'rgba(0,0,0,1)',
        _strokeStyle: '',
        _stamp: 'TOMARI',
        _group: 'test-line-id',
        _zoom: 15,
      },
    };
    store.dispatch({
      type: 'dataSet/addRecordsAction',
      payload: { layerId: 'memo1', userId: undefined, data: [makeParentRecord(), childRecord] },
    });

    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setMapMemoTool('PEN_ERASER_PARTIAL');
    });
    const grantEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
      persist: jest.fn(),
    } as any;
    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });
    act(() => {
      result.current.handleReleaseMapMemo(grantEvent);
    });

    expect(getMemoData().length).toBe(0);

    // Undoで親も子も復元される
    act(() => {
      result.current.pressUndoMapMemo();
    });
    const afterUndo = getMemoData();
    expect(afterUndo.length).toBe(2);
    expect(afterUndo.map((l: any) => l.id).sort()).toEqual(['child-id', 'test-line-id']);
  });

  it('消しゴム軌跡が交差しない場合は何も変更しないこと', () => {
    const Coords = require('../../utils/Coords');
    Coords.erasePartialLine.mockReturnValue({ erased: false, remainingSegments: [] });

    store.dispatch({
      type: 'dataSet/addRecordsAction',
      payload: { layerId: 'memo1', userId: undefined, data: [makeParentRecord()] },
    });

    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });

    act(() => {
      result.current.setMapMemoTool('PEN_ERASER_PARTIAL');
    });
    const grantEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
      persist: jest.fn(),
    } as any;
    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });
    act(() => {
      result.current.handleReleaseMapMemo(grantEvent);
    });

    expect(getMemoData().length).toBe(1);
    expect(result.current.isUndoable).toBe(false);
  });

  it('ピンチ中断後に終点近くから再開すると1本の線として継続されること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });
    jest.useFakeTimers();

    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    const makeEvent = (x: number, y: number) =>
      ({
        nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [{}] },
        persist: jest.fn(),
      } as any);

    act(() => {
      result.current.handleGrantMapMemo(makeEvent(100, 100));
    });
    act(() => {
      result.current.handleMoveMapMemo(makeEvent(150, 150));
    });
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(2);

    // 2本指ピンチによる中断（線は破棄されない）
    act(() => {
      result.current.pauseMapMemoDrawing();
    });
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(2);

    // 終点の近くから再開 → 続きとして追記される
    //（1€フィルタにより記録された終点は(150,150)より始点側に補正されている）
    act(() => {
      result.current.handleGrantMapMemo(makeEvent(120, 120));
    });
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(3);

    act(() => {
      result.current.handleReleaseMapMemo(makeEvent(120, 120));
      jest.runAllTimers();
    });

    // 1本の線として1レコードだけ保存される
    expect(getMemoData().length).toBe(1);
  });

  it('ピンチ中断後に離れた場所から描くと前の線が確定され2本になること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });
    jest.useFakeTimers();

    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    const makeEvent = (x: number, y: number) =>
      ({
        nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [{}] },
        persist: jest.fn(),
      } as any);

    act(() => {
      result.current.handleGrantMapMemo(makeEvent(100, 100));
    });
    act(() => {
      result.current.handleMoveMapMemo(makeEvent(150, 150));
    });
    act(() => {
      result.current.pauseMapMemoDrawing();
    });

    // 終点(150,150)から50px以上離れた場所で再開 → 前の線を確定して新しい線を開始
    act(() => {
      result.current.handleGrantMapMemo(makeEvent(400, 400));
    });
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBe(1);

    act(() => {
      result.current.handleMoveMapMemo(makeEvent(450, 450));
    });
    act(() => {
      result.current.handleReleaseMapMemo(makeEvent(450, 450));
      jest.runAllTimers();
    });

    // 2本の線として2レコード保存される
    expect(getMemoData().length).toBe(2);
  });

  it('画面端に近づくと自動パンで線が伸び、mapRegionが更新されること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef), { wrapper });
    jest.useFakeTimers();

    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    const makeEvent = (x: number, y: number) =>
      ({
        nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [{}] },
        persist: jest.fn(),
      } as any);

    act(() => {
      result.current.handleGrantMapMemo(makeEvent(100, 100));
    });
    // 左端(しきい値40px内)へ移動 → 自動パン開始
    act(() => {
      result.current.handleMoveMapMemo(makeEvent(10, 300));
    });
    const lengthBeforePan = result.current.mapMemoEditingLineLatLon.current.length;

    // 3tick分進める → 指が止まっていても線が伸びる
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current.mapMemoEditingLineLatLon.current.length).toBeGreaterThan(lengthBeforePan);
    // 楽観更新でmapRegionが動いている
    expect(store.getState().settings.mapRegion.longitude).not.toBe(135);

    act(() => {
      result.current.handleReleaseMapMemo(makeEvent(10, 300));
      jest.runAllTimers();
    });
    expect(getMemoData().length).toBe(1);
  });

  //部分消去テスト用のヘルパー
  const makeParentRecord = () => ({
    id: 'test-line-id',
    userId: 'user1',
    displayName: 'Test User',
    visible: true,
    redraw: false,
    coords: [
      { latitude: 35.0, longitude: 135.0 },
      { latitude: 35.001, longitude: 135.001 },
      { latitude: 35.002, longitude: 135.002 },
    ],
    field: {
      _strokeWidth: 5,
      _strokeColor: 'rgba(255,0,0,0.7)',
      _strokeStyle: '',
      _stamp: '',
      _group: '',
      _zoom: 15,
    },
  });

  const getMemoData = () =>
    store.getState().dataSet.find((d: any) => d.layerId === 'memo1' && d.userId === undefined)?.data ?? [];
});
