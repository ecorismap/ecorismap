import { renderHook, act } from '@testing-library/react-hooks';
import { LayerType } from '../../types';
import { useEditableLayerSelection } from '../useEditableLayerSelection';

jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

const mockActivateLayer = jest.fn();
const mockChangeVisible = jest.fn();
jest.mock('../useLayers', () => ({
  useLayers: () => ({ activateLayer: mockActivateLayer, changeVisible: mockChangeVisible }),
}));

let mockIsRunningProject = false;
jest.mock('../usePermission', () => ({
  usePermission: () => ({ isRunningProject: mockIsRunningProject }),
}));

const mockAlertAsync = jest.fn();
const mockConfirmAsync = jest.fn();
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: (...args: unknown[]) => mockAlertAsync(...args),
  ConfirmAsync: (...args: unknown[]) => mockConfirmAsync(...args),
}));

let mockLayers: LayerType[] = [];
jest.mock('react-redux', () => ({
  useDispatch: () => (action: unknown) => {
    if (typeof action === 'function') {
      return action(jest.fn(), () => ({ layers: mockLayers }));
    }
    return action;
  },
}));

const makeLayer = (overrides: Partial<LayerType>): LayerType =>
  ({
    id: 'L1',
    name: 'Layer',
    type: 'POINT',
    permission: 'PRIVATE',
    visible: true,
    active: false,
    colorStyle: {
      colorType: 'SINGLE',
      color: '#ff0000',
      transparency: 0.2,
      fieldName: '',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: '',
    field: [],
    ...overrides,
  } as LayerType);

const mockOnRequestCreateLayer = jest.fn();
const renderSelection = () =>
  renderHook(() => useEditableLayerSelection({ onRequestCreateLayer: mockOnRequestCreateLayer }));

describe('useEditableLayerSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsRunningProject = false;
    mockLayers = [];
  });

  describe('候補フィルタ', () => {
    test('trackレイヤと実行中プロジェクトのCOMMONレイヤは候補から除外される', async () => {
      mockIsRunningProject = true;
      mockLayers = [
        makeLayer({ id: 'track', name: 'トラック', type: 'LINE' }),
        makeLayer({ id: 'L1', name: 'common', type: 'LINE', permission: 'COMMON' }),
        makeLayer({ id: 'L2', name: 'private1', type: 'LINE' }),
        makeLayer({ id: 'L3', name: 'private2', type: 'LINE' }),
        makeLayer({ id: 'L4', name: 'point', type: 'POINT' }),
      ];
      const { result } = renderSelection();
      act(() => {
        result.current.openLayerSwitcher('LINE');
      });
      expect(result.current.layerSelectProps.visible).toBe(true);
      expect(result.current.layerSelectProps.candidates.map((l) => l.id)).toEqual(['L2', 'L3']);
    });

    test('MEMOはLINEレイヤを候補にする', async () => {
      mockLayers = [
        makeLayer({ id: 'L1', name: 'line1', type: 'LINE' }),
        makeLayer({ id: 'L2', name: 'line2', type: 'LINE' }),
        makeLayer({ id: 'L3', name: 'point', type: 'POINT' }),
      ];
      const { result } = renderSelection();
      act(() => {
        result.current.openLayerSwitcher('MEMO');
      });
      expect(result.current.layerSelectProps.candidates.map((l) => l.id)).toEqual(['L1', 'L2']);
    });
  });

  describe('ensureEditableLayer', () => {
    test('アクティブな表示レイヤがあればダイアログなしでtrue', async () => {
      mockLayers = [makeLayer({ id: 'L1', active: true })];
      const { result } = renderSelection();
      await act(async () => {
        await expect(result.current.ensureEditableLayer('POINT')).resolves.toBe(true);
      });
      expect(mockConfirmAsync).not.toHaveBeenCalled();
      expect(mockAlertAsync).not.toHaveBeenCalled();
    });

    test('アクティブレイヤが非表示なら確認後に表示化して続行', async () => {
      const hidden = makeLayer({ id: 'L1', active: true, visible: false });
      mockLayers = [hidden];
      mockConfirmAsync.mockResolvedValue(true);
      const { result } = renderSelection();
      await act(async () => {
        await expect(result.current.ensureEditableLayer('POINT')).resolves.toBe(true);
      });
      expect(mockConfirmAsync).toHaveBeenCalledWith('Home.confirm.showLayerAndEdit');
      expect(mockChangeVisible).toHaveBeenCalledWith(true, hidden);
    });

    test('アクティブレイヤが非表示で確認をキャンセルしたらfalse', async () => {
      mockLayers = [makeLayer({ id: 'L1', active: true, visible: false })];
      mockConfirmAsync.mockResolvedValue(false);
      const { result } = renderSelection();
      await act(async () => {
        await expect(result.current.ensureEditableLayer('POINT')).resolves.toBe(false);
      });
      expect(mockChangeVisible).not.toHaveBeenCalled();
    });

    test('候補ゼロなら新規レイヤ作成を提案し、OKでonRequestCreateLayerを呼ぶ', async () => {
      mockLayers = [makeLayer({ id: 'L1', type: 'LINE' })];
      mockConfirmAsync.mockResolvedValue(true);
      const { result } = renderSelection();
      await act(async () => {
        await expect(result.current.ensureEditableLayer('POINT')).resolves.toBe(false);
      });
      expect(mockConfirmAsync).toHaveBeenCalledWith('Home.confirm.createNewLayerForType');
      expect(mockOnRequestCreateLayer).toHaveBeenCalledWith('POINT');
    });

    test('候補ゼロで実行中プロジェクトならロック通知のみ', async () => {
      mockIsRunningProject = true;
      mockLayers = [makeLayer({ id: 'L1', permission: 'COMMON' })];
      const { result } = renderSelection();
      await act(async () => {
        await expect(result.current.ensureEditableLayer('POINT')).resolves.toBe(false);
      });
      expect(mockAlertAsync).toHaveBeenCalledWith('hooks.message.lockProject');
      expect(mockOnRequestCreateLayer).not.toHaveBeenCalled();
    });

    test('候補が1つなら確認してactive化する', async () => {
      const layer = makeLayer({ id: 'L1' });
      mockLayers = [layer];
      mockConfirmAsync.mockResolvedValue(true);
      const { result } = renderSelection();
      await act(async () => {
        await expect(result.current.ensureEditableLayer('POINT')).resolves.toBe(true);
      });
      expect(mockConfirmAsync).toHaveBeenCalledWith('Home.confirm.activateLayer');
      expect(mockActivateLayer).toHaveBeenCalledWith(layer);
    });

    test('候補が複数ならピッカーを表示し、選択でactive化してtrue', async () => {
      const layerB = makeLayer({ id: 'L2', name: 'B', visible: false });
      mockLayers = [makeLayer({ id: 'L1', name: 'A' }), layerB];
      const { result } = renderSelection();
      let promise: Promise<boolean> | undefined;
      act(() => {
        promise = result.current.ensureEditableLayer('POINT');
      });
      expect(result.current.layerSelectProps.visible).toBe(true);
      act(() => {
        result.current.layerSelectProps.onSelect(layerB);
      });
      await act(async () => {
        await expect(promise).resolves.toBe(true);
      });
      expect(mockActivateLayer).toHaveBeenCalledWith(layerB);
      //非表示レイヤを選んだ場合は表示化もされる
      expect(mockChangeVisible).toHaveBeenCalledWith(true, layerB);
      expect(result.current.layerSelectProps.visible).toBe(false);
    });

    test('ピッカーをキャンセルしたらfalse', async () => {
      mockLayers = [makeLayer({ id: 'L1' }), makeLayer({ id: 'L2' })];
      const { result } = renderSelection();
      let promise: Promise<boolean> | undefined;
      act(() => {
        promise = result.current.ensureEditableLayer('POINT');
      });
      act(() => {
        result.current.layerSelectProps.onCancel();
      });
      await act(async () => {
        await expect(promise).resolves.toBe(false);
      });
      expect(mockActivateLayer).not.toHaveBeenCalled();
    });

    test('ピッカーで新規作成を選んだらonRequestCreateLayerを呼びfalse', async () => {
      mockLayers = [makeLayer({ id: 'L1' }), makeLayer({ id: 'L2' })];
      const { result } = renderSelection();
      let promise: Promise<boolean> | undefined;
      act(() => {
        promise = result.current.ensureEditableLayer('POINT');
      });
      act(() => {
        result.current.layerSelectProps.onCreateNew();
      });
      await act(async () => {
        await expect(promise).resolves.toBe(false);
      });
      expect(mockOnRequestCreateLayer).toHaveBeenCalledWith('POINT');
    });
  });

  describe('openLayerSwitcher', () => {
    test('現在のactiveレイヤをピッカーに渡し、同じレイヤ選択なら何もしない', async () => {
      const active = makeLayer({ id: 'L1', active: true });
      mockLayers = [active, makeLayer({ id: 'L2' })];
      const { result } = renderSelection();
      let promise: Promise<void> | undefined;
      act(() => {
        promise = result.current.openLayerSwitcher('POINT');
      });
      expect(result.current.layerSelectProps.activeLayerId).toBe('L1');
      act(() => {
        result.current.layerSelectProps.onSelect(active);
      });
      await act(async () => {
        await promise;
      });
      expect(mockActivateLayer).not.toHaveBeenCalled();
      expect(mockChangeVisible).not.toHaveBeenCalled();
    });

    test('別レイヤを選択したらactive化する', async () => {
      const other = makeLayer({ id: 'L2' });
      mockLayers = [makeLayer({ id: 'L1', active: true }), other];
      const { result } = renderSelection();
      let promise: Promise<void> | undefined;
      act(() => {
        promise = result.current.openLayerSwitcher('POINT');
      });
      act(() => {
        result.current.layerSelectProps.onSelect(other);
      });
      await act(async () => {
        await promise;
      });
      expect(mockActivateLayer).toHaveBeenCalledWith(other);
    });

    test('実行中プロジェクトでは新規作成行を表示しない', async () => {
      mockIsRunningProject = true;
      mockLayers = [makeLayer({ id: 'L1' }), makeLayer({ id: 'L2' })];
      const { result } = renderSelection();
      act(() => {
        result.current.openLayerSwitcher('POINT');
      });
      expect(result.current.layerSelectProps.showCreateNew).toBe(false);
    });
  });
});
