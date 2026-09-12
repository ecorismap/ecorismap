import { getToolPalette, hasToolPalette } from '../ToolPalette';
import { LayerType } from '../../types';

const baseLayer: LayerType = {
  id: 'L1',
  name: 'レイヤ',
  type: 'POLYGON',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'CATEGORIZED',
    transparency: false,
    color: 'rgba(0,0,0,1)',
    fieldName: '区分',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [
      { value: '草地', color: 'rgba(1,1,1,1)' },
      { value: '樹林', color: 'rgba(2,2,2,1)' },
    ],
    lineWidth: 1.5,
  },
  label: '',
  visible: true,
  active: true,
  field: [
    {
      id: 'f1',
      name: '区分',
      format: 'LIST',
      list: [
        { value: '草地', isOther: false, customFieldValue: '' },
        { value: '樹林', isOther: false, customFieldValue: '' },
        { value: '', isOther: true, customFieldValue: '' },
      ],
    },
  ],
};

describe('getToolPalette', () => {
  it('用途が未設定ならパレットは無い', () => {
    expect(getToolPalette(baseLayer, 'POLYGON', true)).toBeUndefined();
  });

  it('植生図は色分けに使うフィールドの選択肢から区分のボタンを作る', () => {
    const layer = { ...baseLayer, toolPalette: 'VEGETATION' as const };
    const items = getToolPalette(layer, 'POLYGON', true);

    //「その他」と空の選択肢は除く
    expect(items?.map((i) => i.fieldValue)).toEqual(['草地', '樹林']);
    //区分の色は色分け設定から引く
    expect(items?.[0].colorHex).toBe('rgba(1,1,1,1)');
    //区分のボタンは描き方（手書き・プロット）を変えない
    expect(items?.[0].subTool).toBeUndefined();
  });

  it('選択肢の無いフィールドではパレットを作らない', () => {
    const layer = {
      ...baseLayer,
      toolPalette: 'VEGETATION' as const,
      field: [{ id: 'f1', name: '区分', format: 'STRING' as const }],
    };
    expect(getToolPalette(layer, 'POLYGON', true)).toBeUndefined();
  });

  it('飛翔図は道具のボタンを返し、機能が無効なら返さない', () => {
    const layer = { ...baseLayer, type: 'LINE' as const, toolPalette: 'HISYOU' as const };
    expect(getToolPalette(layer, 'LINE', true)?.length).toBeGreaterThan(0);
    expect(getToolPalette(layer, 'LINE', false)).toBeUndefined();
  });
});

describe('hasToolPalette', () => {
  it('用途とタブが合ったときだけtrue', () => {
    expect(hasToolPalette('VEGETATION', 'POLYGON', true)).toBe(true);
    expect(hasToolPalette('VEGETATION', 'LINE', true)).toBe(false);
    expect(hasToolPalette('HISYOU', 'LINE', true)).toBe(true);
    expect(hasToolPalette('HISYOU', 'LINE', false)).toBe(false);
    expect(hasToolPalette(undefined, 'POLYGON', true)).toBe(false);
  });
});
