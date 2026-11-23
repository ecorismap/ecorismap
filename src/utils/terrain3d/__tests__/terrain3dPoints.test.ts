import { DataType, LayerType } from '../../../types';
import { isSelectedPoint, selectTerrain3DPoints } from '../terrain3dPoints';

const layer = (id: string, visible = true): LayerType => ({ id, visible } as unknown as LayerType);
const point = (id: string, visible = true) => ({
  id,
  visible,
  coords: { latitude: 35, longitude: 138 + Number(id.replace(/\D/g, '')) * 0.001 },
});
const dataSet = (layerId: string, ids: string[]): DataType =>
  ({ layerId, userId: undefined, data: ids.map((v) => point(v)) } as unknown as DataType);

describe('selectTerrain3DPoints（V-L6/V-L7）', () => {
  it('可視レイヤ・可視レコードを上限で打ち切る', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const result = selectTerrain3DPoints([dataSet('L1', ids), dataSet('L2', ['p99'])], [layer('L1'), layer('L2', false)], undefined, 5);
    expect(result.map((v) => v.record.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('選択点は上限の外にあっても含め、末尾（最前面）に置く', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const selected = { layerId: 'L1', record: { id: 'p8' } };
    const result = selectTerrain3DPoints([dataSet('L1', ids)], [layer('L1')], selected, 5);
    expect(result).toHaveLength(5);
    expect(result[4].record.id).toBe('p8');
    expect(result[4].selected).toBe(true);
    expect(result.filter((v) => v.selected)).toHaveLength(1);
  });

  it('選択判定はレイヤも見る（別レイヤの同じidは選択扱いにしない）', () => {
    const selected = { layerId: 'L2', record: { id: 'p1' } };
    const result = selectTerrain3DPoints(
      [dataSet('L1', ['p1']), dataSet('L2', ['p1'])],
      [layer('L1'), layer('L2')],
      selected
    );
    expect(result.map((v) => [v.layer.id, v.selected])).toEqual([
      ['L1', false],
      ['L2', true],
    ]);
    expect(isSelectedPoint(selected, 'L1', 'p1')).toBe(false);
  });
});
