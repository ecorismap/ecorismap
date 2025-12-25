import { TileMapType } from '../../types';
import { useMaps } from '../useMaps';
import { renderHook, act } from '@testing-library/react-hooks';

// テスト用のmapsデータ
const initialMaps: TileMapType[] = [
  {
    id: 'M1',
    name: 'Map 1',
    url: 'https://example.com/tiles/{z}/{x}/{y}.png',
    attribution: 'Test Attribution 1',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
  },
  {
    id: 'G1',
    name: 'Group 1',
    url: '',
    attribution: '',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
    isGroup: true,
    expanded: true,
  },
  {
    id: 'M2',
    name: 'Map 2',
    url: 'https://example.com/tiles2/{z}/{x}/{y}.png',
    attribution: 'Test Attribution 2',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
    groupId: 'G1',
    expanded: true,
  },
  {
    id: 'M3',
    name: 'Map 3',
    url: 'https://example.com/tiles3/{z}/{x}/{y}.png',
    attribution: 'Test Attribution 3',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
    groupId: 'G1',
    expanded: true,
  },
  {
    id: 'M4',
    name: 'Map 4',
    url: 'https://example.com/tiles4/{z}/{x}/{y}.png',
    attribution: 'Test Attribution 4',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
  },
  {
    id: 'G2',
    name: 'Group 2',
    url: '',
    attribution: '',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
    isGroup: true,
    expanded: false,
  },
  {
    id: 'M5',
    name: 'Map 5',
    url: 'https://example.com/tiles5/{z}/{x}/{y}.png',
    attribution: 'Test Attribution 5',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 18,
    flipY: false,
    groupId: 'G2',
    expanded: false,
  },
];

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

describe('useMaps', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest.fn().mockReturnValue(initialMaps);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // --- changeVisible の基本テスト ---

  test('表示非表示ボタンを押すと地図の表示非表示が切り替わる (通常地図)', () => {
    const { result } = renderHook(() => useMaps());
    const targetMap = result.current.maps.find((m) => m.id === 'M1');
    expect(targetMap?.visible).toBe(true);

    act(() => {
      result.current.changeVisible(false, targetMap!);
    });

    const expectedPayload = result.current.maps.map((m) => (m.id === 'M1' ? { ...m, visible: false } : m));
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'tileMaps/setTileMapsAction',
      payload: expectedPayload,
    });
  });

  test('表示非表示ボタンを押すと地図の表示非表示が切り替わる (グループ地図)', () => {
    const { result } = renderHook(() => useMaps());
    const groupMap = result.current.maps.find((m) => m.id === 'G1');
    const childMap1 = result.current.maps.find((m) => m.id === 'M2');
    const childMap2 = result.current.maps.find((m) => m.id === 'M3');

    expect(groupMap?.visible).toBe(true);
    expect(childMap1?.visible).toBe(true);
    expect(childMap2?.visible).toBe(true);

    act(() => {
      result.current.changeVisible(false, groupMap!);
    });

    // グループとその子地図のvisibleがfalseになることを期待
    const expectedPayload = result.current.maps.map((m) =>
      m.id === 'G1' || m.groupId === 'G1' ? { ...m, visible: false } : m
    );
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'tileMaps/setTileMapsAction',
      payload: expectedPayload,
    });
  });

  // --- stale closure問題の検出テスト ---
  // これらのテストは、useCallbackの依存配列にmapsを含む代わりに
  // mapsRefを使用することでstale closure問題を防いでいることを確認します。

  test('changeVisible: state更新後も古いコールバック参照で正しく動作する（stale closure対策）', () => {
    // すべての地図が表示されている状態でスタート
    mockSelector.mockReturnValue(initialMaps);

    const { result, rerender } = renderHook(() => useMaps());

    // 初期状態でM1とM4が表示されていることを確認
    expect(result.current.maps.find((m) => m.id === 'M1')?.visible).toBe(true);
    expect(result.current.maps.find((m) => m.id === 'M4')?.visible).toBe(true);

    // 古いコールバック参照を保存（メモ化コンポーネントがこれを保持する状況をシミュレート）
    const oldChangeVisible = result.current.changeVisible;

    // 1つ目の地図(M1)を非表示にする
    const mapM1 = result.current.maps.find((m) => m.id === 'M1')!;
    act(() => {
      oldChangeVisible(false, mapM1);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const firstDispatchPayload = mockDispatch.mock.calls[0][0].payload;

    // M1が非表示になったことを確認
    expect(firstDispatchPayload.find((m: TileMapType) => m.id === 'M1').visible).toBe(false);
    // M4はまだ表示されている
    expect(firstDispatchPayload.find((m: TileMapType) => m.id === 'M4').visible).toBe(true);

    // Reduxのstate更新をシミュレート
    mockSelector.mockReturnValue(firstDispatchPayload);
    rerender();

    // ★重要: 古いコールバック参照を使って2つ目の地図を非表示にする
    // useRefを使用しているので、古いコールバックでも最新のstateを参照できる
    const mapM4 = initialMaps.find((m) => m.id === 'M4')!;
    act(() => {
      oldChangeVisible(false, mapM4);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const secondDispatchPayload = mockDispatch.mock.calls[1][0].payload;

    // M4が非表示になったことを確認
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'M4').visible).toBe(false);

    // ★重要: M1は非表示のままであることを確認
    // stale closureがあると、M1がtrueに戻ってしまう
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'M1').visible).toBe(false);
  });

  test('changeVisible: 連続して異なる地図の表示を切り替えても、それぞれ独立して動作する', () => {
    mockSelector.mockReturnValue(initialMaps);

    const { result, rerender } = renderHook(() => useMaps());

    // 初期状態でM1とM4が表示されていることを確認
    expect(result.current.maps.find((m) => m.id === 'M1')?.visible).toBe(true);
    expect(result.current.maps.find((m) => m.id === 'M4')?.visible).toBe(true);

    // 1つ目の地図(M1)を非表示にする
    const mapM1 = result.current.maps.find((m) => m.id === 'M1')!;
    act(() => {
      result.current.changeVisible(false, mapM1);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const firstDispatchPayload = mockDispatch.mock.calls[0][0].payload;

    // M1が非表示になったことを確認
    expect(firstDispatchPayload.find((m: TileMapType) => m.id === 'M1').visible).toBe(false);

    // Reduxのstate更新をシミュレート
    mockSelector.mockReturnValue(firstDispatchPayload);
    rerender();

    // 2つ目の地図(M4)を非表示にする
    const mapM4 = result.current.maps.find((m) => m.id === 'M4')!;
    act(() => {
      result.current.changeVisible(false, mapM4);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const secondDispatchPayload = mockDispatch.mock.calls[1][0].payload;

    // M4が非表示になったことを確認
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'M4').visible).toBe(false);

    // 重要: M1は非表示のままであることを確認
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'M1').visible).toBe(false);
  });

  // --- changeExpand のstale closure問題検出テスト ---
  // 注意: changeExpandの引数は (expanded: boolean, tileMap: TileMapType) の順序

  test('changeExpand: state更新後も古いコールバック参照で正しく動作する（stale closure対策）', () => {
    // 両方のグループが閉じた状態でスタート
    const bothClosedMaps: TileMapType[] = initialMaps.map((m) => {
      if (m.id === 'G1' || m.groupId === 'G1') {
        return { ...m, expanded: false };
      }
      return m;
    });
    mockSelector.mockReturnValue(bothClosedMaps);

    const { result, rerender } = renderHook(() => useMaps());

    // 両方のグループが閉じていることを確認
    expect(result.current.maps.find((m) => m.id === 'G1')?.expanded).toBe(false);
    expect(result.current.maps.find((m) => m.id === 'G2')?.expanded).toBe(false);

    // 古いコールバック参照を保存
    const oldChangeExpand = result.current.changeExpand;

    // 1つ目のグループ(G1)を開く
    const groupG1 = result.current.maps.find((m) => m.id === 'G1')!;
    act(() => {
      // changeExpandの引数は (expanded, tileMap) の順序
      oldChangeExpand(true, groupG1);
    });

    // dispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const firstDispatchPayload = mockDispatch.mock.calls[0][0].payload;

    // G1とその子が開かれたことを確認
    expect(firstDispatchPayload.find((m: TileMapType) => m.id === 'G1').expanded).toBe(true);
    expect(firstDispatchPayload.find((m: TileMapType) => m.id === 'M2').expanded).toBe(true);
    expect(firstDispatchPayload.find((m: TileMapType) => m.id === 'M3').expanded).toBe(true);
    // G2はまだ閉じたまま
    expect(firstDispatchPayload.find((m: TileMapType) => m.id === 'G2').expanded).toBe(false);

    // Reduxのstate更新をシミュレート
    mockSelector.mockReturnValue(firstDispatchPayload);
    rerender();

    // ★重要: 古いコールバック参照を使って2つ目のグループを開く
    const groupG2 = bothClosedMaps.find((m) => m.id === 'G2')!;
    act(() => {
      oldChangeExpand(true, groupG2);
    });

    // 2回目のdispatch呼び出しを確認
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    const secondDispatchPayload = mockDispatch.mock.calls[1][0].payload;

    // G2とその子が開かれたことを確認
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'G2').expanded).toBe(true);
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'M5').expanded).toBe(true);

    // ★重要: G1は開いたままであることを確認
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'G1').expanded).toBe(true);
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'M2').expanded).toBe(true);
    expect(secondDispatchPayload.find((m: TileMapType) => m.id === 'M3').expanded).toBe(true);
  });

  // --- updateMapOrder のテスト ---
  // 注意: updateMapOrderには境界チェックがあるため、有効な範囲で操作する必要がある
  // stale closure対策はmapsRef.currentを使用することで実装されている

  test('updateMapOrder: 地図の順序を変更できる', () => {
    mockSelector.mockReturnValue(initialMaps);

    const { result } = renderHook(() => useMaps());

    // filterdMapsを取得
    const filterdMaps = result.current.filterdMaps;

    // M1（index 0）をG1（index 1）の下に移動
    act(() => {
      result.current.updateMapOrder(filterdMaps, 0, 2);
    });

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    const dispatchPayload = mockDispatch.mock.calls[0][0].payload;

    // 順序が変わったことを確認（M1がG1の後に移動）
    const m1Index = dispatchPayload.findIndex((m: TileMapType) => m.id === 'M1');
    const g1Index = dispatchPayload.findIndex((m: TileMapType) => m.id === 'G1');
    expect(g1Index).toBeLessThan(m1Index);
  });

  // --- saveMap のstale closure問題検出テスト ---
  // 注意: saveMapは既存マップの場合updateTileMapActionを使用し、単一オブジェクトをdispatchする
  // 新規マップの場合はaddTileMapActionを使用する

  test('saveMap: 既存マップを更新する場合、updateTileMapActionがdispatchされる', () => {
    mockSelector.mockReturnValue(initialMaps);

    const { result } = renderHook(() => useMaps());

    // 既存の地図を更新
    const updatedM1: TileMapType = {
      ...initialMaps.find((m) => m.id === 'M1')!,
      name: 'Updated Map 1',
    };

    act(() => {
      result.current.saveMap(updatedM1);
    });

    // updateTileMapActionがdispatchされることを確認
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'tileMaps/updateTileMapAction',
      payload: updatedM1,
    });
  });

  test('saveMap: 新規マップを追加する場合、addTileMapActionがdispatchされる', () => {
    mockSelector.mockReturnValue(initialMaps);

    const { result } = renderHook(() => useMaps());

    // 新規の地図を追加
    const newMap: TileMapType = {
      id: 'M_NEW',
      name: 'New Map',
      url: 'https://example.com/new/{z}/{x}/{y}.png',
      attribution: 'New Attribution',
      maptype: 'none',
      visible: true,
      transparency: 0,
      overzoomThreshold: 18,
      highResolutionEnabled: false,
      minimumZ: 0,
      maximumZ: 18,
      flipY: false,
    };

    act(() => {
      result.current.saveMap(newMap);
    });

    // addTileMapActionがdispatchされることを確認
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'tileMaps/addTileMapAction',
      payload: newMap,
    });
  });

  test('saveMap: 古いコールバック参照でも最新のmapsを参照して正しく判定する（stale closure対策）', () => {
    mockSelector.mockReturnValue(initialMaps);

    const { result, rerender } = renderHook(() => useMaps());

    // 古いコールバック参照を保存
    const oldSaveMap = result.current.saveMap;

    // 新規マップを追加
    const newMap: TileMapType = {
      id: 'M_NEW',
      name: 'New Map',
      url: 'https://example.com/new/{z}/{x}/{y}.png',
      attribution: 'New Attribution',
      maptype: 'none',
      visible: true,
      transparency: 0,
      overzoomThreshold: 18,
      highResolutionEnabled: false,
      minimumZ: 0,
      maximumZ: 18,
      flipY: false,
    };

    act(() => {
      oldSaveMap(newMap);
    });

    // addTileMapActionがdispatchされることを確認（新規なので）
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0].type).toBe('tileMaps/addTileMapAction');

    // 新規マップが追加された後のstateをシミュレート
    const updatedMaps = [...initialMaps, newMap];
    mockSelector.mockReturnValue(updatedMaps);
    rerender();

    // ★重要: 古いコールバック参照を使って同じマップを更新
    const updatedNewMap: TileMapType = {
      ...newMap,
      name: 'Updated New Map',
    };

    act(() => {
      oldSaveMap(updatedNewMap);
    });

    // ★重要: 今回はupdateTileMapActionがdispatchされることを確認
    // stale closureがあると、古いmapsを参照してaddTileMapActionが再度呼ばれてしまう
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(mockDispatch.mock.calls[1][0].type).toBe('tileMaps/updateTileMapAction');
  });

  // --- filterdMaps のテスト ---

  test('filterdMaps: 展開中のグループの子地図は表示される', () => {
    const { result } = renderHook(() => useMaps());
    // G1はexpanded: trueなので、子地図M2, M3は表示される
    const filterd = result.current.filterdMaps;
    expect(filterd.some((m) => m.id === 'G1')).toBe(true);
    expect(filterd.some((m) => m.id === 'M2')).toBe(true);
    expect(filterd.some((m) => m.id === 'M3')).toBe(true);
  });

  test('filterdMaps: 折りたたみ中のグループの子地図は表示されない', () => {
    const { result } = renderHook(() => useMaps());
    // G2はexpanded: falseなので、子地図M5は表示されない
    const filterd = result.current.filterdMaps;
    expect(filterd.some((m) => m.id === 'G2')).toBe(true); // グループ自体は表示される
    expect(filterd.some((m) => m.id === 'M5')).toBe(false); // 子地図は表示されない
  });

  test('filterdMaps: グループに属していない地図は常に表示される', () => {
    const { result } = renderHook(() => useMaps());
    const filterd = result.current.filterdMaps;
    expect(filterd.some((m) => m.id === 'M1')).toBe(true);
    expect(filterd.some((m) => m.id === 'M4')).toBe(true);
  });
});
