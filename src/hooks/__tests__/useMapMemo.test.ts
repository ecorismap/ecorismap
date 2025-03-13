import { renderHook, act } from '@testing-library/react-hooks';
import { useMapMemo } from '../useMapMemo';

// モックの設定
const mockDispatch = jest.fn();

// react-reduxモジュール全体をモック
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => {
    // テスト用のモックステート
    const mockState = {
      // layers構造を修正 - layersは直接配列にする
      layers: [{ id: 'memo1', name: 'メモレイヤー', type: 'LINE', active: true, visible: true }],
      activeLayerId: 'memo1',

      // dataSetも配列に修正
      dataSet: [],

      user: { uid: 'user1' },

      settings: {
        currentPenWidth: 'PEN_MEDIUM',
        mapMemoHistoryItems: [],
        mapMemoFutureItems: [],
        isModalMapMemoToolHidden: false,
      },
    };
    return selector(mockState);
  },
}));

// 他のモックを追加
jest.mock('react-native-maps', () => ({
  MapView: jest.fn(),
}));

jest.mock('../../utils/General', () => ({
  generateRecord: jest.fn(() => ({ id: 'test-id', field: {}, position: [] })),
}));

// useRecordフックもモックする必要があるかもしれない
jest.mock('../useRecord', () => ({
  useRecord: () => ({
    pointDataSet: [],
    lineDataSet: [],
    polygonDataSet: [],
    memoDataSet: [],
    photoDataSet: [],
    multiDataSet: [],
  }),
}));

describe('useMapMemo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { isModalMapMemoToolHidden: true }, type: 'settings/editSettingsAction' })
    );
  });
});
