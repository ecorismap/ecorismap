import { COLOR } from '../../constants/AppConstants';
import { selectNonDeletedDataSet, selectPointDataSet, selectLineDataSet } from '../selectors';
import { DataType, LayerType, RecordType } from '../../types';
import type { RootState } from '../../store';

const makeLayer = (id: string, type: LayerType['type']): LayerType => ({
  id,
  name: `layer${id}`,
  type,
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    color: COLOR.RED,
    fieldName: 'name',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
    transparency: 1,
  },
  label: 'name',
  visible: true,
  active: true,
  field: [{ id: `${id}-0`, name: 'name', format: 'STRING' }],
});

const makeRecord = (id: string, deleted = false): RecordType => ({
  id,
  userId: '0',
  displayName: 'user1',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {},
  ...(deleted ? { deleted: true } : {}),
});

const makeState = (dataSet: DataType[], layers: LayerType[]) => ({ dataSet, layers } as unknown as RootState);

describe('modules/selectors', () => {
  describe('selectNonDeletedDataSet', () => {
    test('論理削除レコードを除外する', () => {
      const group: DataType = { layerId: '0', userId: '0', data: [makeRecord('a'), makeRecord('b', true)] };
      const state = makeState([group], []);
      const result = selectNonDeletedDataSet(state);
      expect(result).toHaveLength(1);
      expect(result[0].data.map((r) => r.id)).toEqual(['a']);
    });

    test('削除レコードがないgroupは元の参照を維持する', () => {
      const group: DataType = { layerId: '0', userId: '0', data: [makeRecord('a')] };
      const state = makeState([group], []);
      const result = selectNonDeletedDataSet(state);
      expect(result[0]).toBe(group);
    });

    test('無関係なgroupの更新時に他groupの参照が変わらない', () => {
      const groupA: DataType = { layerId: '0', userId: '0', data: [makeRecord('a')] };
      const groupB: DataType = { layerId: '1', userId: '0', data: [makeRecord('b'), makeRecord('c', true)] };
      const result1 = selectNonDeletedDataSet(makeState([groupA, groupB], []));

      // groupAのみ更新（Immer同様、未変更のgroupBは同一参照のまま）
      const newGroupA: DataType = { layerId: '0', userId: '0', data: [makeRecord('a'), makeRecord('d')] };
      const result2 = selectNonDeletedDataSet(makeState([newGroupA, groupB], []));

      expect(result2[1]).toBe(result1[1]);
      expect(result2[0]).not.toBe(result1[0]);
    });
  });

  describe('selectPointDataSet / selectLineDataSet', () => {
    const pointLayer = makeLayer('p1', 'POINT');
    const lineLayer = makeLayer('l1', 'LINE');
    const pointGroup: DataType = { layerId: 'p1', userId: '0', data: [makeRecord('a')] };
    const pointGroup2: DataType = { layerId: 'p1', userId: '1', data: [makeRecord('b')] };
    const lineGroup: DataType = { layerId: 'l1', userId: '0', data: [makeRecord('c')] };

    test('レイヤータイプに対応するgroupのみ返す', () => {
      const state = makeState([pointGroup, lineGroup, pointGroup2], [pointLayer, lineLayer]);
      expect(selectPointDataSet(state).map((d) => d.data[0].id)).toEqual(['a', 'b']);
      expect(selectLineDataSet(state).map((d) => d.data[0].id)).toEqual(['c']);
    });

    test('論理削除レコードを除外する', () => {
      const group: DataType = { layerId: 'p1', userId: '0', data: [makeRecord('a'), makeRecord('b', true)] };
      const state = makeState([group], [pointLayer]);
      const result = selectPointDataSet(state);
      expect(result[0].data.map((r) => r.id)).toEqual(['a']);
    });

    test('無関係なgroupの更新時に他groupの参照が変わらない', () => {
      const result1 = selectPointDataSet(makeState([pointGroup, lineGroup, pointGroup2], [pointLayer, lineLayer]));

      // lineGroupのみ更新
      const newLineGroup: DataType = { layerId: 'l1', userId: '0', data: [makeRecord('c'), makeRecord('d')] };
      const result2 = selectPointDataSet(
        makeState([pointGroup, newLineGroup, pointGroup2], [pointLayer, lineLayer])
      );

      expect(result2[0]).toBe(result1[0]);
      expect(result2[1]).toBe(result1[1]);
    });
  });
});
