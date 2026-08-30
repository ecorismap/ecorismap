import { COLOR } from '../../constants/AppConstants';
import { LayerType } from '../../types';
import { getColor, changeLayerId, applyColorStyle, getLineWidth } from '../Layer';

describe('getColor', () => {
  const layer: LayerType = {
    id: '1',
    name: 'トラック',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: 'name',
      colorRamp: 'RANDOM',
      customFieldValue: '',
      colorList: [],
      transparency: 1,
    },
    label: 'name',
    visible: true,
    active: true,
    field: [
      { id: '1-0', name: 'name', format: 'SERIAL' },
      { id: '1-1', name: 'time', format: 'DATETIME' },
      { id: '1-2', name: 'cmt', format: 'STRING' },
    ],
  };
  const feature = {
    id: '0',
    userId: undefined,
    displayName: 'user1',
    checked: false,
    visible: true,
    type: 'LINE',
    redraw: false,
    coords: [
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
    ],
    field: { name: 'abc' },
  };

  it('return single feature color', () => {
    expect(getColor(layer, feature)).toBe('rgba(255, 0, 0, 1)');
  });
  it('return categorized feature color', () => {
    const layer2: LayerType = {
      ...layer,
      colorStyle: {
        colorType: 'CATEGORIZED',
        color: COLOR.RED,
        fieldName: 'name',
        colorRamp: 'RANDOM',
        customFieldValue: '',
        colorList: [{ value: 'abc', color: '#00ff00' }],
        transparency: 1,
      },
    };

    expect(getColor(layer2, feature)).toBe('rgba(0, 255, 0, 1)');
  });
  // it('return user feature color', () => {
  //   const layer3: LayerType = {
  //     ...layer,
  //     colorStyle: {
  //       colorType: 'USER',
  //       color: COLOR.RED,
  //       fieldName: 'name',
  //       colorRamp: 'RANDOM',
  //       customFieldValue: '',
  //       colorList: [{ value: 'user1', color: '#0000ff' }],
  //       transparency: 1,
  //     },
  //   };
  //   expect(getColor(layer3, feature)).toBe('#0000ff');
  // });
});

describe('getLineWidth', () => {
  const layer: LayerType = {
    id: '1',
    name: 'ライン',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'CATEGORIZED',
      color: COLOR.RED,
      fieldName: '区分',
      colorRamp: 'RANDOM',
      customFieldValue: '',
      colorList: [],
      transparency: 1,
      lineWidth: 3,
    },
    label: '',
    visible: true,
    active: true,
    field: [],
  };
  const record = (field: any) => ({ id: '0', visible: true, redraw: false, coords: undefined, field } as any);

  it('レコードが太さを持つ場合はカラータイプに関係なくそれを使う', () => {
    expect(getLineWidth(layer, record({ _strokeWidth: 10 }))).toBe(10);
  });

  it('レコードが太さを持たない場合はレイヤの太さを使う', () => {
    expect(getLineWidth(layer, record({}))).toBe(3);
  });

  it('どちらも無い場合は既定値になる', () => {
    const noWidth = { ...layer, colorStyle: { ...layer.colorStyle, lineWidth: undefined } };
    expect(getLineWidth(noWidth, record({}))).toBe(1.5);
  });
});

describe('applyColorStyle', () => {
  const memoLayer: LayerType = {
    id: '1',
    name: 'メモ',
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'INDIVIDUAL',
      color: COLOR.RED,
      fieldName: '__CUSTOM',
      colorRamp: 'RANDOM',
      customFieldValue: '_strokeColor',
      colorList: [],
      transparency: 1,
      savedFieldName: '区分',
      savedCustomFieldValue: '',
      savedLabel: '種名',
    },
    label: '',
    visible: true,
    active: true,
    field: [],
  };

  it('カラータイプが[個別]のままなら退避したラベルは復元しない', () => {
    const result = applyColorStyle(memoLayer, memoLayer.colorStyle);
    expect(result.label).toBe('');
    expect(result.colorStyle.savedLabel).toBe('種名');
  });

  it('カラータイプを戻すと退避したラベルが復元され、退避データは消える', () => {
    const restored = applyColorStyle(memoLayer, {
      ...memoLayer.colorStyle,
      colorType: 'CATEGORIZED',
      fieldName: '区分',
      customFieldValue: '',
      savedFieldName: undefined,
      savedCustomFieldValue: undefined,
    });
    expect(restored.label).toBe('種名');
    expect(restored.colorStyle.savedLabel).toBeUndefined();
  });
});

describe('test ecorismap', function () {
  it('test ecorismap.updateLayerIds', function (done) {
    const layer: LayerType = {
      id: '1',
      name: 'トラック',
      type: 'LINE',
      permission: 'PRIVATE',
      colorStyle: {
        colorType: 'SINGLE',
        color: COLOR.RED,
        fieldName: 'name',
        colorRamp: 'RANDOM',
        colorList: [],
        customFieldValue: '',
        transparency: 1,
      },
      label: 'name',
      visible: true,
      active: true,
      field: [
        { id: '1-0', name: 'name', format: 'SERIAL' },
        { id: '1-1', name: 'time', format: 'DATETIME' },
        { id: '1-2', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.id).not.toEqual(layer.id);
    expect(newLayer.field[0].id).not.toEqual(layer.field[0].id);
    done();
  });
});

describe('changeLayerId dictionaryFieldId', () => {
  const baseLayer: LayerType = {
    id: '1',
    name: 'ポイント',
    type: 'POINT',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      color: COLOR.RED,
      fieldName: 'name',
      colorRamp: 'RANDOM',
      colorList: [],
      customFieldValue: '',
      transparency: 1,
    },
    label: 'name',
    visible: true,
    active: true,
    field: [],
  };

  it('辞書型フィールドのuseDictionaryAddからdictionaryFieldIdを引き継ぐ', () => {
    const layer: LayerType = {
      ...baseLayer,
      dictionaryFieldId: '1-0',
      field: [
        { id: '1-0', name: 'species', format: 'STRING_DICTIONARY', useDictionaryAdd: true },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBe(newLayer.field[0].id);
    expect(newLayer.field[0].useDictionaryAdd).toBe(true);
  });

  it('動的辞書型フィールドのuseDictionaryAddからもdictionaryFieldIdを引き継ぐ', () => {
    const layer: LayerType = {
      ...baseLayer,
      dictionaryFieldId: '1-0',
      field: [
        { id: '1-0', name: 'species', format: 'STRING_DYNAMIC', useDictionaryAdd: true },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBe(newLayer.field[0].id);
    expect(newLayer.field[0].useDictionaryAdd).toBe(true);
  });

  it('辞書型以外に残留したuseDictionaryAddは解除しdictionaryFieldIdを設定しない', () => {
    const layer: LayerType = {
      ...baseLayer,
      field: [
        { id: '1-0', name: 'species', format: 'STRING', useDictionaryAdd: true },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBeUndefined();
    expect(newLayer.field[0].useDictionaryAdd).toBe(false);
  });

  it('辞書型以外を指すdictionaryFieldIdは引き継がない', () => {
    const layer: LayerType = {
      ...baseLayer,
      dictionaryFieldId: '1-0',
      field: [
        { id: '1-0', name: 'species', format: 'STRING' },
        { id: '1-1', name: 'cmt', format: 'STRING' },
      ],
    };
    const { layer: newLayer } = changeLayerId(layer);
    expect(newLayer.dictionaryFieldId).toBeUndefined();
  });
});
