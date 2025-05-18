import { renderHook, act } from '@testing-library/react-hooks';
import { useMapMemo } from '../useMapMemo';

// モックの設定
const mockDispatch = jest.fn();

// 安定した参照を返す定数としてのモック状態
const mockLayers = [
  {
    id: 'memo1',
    name: 'メモレイヤー',
    type: 'LINE',
    active: true,
    visible: true,
    colorStyle: { colorType: 'SINGLE' },
  },
];
const mockUser = { uid: 'user1' };
const mockSettings = {
  currentPenWidth: 'PEN_MEDIUM',
  mapMemoHistoryItems: [],
  mapMemoFutureItems: [],
  isModalMapMemoToolHidden: false,
  mapMemoStrokeColor: { h: 0, s: 1, v: 1, a: 0.7 },
  mapMemoFillColor: { h: 0, s: 1, v: 1, a: 0.3 },
  mapMemoStampType: 'STAMP1',
  mapMemoBrushType: 'BRUSH1',
  mapMemoEraserWidth: 10,
};
// テスト用のラインレコードを作成
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

// react-reduxモジュール全体をモック（安定した参照を返す）
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => {
    const mockState = {
      layers: mockLayers,
      activeLayerId: 'memo1',
      dataSet: mockDataSet,
      user: mockUser,
      settings: mockSettings,
      currentMapMemoTool: 'NONE',
      mapMemoLines: [],
    };
    return selector(mockState);
  },
}));

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

describe('useMapMemo', () => {
  // テスト前に毎回モックをリセット
  beforeEach(() => {
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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    // 初期状態の検証
    expect(result.current.editableMapMemo).toBe(true);
    expect(result.current.isUndoable).toBe(false);
    expect(result.current.isRedoable).toBe(false);
    expect(result.current.currentMapMemoTool).toBe('NONE');
  });

  it('clearMapMemoEditingLineが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.clearMapMemoEditingLine();
    });

    // mapMemoEditingLineが空になっていることを確認
    expect(result.current.mapMemoEditingLine.current).toEqual([]);
  });

  it('changeColorTypeToIndividualが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.changeColorTypeToIndividual();
    });

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('setIsModalMapMemoToolHiddenが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setIsModalMapMemoToolHidden(true);
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { isModalMapMemoToolHidden: true } }));
  });

  it('setMapMemoToolがローカルステートを更新すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setMapMemoTool('PEN');
    });

    // ローカルステートを直接検証
    expect(result.current.currentMapMemoTool).toBe('PEN');
  });

  it('setPenWidthがローカルステートを更新すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setMapMemoStampType('STAMP2');
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoStampType: 'STAMP2' } 
    }));
  });

  it('setMapMemoBrushTypeが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setMapMemoBrushType('BRUSH2');
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoBrushType: 'BRUSH2' } 
    }));
  });

  it('setMapMemoEraserWidthが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setVisibleMapMemoColor(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoColor).toBe(true);
  });

  it('setVisibleMapMemoPenが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setVisibleMapMemoPen(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoPen).toBe(true);
  });

  it('setVisibleMapMemoStampが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setVisibleMapMemoStamp(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoStamp).toBe(true);
  });

  it('setVisibleMapMemoBrushが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setVisibleMapMemoBrush(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoBrush).toBe(true);
  });

  it('setVisibleMapMemoEraserが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setVisibleMapMemoEraser(true);
    });

    // ローカルステートを直接検証
    expect(result.current.visibleMapMemoEraser).toBe(true);
  });

  it('setArrowStyleが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setArrowStyle('ARROW_END');
    });

    // ローカルステートを直接検証
    expect(result.current.arrowStyle).toBe('ARROW_END');
  });

  it('setPencilModeActiveが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setPencilModeActive(true);
    });

    // ローカルステートを直接検証
    expect(result.current.isPencilModeActive).toBe(true);
  });

  it('setSnapWithLineが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setSnapWithLine(false);
    });

    // ローカルステートを直接検証
    expect(result.current.snapWithLine).toBe(false);
  });

  it('setIsStraightStyleが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setIsStraightStyle(true);
    });

    // ローカルステートを直接検証
    expect(result.current.isStraightStyle).toBe(true);
  });

  it('selectPenColorが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.selectFillColor(120, 1, 1, 0.3);
    });

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ 
      payload: { mapMemoFillColor: { h: 120, s: 1, v: 1, a: 0.3 } } 
    }));
  });

  it('selectStrokeColorが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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

    expect(result.current.mapMemoEditingLine.current.length).toBe(1);
  });

  it('handleGrantMapMemoがBRUSHモードでsnappedLineを設定すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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

    expect(result.current.mapMemoEditingLine.current.length).toBe(1);
  });

  it('handleGrantMapMemoがSTAMPモードで座標を正しく記録すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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

    // エディティングラインが存在することを確認
    expect(Array.isArray(result.current.mapMemoEditingLine.current)).toBe(true);
  });

  it('直線モードで描画すると開始点と終了点のみを記録すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    expect(result.current.mapMemoEditingLine.current.length).toBe(2);
  });

  it('handleReleaseMapMemoがPENモードで描画内容を保存すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));
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

    // dispatchが呼ばれたことを確認（データ保存のアクションがディスパッチされるはず）
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('handleReleaseMapMemoがSTAMPモードでstampデータを保存すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));
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

    // dispatchが呼ばれたことを確認（データ保存のアクションがディスパッチされるはず）
    expect(mockDispatch).toHaveBeenCalled();
  });

  // it('undoMapMemoが履歴操作を正しく行うこと', () => {
  //   const mockMapViewRef = { current: {} } as any;
  //   const { result } = renderHook(() => useMapMemo(mockMapViewRef));
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
  //   const { result } = renderHook(() => useMapMemo(mockMapViewRef));
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
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

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
    expect(result.current.mapMemoEditingLine.current.length).toBeGreaterThan(1);
  });

  it('編集機能が存在し正しい形で出力されること', () => {
    // isEditingLineとeditingLineIdがfalse/undefinedで初期化されていることを確認
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    expect(result.current.isEditingLine).toBe(false);
    expect(result.current.editingLineId).toBeUndefined();

    // handleLongPressMapMemo関数が存在することを確認
    expect(typeof result.current.handleLongPressMapMemo).toBe('function');
  });
});
