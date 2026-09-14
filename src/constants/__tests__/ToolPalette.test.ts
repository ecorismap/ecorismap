import { getFieldOptions, getToolPalette, hasToolPalette } from '../ToolPalette';
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

  it('植生図は区分ボタン1つ（中身は選択肢から作る）', () => {
    const layer = { ...baseLayer, toolPalette: 'VEGETATION' as const };
    const items = getToolPalette(layer, 'POLYGON', true);

    expect(items).toHaveLength(1);
    expect(items?.[0].fieldName).toBe('区分');
    //区分のボタンは描き方（手書き・プロット）を変えない
    expect(items?.[0].subTool).toBeUndefined();

    //選択肢は「その他」と空を除き、色分け設定から色を引く
    const options = getFieldOptions(layer, '区分');
    expect(options.map((o) => o.fieldValue)).toEqual(['草地', '樹林']);
    expect(options[0].colorHex).toBe('rgba(1,1,1,1)');
  });

  it('飛翔図は飛翔・属性・行動範囲・行動位置のボタンを返す', () => {
    const layer = {
      ...baseLayer,
      type: 'LINE' as const,
      toolPalette: 'HISYOU' as const,
      colorStyle: { ...baseLayer.colorStyle, fieldName: '種名' },
      field: [
        {
          id: 'f1',
          name: '種名',
          format: 'LIST' as const,
          list: [{ value: 'クマタカ', isOther: false, customFieldValue: '' }],
        },
        {
          id: 'f2',
          name: '性別',
          format: 'LIST' as const,
          list: [{ value: '雄', isOther: false, customFieldValue: '' }],
        },
      ],
    };
    const items = getToolPalette(layer, 'LINE', true);

    //属性は1つのボタンにまとめ、モーダルのタブで切り替える（齢はフィールドが無いので出ない）
    const fieldButton = items?.find((i) => i.id === 'HISYOU_FIELDS');
    expect(fieldButton?.options?.map((o) => o.fieldName)).toEqual(['種名', '性別']);
    //行動範囲・行動位置は中身をまとめたボタン
    const group = items?.find((i) => i.id === 'HISYOU_BRUSH');
    expect(group?.options?.length).toBeGreaterThan(0);
    //消しゴムは出さない（消すときは編集選択で選んで削除する）
    expect(items?.some((i) => i.eraser !== undefined)).toBe(false);
  });

  it('行動位置は編集中の線が無くても使える（行動範囲・行動削除は線が要る）', () => {
    const layer = { ...baseLayer, type: 'LINE' as const, toolPalette: 'HISYOU' as const };
    const items = getToolPalette(layer, 'LINE', true);
    expect(items?.find((i) => i.id === 'HISYOU_STAMP')?.allowWithoutObject).toBe(true);
    expect(items?.find((i) => i.id === 'HISYOU_BRUSH')?.allowWithoutObject).toBeUndefined();
    expect(items?.find((i) => i.id === 'HISYOU_ERASER')?.allowWithoutObject).toBeUndefined();
  });

  it('改名前の「雌雄」「成幼」で作ったレイヤでもボタンが出る', () => {
    const layer = {
      ...baseLayer,
      type: 'LINE' as const,
      toolPalette: 'HISYOU' as const,
      colorStyle: { ...baseLayer.colorStyle, fieldName: '種名' },
      field: [
        {
          id: 'f1',
          name: '種名',
          format: 'LIST' as const,
          list: [{ value: 'クマタカ', isOther: false, customFieldValue: '' }],
        },
        {
          id: 'f2',
          name: '雌雄',
          format: 'LIST' as const,
          list: [{ value: '♂', isOther: false, customFieldValue: '' }],
        },
        {
          id: 'f3',
          name: '成幼',
          format: 'LIST' as const,
          list: [{ value: '成鳥', isOther: false, customFieldValue: '' }],
        },
      ],
    };
    const fieldButton = getToolPalette(layer, 'LINE', true)?.find((i) => i.id === 'HISYOU_FIELDS');
    //ラベルは実際のフィールド名のまま出す
    expect(fieldButton?.options?.map((o) => o.fieldName)).toEqual(['種名', '雌雄', '成幼']);
  });

  it('選択肢を持てないフィールド（文字列など）ではパレットを作らない', () => {
    const layer = {
      ...baseLayer,
      toolPalette: 'VEGETATION' as const,
      field: [{ id: 'f1', name: '区分', format: 'STRING' as const }],
    };
    expect(getToolPalette(layer, 'POLYGON', true)).toBeUndefined();
  });

  it('選択肢がまだ空でもボタンは出す（その場で足せるため）', () => {
    const layer = {
      ...baseLayer,
      toolPalette: 'VEGETATION' as const,
      field: [{ id: 'f1', name: '区分', format: 'LIST' as const, list: [] }],
    };
    const items = getToolPalette(layer, 'POLYGON', true);
    expect(items).toHaveLength(1);
    expect(items?.[0].fieldName).toBe('区分');
  });

  it('飛翔図は道具のボタンを返し、機能が無効なら返さない', () => {
    const layer = { ...baseLayer, type: 'LINE' as const, toolPalette: 'HISYOU' as const };
    expect(getToolPalette(layer, 'LINE', true)?.length).toBeGreaterThan(0);
    expect(getToolPalette(layer, 'LINE', false)).toBeUndefined();
  });
});

describe('getFieldOptions', () => {
  it('選択肢のコードを項目に載せる（コードの入れ先へ入れるため）', () => {
    const layer = {
      ...baseLayer,
      field: [
        {
          id: 'f1',
          name: '区分',
          format: 'LIST' as const,
          list: [
            { value: '草地', isOther: false, customFieldValue: '1' },
            { value: '樹林', isOther: false, customFieldValue: '2' },
          ],
        },
      ],
    };
    expect(getFieldOptions(layer, '区分').map((o) => o.fieldCode)).toEqual(['1', '2']);
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
