import { COLOR } from '../../constants/AppConstants';
import { LayerType } from '../../types';
import { getColor, getLayerSerial, updateLayerIds } from '../../utils/Layer';

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
    expect(getColor(layer, feature)).toBe('#ff0000');
  });
  it('return categorized feature color', () => {
    const layer2: LayerType = {
      ...layer,
      colorStyle: {
        colorType: 'CATEGORIZED',
        color: COLOR.RED,
        fieldName: 'name',
        colorRamp: 'RANDOM',
        colorList: [{ value: 'abc', color: '#00ff00' }],
        transparency: 1,
      },
    };

    expect(getColor(layer2, feature)).toBe('#00ff00');
  });
  it('return user feature color', () => {
    const layer3: LayerType = {
      ...layer,
      colorStyle: {
        colorType: 'USER',
        color: COLOR.RED,
        fieldName: 'name',
        colorRamp: 'RANDOM',
        colorList: [{ value: 'user1', color: '#0000ff' }],
        transparency: 1,
      },
    };
    expect(getColor(layer3, feature)).toBe('#0000ff');
  });
});

describe('getLayerSerial', () => {
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
  const data = [
    {
      id: '0',
      userId: undefined,
      displayName: null,
      checked: false,
      visible: true,
      type: 'LINE',
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { name: 1 },
    },
    {
      id: '1',
      userId: undefined,
      displayName: null,
      checked: false,
      visible: true,
      type: 'LINE',
      redraw: false,
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { name: 2 },
    },
  ];

  it('return next serial field number', () => {
    expect(getLayerSerial(layer, data)).toBe(3);
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
    const newLayer = updateLayerIds(layer);
    expect(newLayer.id).not.toEqual(layer.id);
    expect(newLayer.field[0].id).not.toEqual(layer.field[0].id);
    done();
  });
});
