import { LayerType } from '../../types';
// COLOR のインポートは不要になる可能性があるためコメントアウトまたは削除
// import { COLOR } from '../../constants/AppConstants';
import { useLayers } from '../useLayers';
import { renderHook, act } from '@testing-library/react-hooks';

// 新しい構造に基づいたテスト用 layers データ
const initialLayers: LayerType[] = [
  {
    id: 'L1',
    name: 'Layer 1',
    type: 'POINT',
    visible: true,
    active: true,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: '#ff0000',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      lineWidth: 1.5, // 追加 (POINTにも適用されるか確認)
    },
    label: 'name',
    field: [],
  },
  {
    id: 'G1',
    name: 'Group 1',
    type: 'LAYERGROUP',
    visible: true,
    expanded: true,
    permission: 'PRIVATE',
    active: false,
    colorStyle: {
      colorType: 'SINGLE',
      color: '#ff0000',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      lineWidth: 1.5, // 追加
    },
    label: '',
    field: [],
  },
  {
    id: 'L2',
    name: 'Layer 2',
    type: 'POINT',
    visible: true,
    groupId: 'G1',
    expanded: true,
    active: false,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: '#00ff00',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      lineWidth: 1.5, // 追加
    },
    label: 'id',
    field: [],
  },
  {
    id: 'L3',
    name: 'Layer 3',
    type: 'LINE',
    visible: true,
    groupId: 'G1',
    expanded: true,
    active: false,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: '#0000ff',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      lineWidth: 1.5, // 追加
    },
    label: 'id',
    field: [],
  },
  {
    id: 'L4',
    name: 'Layer 4',
    type: 'POLYGON',
    visible: true,
    active: false,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: '#ffff00',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      lineWidth: 1.5, // 追加
    },
    label: 'name',
    field: [],
  },
  {
    id: 'G2',
    name: 'Group 2',
    type: 'LAYERGROUP',
    visible: true,
    expanded: false,
    permission: 'PRIVATE',
    active: false,
    colorStyle: {
      colorType: 'SINGLE',
      color: '#ff00ff',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      lineWidth: 1.5, // 追加
    },
    label: '',
    field: [],
  },
  {
    id: 'L5',
    name: 'Layer 5',
    type: 'POINT',
    visible: true,
    groupId: 'G2',
    expanded: false,
    active: false,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: '#00ffff',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      lineWidth: 1.5, // 追加
    },
    label: 'id',
    field: [],
  },
  {
    id: 'L6',
    name: 'Layer 6',
    type: 'NONE',
    visible: true,
    active: false,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: '#ffffff',
      transparency: 0.2,
      fieldName: '', // 追加
      customFieldValue: '', // 追加
      colorRamp: 'RANDOM', // 追加
      colorList: [], // 追加
      // lineWidth: 1.5, // NONEタイプには不要かもしれない
    },
    label: 'name',
    field: [],
  },
];

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

describe('useLayers', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    // initialLayers を返すように設定
    mockSelector = jest.fn().mockReturnValue(initialLayers);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // 既存のテストを新しい layers データに合わせて調整 (例)
  test('編集ボタンを押すとアクティブの場合、非アクティブになる', () => {
    const { result } = renderHook(() => useLayers());
    const targetLayer = result.current.layers.find((l) => l.id === 'L1'); // IDで検索
    expect(targetLayer?.active).toBe(true);
    act(() => {
      if (targetLayer) result.current.changeActiveLayer(targetLayer);
    });
    // payload の期待値も新しい構造に合わせて調整が必要
    const expectedPayload = result.current.layers.map((l) => (l.id === 'L1' ? { ...l, active: false } : l));
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('編集ボタンを押すと非アクティブはアクティブになり、同タイプは非アクティブになる', () => {
    const { result } = renderHook(() => useLayers());
    const activeLayer = result.current.layers.find((l) => l.id === 'L1'); // POINT, active: true
    const inactiveLayer = result.current.layers.find((l) => l.id === 'L5'); // POINT, active: false (initial state)
    const otherPointLayer = result.current.layers.find((l) => l.id === 'L2'); // POINT, active: false (initial state)

    expect(activeLayer?.active).toBe(true);
    expect(inactiveLayer?.active).toBe(false);
    expect(otherPointLayer?.active).toBe(false);

    act(() => {
      if (inactiveLayer) result.current.changeActiveLayer(inactiveLayer);
    });

    // L1, L2, L5 が POINT タイプ。L5 をアクティブにするので、L1, L2 は false になるはず
    const expectedPayload = result.current.layers.map((l) => {
      if (l.type === 'POINT') {
        return { ...l, active: l.id === 'L5' };
      }
      return l;
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('編集ボタンを押してもNONEであれば同タイプの状態は変わらない', () => {
    const { result } = renderHook(() => useLayers());
    const noneLayer = result.current.layers.find((l) => l.id === 'L6'); // NONE, active: false
    // 他に NONE タイプがないので、単純にアクティブになるだけ
    expect(noneLayer?.active).toBe(false);

    act(() => {
      if (noneLayer) result.current.changeActiveLayer(noneLayer);
    });

    const expectedPayload = result.current.layers.map((l) => (l.id === 'L6' ? { ...l, active: true } : l));
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('表示非表示ボタンを押すとレイヤの表示非表示が切り替わる (通常レイヤ)', () => {
    const { result } = renderHook(() => useLayers());
    const targetLayer = result.current.layers.find((l) => l.id === 'L1');
    expect(targetLayer?.visible).toBe(true);

    act(() => {
      result.current.changeVisible(false, targetLayer!);
    });

    const expectedPayload = result.current.layers.map((l) => (l.id === 'L1' ? { ...l, visible: false } : l));
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('表示非表示ボタンを押すとレイヤの表示非表示が切り替わる (グループレイヤ)', () => {
    const { result } = renderHook(() => useLayers());
    const groupLayer = result.current.layers.find((l) => l.id === 'G1');
    const childLayer1 = result.current.layers.find((l) => l.id === 'L2');
    const childLayer2 = result.current.layers.find((l) => l.id === 'L3');

    expect(groupLayer?.visible).toBe(true);
    expect(childLayer1?.visible).toBe(true);
    expect(childLayer2?.visible).toBe(true);

    act(() => {
      result.current.changeVisible(false, groupLayer!);
    });

    // グループとその子レイヤの visible が false になることを期待
    const expectedPayload = result.current.layers.map((l) =>
      l.id === 'G1' || l.groupId === 'G1' ? { ...l, visible: false } : l
    );
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('ラベルが切り替わる', () => {
    const { result } = renderHook(() => useLayers());
    const targetLayer = result.current.layers.find((l) => l.id === 'L1');
    expect(targetLayer?.label).toBe('name');

    act(() => {
      if (targetLayer) result.current.changeLabel(targetLayer, 'id');
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/updateLayerAction',
      payload: { ...targetLayer, label: 'id' },
    });
  });

  // changeLayerOrder のテストは updateLayersOrder でカバーされるため、
  // 必要に応じて簡略化または削除しても良いかもしれません。
  // ここでは updateLayersOrder のテストに注力します。

  // --- updateLayersOrder のテストケース ---

  test('updateLayersOrder: グループ全体を下に移動する', () => {
    const { result } = renderHook(() => useLayers());
    const original = result.current.layers; // [L1, G1, L2, L3, L4, G2, L5, L6]
    // G1 グループ (G1, L2, L3) を L4 の下に移動
    const from = 1; // G1のindex
    const to = 5; // L4の下
    act(() => {
      result.current.updateLayersOrder(original, from, to);
    });

    // updateLayersOrder 内のロジックで子レイヤが再配置されることを期待
    const expectedPayload = [
      original.find((l) => l.id === 'L1')!,
      original.find((l) => l.id === 'L4')!,
      original.find((l) => l.id === 'G1')!, // 親
      { ...original.find((l) => l.id === 'L2')!, groupId: 'G1', expanded: true }, // 子 (groupId 維持)
      { ...original.find((l) => l.id === 'L3')!, groupId: 'G1', expanded: true }, // 子 (groupId 維持)
      original.find((l) => l.id === 'G2')!,
      { ...original.find((l) => l.id === 'L5')!, groupId: 'G2', expanded: false },
      original.find((l) => l.id === 'L6')!,
    ];

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('updateLayersOrder: 通常レイヤを展開中のグループに入れる', () => {
    const { result } = renderHook(() => useLayers());
    const original = result.current.layers;
    const from = 4; // L4のindex
    const to = 3; // L2の下
    act(() => {
      result.current.updateLayersOrder(original, from, to);
    });

    // L4 の groupId が G1 になり、expanded が true になることを期待
    const expectedPayload = [
      original.find((l) => l.id === 'L1')!,
      original.find((l) => l.id === 'G1')!,
      { ...original.find((l) => l.id === 'L2')!, groupId: 'G1', expanded: true },
      { ...original.find((l) => l.id === 'L4')!, groupId: 'G1', expanded: true }, // groupId と expanded が更新される
      { ...original.find((l) => l.id === 'L3')!, groupId: 'G1', expanded: true },
      original.find((l) => l.id === 'G2')!,
      { ...original.find((l) => l.id === 'L5')!, groupId: 'G2', expanded: false },
      original.find((l) => l.id === 'L6')!,
    ];

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('updateLayersOrder: 子レイヤをグループ外に出す', () => {
    const { result } = renderHook(() => useLayers());
    const original = result.current.layers; // [L1, G1, L2, L3, L4, G2, L5, L6]
    const from = 3; // L3のindex
    const to = 5; // L4の下
    act(() => {
      result.current.updateLayersOrder(original, from, to);
    });

    // L3 の groupId が undefined になることを期待
    const expectedPayload = [
      original.find((l) => l.id === 'L1')!,
      original.find((l) => l.id === 'G1')!,
      { ...original.find((l) => l.id === 'L2')!, groupId: 'G1', expanded: true },
      original.find((l) => l.id === 'L4')!,
      { ...original.find((l) => l.id === 'L3')!, groupId: undefined }, // groupId が undefined になる
      original.find((l) => l.id === 'G2')!,
      { ...original.find((l) => l.id === 'L5')!, groupId: 'G2', expanded: false },
      original.find((l) => l.id === 'L6')!,
    ];

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('updateLayersOrder: 子レイヤを同じグループ内で移動する', () => {
    const { result } = renderHook(() => useLayers());
    const original = result.current.layers;
    const from = 3; // L3のindex
    const to = 2; // L2の上
    act(() => {
      result.current.updateLayersOrder(original, from, to);
    });

    // 順序は変わるが、groupId は変わらないことを期待
    const expectedPayload = [
      original.find((l) => l.id === 'L1')!,
      original.find((l) => l.id === 'G1')!,
      { ...original.find((l) => l.id === 'L3')!, groupId: 'G1', expanded: true }, // groupId 維持
      { ...original.find((l) => l.id === 'L2')!, groupId: 'G1', expanded: true }, // groupId 維持
      original.find((l) => l.id === 'L4')!,
      original.find((l) => l.id === 'G2')!,
      { ...original.find((l) => l.id === 'L5')!, groupId: 'G2', expanded: false },
      original.find((l) => l.id === 'L6')!,
    ];

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });

  test('updateLayersOrder: 通常レイヤを折りたたみ中のグループに入れようとする', () => {
    const { result } = renderHook(() => useLayers());
    const original = result.current.layers; // [L1, G1, L2, L3, L4, G2, L5, L6]
    const from = 4; // L4のindex
    const to = 5; // G2の下
    act(() => {
      result.current.updateLayersOrder(original, from, to);
    });

    // L4 の groupId は undefined のまま変わらないことを期待
    const expectedPayload = [
      original.find((l) => l.id === 'L1')!,
      original.find((l) => l.id === 'G1')!,
      { ...original.find((l) => l.id === 'L2')!, groupId: 'G1', expanded: true },
      { ...original.find((l) => l.id === 'L3')!, groupId: 'G1', expanded: true },
      { ...original.find((l) => l.id === 'L4')!, groupId: undefined }, // groupId はつかない
      original.find((l) => l.id === 'G2')!,
      { ...original.find((l) => l.id === 'L5')!, groupId: 'G2', expanded: false },
      original.find((l) => l.id === 'L6')!,
    ];

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/setLayersAction',
      payload: expectedPayload,
    });
  });
});
