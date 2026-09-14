import { BRUSH_HISYOU, STAMP_HISYOU } from '../AppConstants';
import { getHisyouBehavior, getSymbolKey, HISYOU_BEHAVIORS } from '../HisyouBehavior';
import layerPresets from '../../presets/layerPresets.json';

const hisyouFields = (() => {
  const preset = layerPresets.find((p) => p.presetId === 'preset-layer-hisyou-map');
  return (preset?.layer.field ?? []) as { name: string; format: string; list?: { value: string }[] }[];
})();
const valuesOf = (name: string) => hisyouFields.find((f) => f.name === name)?.list?.map((item) => item.value) ?? [];

describe('HISYOU_BEHAVIORS', () => {
  it('属性を持つのは記号だけでは中身が分からない行動だけ（記号は増やさない）', () => {
    const symbols = HISYOU_BEHAVIORS.map((b) => b.symbol);
    expect(symbols).toHaveLength(new Set(symbols).size);
    const allSymbols = [...Object.keys(STAMP_HISYOU), ...Object.keys(BRUSH_HISYOU)];
    symbols.forEach((s) => expect(allSymbols).toContain(s));
    //飛翔の様子そのものは記号を見れば分かるので属性を持たない
    expect(allSymbols.filter((s) => !symbols.includes(s as (typeof symbols)[number]))).toEqual([
      'HOVERING',
      'SENKAI',
      'SENJYOU',
      'KYUKOKA',
    ]);
  });

  it('行動ごとのフィールドがプリセットにCHECKで存在する', () => {
    HISYOU_BEHAVIORS.forEach((b) => {
      const field = hisyouFields.find((f) => f.name === b.fieldName);
      expect(field).toBeDefined();
      //親の飛翔線へ複数の行動が集約されるのでCHECKでなければ表示が壊れる
      expect(field?.format).toBe('CHECK');
    });
  });

  it('記号を置いたときに入る既定値は、そのフィールドの選択肢にある', () => {
    HISYOU_BEHAVIORS.forEach((b) => {
      expect(valuesOf(b.fieldName)).toContain(b.defaultValue);
    });
  });

  it('中身が分かれない行動は「あり」だけ（選ぶものが無いので聞かない）', () => {
    HISYOU_BEHAVIORS.filter((b) => b.hasDetail !== true).forEach((b) => {
      expect(b.defaultValue).toBe('あり');
      expect(valuesOf(b.fieldName)).toEqual(['あり']);
    });
    expect(HISYOU_BEHAVIORS.filter((b) => b.hasDetail !== true).map((b) => b.fieldName)).toEqual(['探餌', '狩り']);
  });

  it('中身が分かれる行動は選択肢が2つ以上あり、既定値は「不明」', () => {
    HISYOU_BEHAVIORS.filter((b) => b.hasDetail === true).forEach((b) => {
      expect(b.defaultValue).toBe('不明');
      expect(valuesOf(b.fieldName).length).toBeGreaterThan(1);
    });
  });
});

describe('getHisyouBehavior', () => {
  it('記号のキーから行動のフィールドを引く', () => {
    expect(getHisyouBehavior('TOMARI')).toMatchObject({ fieldName: 'とまり', defaultValue: '不明', hasDetail: true });
    expect(getHisyouBehavior('KARI')).toMatchObject({ fieldName: '狩り', defaultValue: 'あり' });
    //飛翔の様子は属性を持たない（記号だけで分かるので聞かない）
    expect(getHisyouBehavior('SENKAI')).toBeUndefined();
    expect(getHisyouBehavior('HOVERING')).toBeUndefined();
    //誇示は記号ごとに別のフィールド
    expect(getHisyouBehavior('DISPLAY1')?.fieldName).toBe('誇示単発');
    expect(getHisyouBehavior('DISPLAY2')?.fieldName).toBe('誇示連続');
  });

  it('飛翔図以外の記号（マップメモのスタンプなど）はundefined', () => {
    expect(getHisyouBehavior('CIRCLE')).toBeUndefined();
    expect(getHisyouBehavior('ARROW_END')).toBeUndefined();
    expect(getHisyouBehavior('')).toBeUndefined();
  });
});

describe('getSymbolKey', () => {
  it('スタンプがあればスタンプ、無ければブラシ種別を記号のキーにする', () => {
    expect(getSymbolKey({ stamp: 'TOMARI', strokeStyle: '' })).toBe('TOMARI');
    expect(getSymbolKey({ stamp: '', strokeStyle: 'TANJI' })).toBe('TANJI');
    //ペンのストロークは矢印スタイルが入るので、行動には対応しない
    expect(getHisyouBehavior(getSymbolKey({ stamp: '', strokeStyle: 'ARROW_END' }))).toBeUndefined();
  });
});

describe('飛翔図プリセットの属性の並び', () => {
  it('種名・時刻・齢・性別・高度のあとに行動が並ぶ', () => {
    const names = hisyouFields.map((f) => f.name);
    expect(names.slice(0, 9)).toEqual([
      '調査日',
      '調査地点',
      '観察No.',
      '種名',
      '確認時刻',
      '齢',
      '性別',
      '高度1(内)',
      '高度2(外)',
    ]);
    //行動は記録の頻度・まとまりで並べる（対応表の並びと揃える）
    const behaviorFieldNames = HISYOU_BEHAVIORS.map((b) => b.fieldName);
    expect(behaviorFieldNames).toEqual([
      '誇示単発',
      '誇示連続',
      '排斥',
      '餌運搬',
      'とまり',
      '交尾',
      '声',
      '巣材運搬',
      '探餌',
      '狩り',
    ]);
    expect(names.slice(9, 9 + behaviorFieldNames.length)).toEqual(behaviorFieldNames);
    //行動のあとは記号にできない観察事項
    expect(names[9 + behaviorFieldNames.length]).toBe('その他');
  });
});
