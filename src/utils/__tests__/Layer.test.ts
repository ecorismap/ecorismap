import { COLOR } from '../../constants/AppConstants';
import { LayerType } from '../../types';
import { getColor, changeLayerId } from '../Layer';

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
