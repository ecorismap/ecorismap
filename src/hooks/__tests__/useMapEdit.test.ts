/**
 * タイル監査 M-M18: 地図編集の保存で、保存時に補った値（PMTiles のヘッダーのズーム範囲など）を捨てない
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { TileMapType } from '../../types';
import { useMapEdit } from '../useMapEdit';

const mockDispatch = jest.fn();
let mockMaps: TileMapType[] = [];
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({ tileMaps: mockMaps }),
}));

const target: TileMapType = {
  id: 'P',
  name: 'P',
  url: 'pmtiles://https://example.com/a.pmtiles',
  attribution: '',
  maptype: 'none',
  visible: true,
  transparency: 0,
  overzoomThreshold: 18,
  highResolutionEnabled: false,
  minimumZ: 0,
  maximumZ: 22,
  flipY: false,
};

const updates = () =>
  mockDispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'tileMaps/updateTileMapAction');

beforeEach(() => {
  mockDispatch.mockClear();
  mockMaps = [target];
});

test('渡した地図を保存し、編集中の値もそれに合わせる', () => {
  const { result } = renderHook(() => useMapEdit(target));
  const finalMap = { ...target, minimumZ: 5, maximumZ: 15, overzoomThreshold: 15 };
  act(() => {
    result.current.saveMap(finalMap);
  });
  expect(updates()[0].payload).toEqual(finalMap);
  expect(result.current.map).toEqual(finalMap);
  expect(result.current.isEdited).toBe(false);
});

test('渡さなければ編集中の地図を保存する', () => {
  const { result } = renderHook(() => useMapEdit(target));
  act(() => {
    result.current.changeMapName('新しい名前');
  });
  act(() => {
    result.current.saveMap();
  });
  expect(updates()[0].payload).toMatchObject({ id: 'P', name: '新しい名前', maximumZ: 22 });
});
