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
// getStateの返す値を追跡するための変数
let currentState: LayerType[] = initialLayers;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

// Thunk関数を実行して内部のdispatchを取得するヘルパー
const executeThunkAndGetPayload = (thunkFn: (dispatch: jest.Mock, getState: () => { layers: LayerType[] }) => void): LayerType[] => {
  const innerDispatch = jest.fn();
  const getState = () => ({ layers: currentState });
  thunkFn(innerDispatch, getState);
  // innerDispatchに渡されたアクションのpayloadを返す
  if (innerDispatch.mock.calls.length > 0) {
    return innerDispatch.mock.calls[0][0].payload;
  }
  return [];
};


describe('useLayers', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    // initialLayers を返すように設定
    mockSelector = jest.fn().mockReturnValue(initialLayers);
    currentState = initialLayers;
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
    // Thunkなのでdispatchには関数が渡される
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const thunkFn = mockDispatch.mock.calls[0][0];
    expect(typeof thunkFn).toBe('function');

    // Thunk関数を実行してpayloadを取得
    const payload = executeThunkAndGetPayload(thunkFn);
    const expectedPayload = result.current.layers.map((l) => (l.id === 'L1' ? { ...l, active: false } : l));
    expect(payload).toEqual(expectedPayload);
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

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
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
    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
  });

  test('表示非表示ボタンを押すとレイヤの表示非表示が切り替わる (通常レイヤ)', () => {
    const { result } = renderHook(() => useLayers());
    const targetLayer = result.current.layers.find((l) => l.id === 'L1');
    expect(targetLayer?.visible).toBe(true);

    act(() => {
      result.current.changeVisible(false, targetLayer!);
    });

    const expectedPayload = result.current.layers.map((l) => (l.id === 'L1' ? { ...l, visible: false } : l));
    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
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
    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
  });

  test('ラベルが切り替わる', () => {
    const { result } = renderHook(() => useLayers());
    const targetLayer = result.current.layers.find((l) => l.id === 'L1');
    expect(targetLayer?.label).toBe('name');

    act(() => {
      if (targetLayer) result.current.changeLabel(targetLayer, 'id');
    });

    // changeLabelはThunkではないので直接検証
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

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
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

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
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

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
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

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
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

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
  });

  // --- filterdLayers のテストケース ---

  test('filterdLayers: 展開中のグループの子レイヤは表示される', () => {
    const { result } = renderHook(() => useLayers());
    // G1 は expanded: true なので、子レイヤ L2, L3 は表示される
    const filterd = result.current.filterdLayers;
    expect(filterd.some((l) => l.id === 'G1')).toBe(true);
    expect(filterd.some((l) => l.id === 'L2')).toBe(true);
    expect(filterd.some((l) => l.id === 'L3')).toBe(true);
  });

  test('filterdLayers: 折りたたみ中のグループの子レイヤは表示されない', () => {
    const { result } = renderHook(() => useLayers());
    // G2 は expanded: false なので、子レイヤ L5 は表示されない
    const filterd = result.current.filterdLayers;
    expect(filterd.some((l) => l.id === 'G2')).toBe(true); // グループ自体は表示される
    expect(filterd.some((l) => l.id === 'L5')).toBe(false); // 子レイヤは表示されない
  });

  test('filterdLayers: グループに属していないレイヤは常に表示される', () => {
    const { result } = renderHook(() => useLayers());
    const filterd = result.current.filterdLayers;
    expect(filterd.some((l) => l.id === 'L1')).toBe(true);
    expect(filterd.some((l) => l.id === 'L4')).toBe(true);
    expect(filterd.some((l) => l.id === 'L6')).toBe(true);
  });

  test('filterdLayers: 子レイヤのexpandedが親と異なっていても親のexpandedで判定する', () => {
    // 子レイヤのexpandedがtrueでも、親がfalseなら表示されない
    const layersWithMismatch: LayerType[] = [
      {
        id: 'G1',
        name: 'Group 1',
        type: 'LAYERGROUP',
        visible: true,
        expanded: false, // 親は閉じている
        permission: 'PRIVATE',
        active: false,
        colorStyle: { colorType: 'SINGLE', color: '#ff0000', transparency: 0.2, fieldName: '', customFieldValue: '', colorRamp: 'RANDOM', colorList: [], lineWidth: 1.5 },
        label: '',
        field: [],
      },
      {
        id: 'L1',
        name: 'Layer 1',
        type: 'POINT',
        visible: true,
        groupId: 'G1',
        expanded: true, // 子は開いている（不整合状態）
        active: false,
        permission: 'PRIVATE',
        colorStyle: { colorType: 'SINGLE', color: '#00ff00', transparency: 0.2, fieldName: '', customFieldValue: '', colorRamp: 'RANDOM', colorList: [], lineWidth: 1.5 },
        label: 'name',
        field: [],
      },
    ];
    mockSelector.mockReturnValue(layersWithMismatch);
    currentState = layersWithMismatch;

    const { result } = renderHook(() => useLayers());
    const filterd = result.current.filterdLayers;

    // 親グループが閉じているので、子レイヤのexpandedがtrueでも表示されない
    expect(filterd.some((l) => l.id === 'G1')).toBe(true);
    expect(filterd.some((l) => l.id === 'L1')).toBe(false);
  });

  // --- changeExpand のテストケース ---

  test('changeExpand: グループを開くと親と子のexpandedがtrueになる', () => {
    const { result } = renderHook(() => useLayers());
    const groupLayer = result.current.layers.find((l) => l.id === 'G2')!; // expanded: false
    expect(groupLayer.expanded).toBe(false);

    act(() => {
      result.current.changeExpand(groupLayer);
    });

    // G2 と L5 の expanded が true になることを期待
    const expectedPayload = result.current.layers.map((l) => {
      if (l.id === 'G2' || l.groupId === 'G2') {
        return { ...l, expanded: true };
      }
      return l;
    });

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
  });

  test('changeExpand: グループを閉じると親と子のexpandedがfalseになる', () => {
    const { result } = renderHook(() => useLayers());
    const groupLayer = result.current.layers.find((l) => l.id === 'G1')!; // expanded: true
    expect(groupLayer.expanded).toBe(true);

    act(() => {
      result.current.changeExpand(groupLayer);
    });

    // G1, L2, L3 の expanded が false になることを期待
    const expectedPayload = result.current.layers.map((l) => {
      if (l.id === 'G1' || l.groupId === 'G1') {
        return { ...l, expanded: false };
      }
      return l;
    });

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);
  });

  test('changeExpand: 複数のグループがある場合、対象グループの子だけが変更される', () => {
    const { result } = renderHook(() => useLayers());
    const groupG2 = result.current.layers.find((l) => l.id === 'G2')!; // expanded: false

    act(() => {
      result.current.changeExpand(groupG2);
    });

    // G2 と L5 のみ expanded が true になり、G1, L2, L3 は変更されないことを期待
    const expectedPayload = result.current.layers.map((l) => {
      if (l.id === 'G2' || l.groupId === 'G2') {
        return { ...l, expanded: true };
      }
      return l;
    });

    const thunkFn = mockDispatch.mock.calls[0][0];
    const payload = executeThunkAndGetPayload(thunkFn);
    expect(payload).toEqual(expectedPayload);

    // G1グループの子は変更されていないことを確認
    const g1Layer = payload.find((l: LayerType) => l.id === 'G1')!;
    const l2Layer = payload.find((l: LayerType) => l.id === 'L2')!;
    const l3Layer = payload.find((l: LayerType) => l.id === 'L3')!;
    expect(g1Layer.expanded).toBe(true); // 元のまま
    expect(l2Layer.expanded).toBe(true); // 元のまま
    expect(l3Layer.expanded).toBe(true); // 元のまま
  });

  // --- stale closure問題の検出テスト ---
  // 注意: これらのテストはstale closure問題が発生する実際のシナリオを
  // シミュレートするために、rerender()せずに古いコールバック参照を使用します。
  // 実際のアプリでは、DraggableFlatListなどのメモ化されたコンポーネントが
  // 古いコールバック参照を保持することでstale closureが発生します。

  test('changeExpand: state更新後も古いコールバック参照で正しく動作する（stale closure対策）', () => {
    // 両方のグループが閉じた状態でスタート
    const bothClosedLayers: LayerType[] = initialLayers.map((l) => {
      if (l.id === 'G1' || l.groupId === 'G1') {
        return { ...l, expanded: false };
      }
      return l;
    });
    mockSelector.mockReturnValue(bothClosedLayers);
    currentState = bothClosedLayers;

    const { result, rerender } = renderHook(() => useLayers());

    // 両方のグループが閉じていることを確認
    expect(result.current.layers.find((l) => l.id === 'G1')?.expanded).toBe(false);
    expect(result.current.layers.find((l) => l.id === 'G2')?.expanded).toBe(false);

    // 古いコールバック参照を保存（メモ化コンポーネントがこれを保持する状況をシミュレート）
    const oldChangeExpand = result.current.changeExpand;

    // 1つ目のグループ(G1)を開く
    const groupG1 = result.current.layers.find((l) => l.id === 'G1')!;
    act(() => {
      oldChangeExpand(groupG1);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const thunkFn1 = mockDispatch.mock.calls[0][0];
    const firstDispatchPayload = executeThunkAndGetPayload(thunkFn1);

    // G1とその子が開かれたことを確認
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'G1')!.expanded).toBe(true);
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L2')!.expanded).toBe(true);
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L3')!.expanded).toBe(true);
    // G2はまだ閉じたまま
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'G2')!.expanded).toBe(false);

    // Reduxのstate更新をシミュレート
    // rerenderでuseEffectが実行され、layersRefが更新される
    mockSelector.mockReturnValue(firstDispatchPayload);
    currentState = firstDispatchPayload;
    rerender();

    // ★重要: 古いコールバック参照を使って2つ目のグループを開く
    // Thunkを使用しているので、古いコールバックでも最新のstateを参照できる
    // stale closureがあると、この呼び出しは古いstateを参照してしまう
    const groupG2 = bothClosedLayers.find((l) => l.id === 'G2')!;
    act(() => {
      oldChangeExpand(groupG2);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const thunkFn2 = mockDispatch.mock.calls[1][0];
    const secondDispatchPayload = executeThunkAndGetPayload(thunkFn2);

    // G2とその子が開かれたことを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'G2')!.expanded).toBe(true);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L5')!.expanded).toBe(true);

    // ★重要: G1は開いたままであることを確認
    // Thunkを使用しているため、古いコールバック参照を使っても最新のstateを参照できる
    // stale closureがあると、G1が閉じた状態でdispatchされてしまう
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'G1')!.expanded).toBe(true);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L2')!.expanded).toBe(true);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L3')!.expanded).toBe(true);
  });

  test('changeExpand: 連続して異なるグループを開いても、それぞれ独立して動作する', () => {
    // 両方のグループが閉じた状態でスタート
    const bothClosedLayers: LayerType[] = initialLayers.map((l) => {
      if (l.id === 'G1' || l.groupId === 'G1') {
        return { ...l, expanded: false };
      }
      return l;
    });
    mockSelector.mockReturnValue(bothClosedLayers);
    currentState = bothClosedLayers;

    const { result, rerender } = renderHook(() => useLayers());

    // 両方のグループが閉じていることを確認
    expect(result.current.layers.find((l) => l.id === 'G1')?.expanded).toBe(false);
    expect(result.current.layers.find((l) => l.id === 'G2')?.expanded).toBe(false);

    // 1つ目のグループ(G1)を開く
    const groupG1 = result.current.layers.find((l) => l.id === 'G1')!;
    act(() => {
      result.current.changeExpand(groupG1);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const thunkFn1 = mockDispatch.mock.calls[0][0];
    const firstDispatchPayload = executeThunkAndGetPayload(thunkFn1);

    // G1とその子が開かれたことを確認
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'G1')!.expanded).toBe(true);
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L2')!.expanded).toBe(true);
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L3')!.expanded).toBe(true);
    // G2はまだ閉じたまま
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'G2')!.expanded).toBe(false);

    // Reduxのstate更新をシミュレート（実際のアプリでは自動的に行われる）
    mockSelector.mockReturnValue(firstDispatchPayload);
    currentState = firstDispatchPayload;
    rerender();

    // 2つ目のグループ(G2)を開く
    const groupG2 = result.current.layers.find((l) => l.id === 'G2')!;
    act(() => {
      result.current.changeExpand(groupG2);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const thunkFn2 = mockDispatch.mock.calls[1][0];
    const secondDispatchPayload = executeThunkAndGetPayload(thunkFn2);

    // G2とその子が開かれたことを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'G2')!.expanded).toBe(true);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L5')!.expanded).toBe(true);

    // 重要: G1は開いたままであることを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'G1')!.expanded).toBe(true);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L2')!.expanded).toBe(true);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L3')!.expanded).toBe(true);
  });

  test('changeExpand: 連続して同じグループを開閉しても正しく動作する', () => {
    const { result, rerender } = renderHook(() => useLayers());

    // G2は最初閉じている
    expect(result.current.layers.find((l) => l.id === 'G2')?.expanded).toBe(false);

    // G2を開く
    const groupG2 = result.current.layers.find((l) => l.id === 'G2')!;
    act(() => {
      result.current.changeExpand(groupG2);
    });

    const thunkFn1 = mockDispatch.mock.calls[0][0];
    const firstPayload = executeThunkAndGetPayload(thunkFn1);
    expect(firstPayload.find((l: LayerType) => l.id === 'G2')!.expanded).toBe(true);

    // state更新をシミュレート
    mockSelector.mockReturnValue(firstPayload);
    currentState = firstPayload;
    rerender();

    // G2を閉じる
    const updatedG2 = result.current.layers.find((l) => l.id === 'G2')!;
    act(() => {
      result.current.changeExpand(updatedG2);
    });

    const thunkFn2 = mockDispatch.mock.calls[1][0];
    const secondPayload = executeThunkAndGetPayload(thunkFn2);
    // G2が正しく閉じられることを確認
    expect(secondPayload.find((l: LayerType) => l.id === 'G2')!.expanded).toBe(false);
    expect(secondPayload.find((l: LayerType) => l.id === 'L5')!.expanded).toBe(false);
  });

  // --- changeVisible のstale closure問題検出テスト ---

  test('changeVisible: state更新後も古いコールバック参照で正しく動作する（stale closure対策）', () => {
    // すべてのレイヤが表示されている状態でスタート
    mockSelector.mockReturnValue(initialLayers);
    currentState = initialLayers;

    const { result, rerender } = renderHook(() => useLayers());

    // 初期状態でL1とL4が表示されていることを確認
    expect(result.current.layers.find((l) => l.id === 'L1')?.visible).toBe(true);
    expect(result.current.layers.find((l) => l.id === 'L4')?.visible).toBe(true);

    // 古いコールバック参照を保存（メモ化コンポーネントがこれを保持する状況をシミュレート）
    const oldChangeVisible = result.current.changeVisible;

    // 1つ目のレイヤ(L1)を非表示にする
    const layerL1 = result.current.layers.find((l) => l.id === 'L1')!;
    act(() => {
      oldChangeVisible(false, layerL1);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const thunkFn1 = mockDispatch.mock.calls[0][0];
    const firstDispatchPayload = executeThunkAndGetPayload(thunkFn1);

    // L1が非表示になったことを確認
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L1')!.visible).toBe(false);
    // L4はまだ表示されている
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L4')!.visible).toBe(true);

    // Reduxのstate更新をシミュレート
    mockSelector.mockReturnValue(firstDispatchPayload);
    currentState = firstDispatchPayload;
    rerender();

    // ★重要: 古いコールバック参照を使って2つ目のレイヤを非表示にする
    // Thunkを使用しているので、古いコールバックでも最新のstateを参照できる
    const layerL4 = initialLayers.find((l) => l.id === 'L4')!;
    act(() => {
      oldChangeVisible(false, layerL4);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const thunkFn2 = mockDispatch.mock.calls[1][0];
    const secondDispatchPayload = executeThunkAndGetPayload(thunkFn2);

    // L4が非表示になったことを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L4')!.visible).toBe(false);

    // ★重要: L1は非表示のままであることを確認
    // stale closureがあると、L1がtrueに戻ってしまう
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L1')!.visible).toBe(false);
  });

  test('changeVisible: 連続して異なるレイヤの表示を切り替えても、それぞれ独立して動作する', () => {
    mockSelector.mockReturnValue(initialLayers);
    currentState = initialLayers;

    const { result, rerender } = renderHook(() => useLayers());

    // 初期状態でL1とL4が表示されていることを確認
    expect(result.current.layers.find((l) => l.id === 'L1')?.visible).toBe(true);
    expect(result.current.layers.find((l) => l.id === 'L4')?.visible).toBe(true);

    // 1つ目のレイヤ(L1)を非表示にする
    const layerL1 = result.current.layers.find((l) => l.id === 'L1')!;
    act(() => {
      result.current.changeVisible(false, layerL1);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const thunkFn1 = mockDispatch.mock.calls[0][0];
    const firstDispatchPayload = executeThunkAndGetPayload(thunkFn1);

    // L1が非表示になったことを確認
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L1')!.visible).toBe(false);

    // Reduxのstate更新をシミュレート
    mockSelector.mockReturnValue(firstDispatchPayload);
    currentState = firstDispatchPayload;
    rerender();

    // 2つ目のレイヤ(L4)を非表示にする
    const layerL4 = result.current.layers.find((l) => l.id === 'L4')!;
    act(() => {
      result.current.changeVisible(false, layerL4);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const thunkFn2 = mockDispatch.mock.calls[1][0];
    const secondDispatchPayload = executeThunkAndGetPayload(thunkFn2);

    // L4が非表示になったことを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L4')!.visible).toBe(false);

    // 重要: L1は非表示のままであることを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L1')!.visible).toBe(false);
  });

  // --- changeActiveLayer のstale closure問題検出テスト ---

  test('changeActiveLayer: state更新後も古いコールバック参照で正しく動作する（stale closure対策）', () => {
    // L1がアクティブな状態でスタート
    mockSelector.mockReturnValue(initialLayers);
    currentState = initialLayers;

    const { result, rerender } = renderHook(() => useLayers());

    // 初期状態でL1がアクティブであることを確認
    expect(result.current.layers.find((l) => l.id === 'L1')?.active).toBe(true);
    expect(result.current.layers.find((l) => l.id === 'L2')?.active).toBe(false);
    expect(result.current.layers.find((l) => l.id === 'L5')?.active).toBe(false);

    // 古いコールバック参照を保存
    const oldChangeActiveLayer = result.current.changeActiveLayer;

    // L2をアクティブにする（同じPOINTタイプなのでL1は非アクティブになる）
    const layerL2 = result.current.layers.find((l) => l.id === 'L2')!;
    act(() => {
      oldChangeActiveLayer(layerL2);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const thunkFn1 = mockDispatch.mock.calls[0][0];
    const firstDispatchPayload = executeThunkAndGetPayload(thunkFn1);

    // L2がアクティブになり、L1が非アクティブになったことを確認
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L2')!.active).toBe(true);
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L1')!.active).toBe(false);

    // Reduxのstate更新をシミュレート
    mockSelector.mockReturnValue(firstDispatchPayload);
    currentState = firstDispatchPayload;
    rerender();

    // ★重要: 古いコールバック参照を使ってL5をアクティブにする
    const layerL5 = initialLayers.find((l) => l.id === 'L5')!;
    act(() => {
      oldChangeActiveLayer(layerL5);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const thunkFn2 = mockDispatch.mock.calls[1][0];
    const secondDispatchPayload = executeThunkAndGetPayload(thunkFn2);

    // L5がアクティブになったことを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L5')!.active).toBe(true);

    // ★重要: L2は非アクティブになることを確認（同じPOINTタイプなので）
    // stale closureがあると、古いstateを参照してL1がアクティブに戻ったりする
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L2')!.active).toBe(false);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L1')!.active).toBe(false);
  });

  test('changeActiveLayer: 連続して異なるレイヤをアクティブにしても正しく動作する', () => {
    mockSelector.mockReturnValue(initialLayers);
    currentState = initialLayers;

    const { result, rerender } = renderHook(() => useLayers());

    // 初期状態でL1がアクティブ
    expect(result.current.layers.find((l) => l.id === 'L1')?.active).toBe(true);

    // L2をアクティブにする
    const layerL2 = result.current.layers.find((l) => l.id === 'L2')!;
    act(() => {
      result.current.changeActiveLayer(layerL2);
    });

    const thunkFn1 = mockDispatch.mock.calls[0][0];
    const firstDispatchPayload = executeThunkAndGetPayload(thunkFn1);
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L2')!.active).toBe(true);
    expect(firstDispatchPayload.find((l: LayerType) => l.id === 'L1')!.active).toBe(false);

    // state更新をシミュレート
    mockSelector.mockReturnValue(firstDispatchPayload);
    currentState = firstDispatchPayload;
    rerender();

    // L5をアクティブにする
    const layerL5 = result.current.layers.find((l) => l.id === 'L5')!;
    act(() => {
      result.current.changeActiveLayer(layerL5);
    });

    const thunkFn2 = mockDispatch.mock.calls[1][0];
    const secondDispatchPayload = executeThunkAndGetPayload(thunkFn2);

    // L5がアクティブになり、L2は非アクティブになることを確認
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L5')!.active).toBe(true);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L2')!.active).toBe(false);
    expect(secondDispatchPayload.find((l: LayerType) => l.id === 'L1')!.active).toBe(false);
  });
});
