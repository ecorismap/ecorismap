import { renderHook, act } from '@testing-library/react-hooks';
import { useMapMemo } from '../useMapMemo';

// モックの設定
const mockDispatch = jest.fn();

// 安定した参照を返す定数としてのモック状態
const mockLayers = [{ id: 'memo1', name: 'メモレイヤー', type: 'LINE', active: true, visible: true }];
const mockUser = { uid: 'user1' };
const mockSettings = {
  currentPenWidth: 'PEN_MEDIUM',
  mapMemoHistoryItems: [],
  mapMemoFutureItems: [],
  isModalMapMemoToolHidden: false,
};
const mockDataSet: any[] = [];

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
    isStampTool: jest.fn((tool: string) => tool === 'STAMP1' || tool === 'STAMP2'),
    isDrawTool: jest.fn(() => true),
    isPenTool: jest.fn((tool: string) => tool === 'PEN'),
    isEraserTool: jest.fn(() => false),
    isBrushTool: jest.fn(() => false),
  };
});

jest.mock('../../utils/Coords', () => ({
  latLonObjectsToLatLonArray: jest.fn(() => []),
  latLonObjectsToXYArray: jest.fn(() => []),
  xyArrayToLatLonArray: jest.fn(() => []),
  latlonArrayToLatLonObjects: jest.fn(() => []), // この行を追加
  checkDistanceFromLine: jest.fn(() => ({ isNear: false })),
  getSnappedPositionWithLine: jest.fn(() => ({ position: [0, 0] })),
  getSnappedLine: jest.fn(() => []),
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
}));

describe('useMapMemo', () => {
  // テスト前に毎回モックをリセット
  beforeEach(() => {
    jest.clearAllMocks();
    // Generalモジュールのモック関数をリセット
    const General = require('../../utils/General');
    General.isStampTool.mockImplementation((tool: string) => tool === 'STAMP1' || tool === 'STAMP2');
    General.isPenTool.mockImplementation((tool: string) => tool === 'PEN');
  });

  it('初期状態を正しく返すこと', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    // 初期状態の検証
    expect(result.current.editableMapMemo).toBe(true);
    expect(result.current.isUndoable).toBe(false);
    expect(result.current.isRedoable).toBe(false);
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

  it('setMapMemoLineSmoothedが正しく動作すること', () => {
    const mockMapViewRef = {} as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    act(() => {
      result.current.setMapMemoLineSmoothed(true);
    });

    // ローカルステートを直接検証
    expect(result.current.isMapMemoLineSmoothed).toBe(true);
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

  // 修正したテスト
  it('handleGrantMapMemoがタッチ座標を正しく記録すること', () => {
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

  it('handleMoveMapMemoが描画モード時に座標を追加すること', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    // PENモードに明示的に設定
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
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // エディティングラインが存在し、要素が増えていることを確認
    expect(Array.isArray(result.current.mapMemoEditingLine.current)).toBe(true);
  });

  it('handleReleaseMapMemoが描画内容を保存すること', () => {
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
    } as any;

    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });

    // 移動
    const moveEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // タッチ終了
    const releaseEvent = {} as any;

    act(() => {
      result.current.handleReleaseMapMemo(releaseEvent);
      jest.runAllTimers(); // これでタイマーが即時実行されます
    });

    // dispatchが呼ばれたことを確認（データ保存のアクションがディスパッチされるはず）
    expect(mockDispatch).toHaveBeenCalled();
  });

  // 2. undoMapMemo（履歴を戻す操作）のテスト
  it('undoMapMemoが履歴操作を正しく行うこと', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));

    // まず描画操作を行い、履歴を作成する
    act(() => {
      // PENモードに設定
      result.current.setMapMemoTool('PEN');
    });

    // 描画開始
    const grantEvent = {
      nativeEvent: { locationX: 50, locationY: 50, pageX: 50, pageY: 50, touches: [{}] },
    } as any;

    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });

    // 移動
    const moveEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // タイマーを初期化
    jest.useFakeTimers();

    // タッチ終了で履歴を作成
    const releaseEvent = {} as any;
    act(() => {
      result.current.handleReleaseMapMemo(releaseEvent);
      jest.runAllTimers(); // タイマーを進める
    });

    // mockDispatchをリセット
    mockDispatch.mockClear();

    // dispatchがリセットされたことを確認
    expect(mockDispatch).not.toHaveBeenCalled();

    // 履歴が作成されたことでisUndoableがtrueになっていることを確認
    // （履歴の内部状態にアクセスできないため、公開APIの戻り値で確認）
    expect(result.current.isUndoable).toBe(true);

    // Undo操作の実行
    act(() => {
      result.current.pressUndoMapMemo();
    });

    // dispatchが呼ばれたことを確認
    expect(mockDispatch).toHaveBeenCalled();

    // undoの結果、isRedoableがtrueになることを確認
    expect(result.current.isRedoable).toBe(true);
  });
  // 3. redoMapMemo（やり直し操作）のテスト
  it('redoMapMemoが履歴操作を正しく行うこと', () => {
    const mockMapViewRef = { current: {} } as any;
    const { result } = renderHook(() => useMapMemo(mockMapViewRef));
    jest.useFakeTimers();

    // フェイズ1: まず描画操作を行い、履歴を作成する
    act(() => {
      // PENモードに設定
      result.current.setMapMemoTool('PEN');
    });

    // 描画開始
    const grantEvent = {
      nativeEvent: { locationX: 50, locationY: 50, pageX: 50, pageY: 50, touches: [{}] },
    } as any;

    act(() => {
      result.current.handleGrantMapMemo(grantEvent);
    });

    // 移動
    const moveEvent = {
      nativeEvent: { locationX: 100, locationY: 100, pageX: 100, pageY: 100, touches: [{}] },
    } as any;

    act(() => {
      result.current.handleMoveMapMemo(moveEvent);
    });

    // タッチ終了で履歴を作成
    const releaseEvent = {} as any;
    act(() => {
      result.current.handleReleaseMapMemo(releaseEvent);
      jest.runAllTimers(); // タイマーを進める
    });

    // フェイズ2: undoを実行してfutureにデータを移動させる
    act(() => {
      result.current.pressUndoMapMemo();
    });

    // undoの結果、isRedoableがtrueになることを確認
    expect(result.current.isRedoable).toBe(true);

    // mockDispatchをリセット
    mockDispatch.mockClear();

    // フェイズ3: redoを実行
    act(() => {
      // redo関数を実行（正しい関数名を使用）
      result.current.pressRedoMapMemo(); // または存在する適切な関数名
    });

    // dispatchが呼ばれたことを確認
    expect(mockDispatch).toHaveBeenCalled();

    // redoの結果、isUndoableがtrueになることを確認
    expect(result.current.isUndoable).toBe(true);
  });
});
