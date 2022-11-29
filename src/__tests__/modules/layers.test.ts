import { COLOR } from '../../constants/AppConstants';
import reducer, { setLayersAction, addLayerAction, updateLayerAction, deleteLayerAction } from '../../modules/layers';
import { LayerType } from '../../types';
describe('modules/layers', () => {
  const state: LayerType[] = [
    {
      id: '0',
      name: 'ポイント',
      type: 'POINT',
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
        { id: '0-0', name: 'name', format: 'SERIAL' },
        { id: '0-1', name: 'time', format: 'DATETIME' },
        { id: '0-2', name: 'cmt', format: 'STRING' },
        { id: '0-3', name: 'photo', format: 'PHOTO' },
      ],
    },
  ];
  test('should set the layer to state', () => {
    const layer: LayerType[] = [
      {
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
      },
    ];
    const action = setLayersAction(layer);
    expect(reducer(state, action)).toEqual(layer);
  });

  test('should added the layer to state', () => {
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
    const action = addLayerAction(layer);
    expect(reducer(state, action)).toEqual([...state, layer]);
  });

  test('should update the layer at state.', () => {
    const layer: LayerType = {
      id: '0',
      name: 'ポイント',
      type: 'POINT',
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
      visible: false,
      active: true,
      field: [
        { id: '0-0', name: 'name', format: 'SERIAL' },
        { id: '0-1', name: 'time', format: 'DATETIME' },
        { id: '0-2', name: 'cmt', format: 'STRING' },
        { id: '0-3', name: 'photo', format: 'PHOTO' },
      ],
    };
    const action = updateLayerAction(layer);
    expect(reducer(state, action)).toEqual([layer]);
  });
  test('should delete the layer from state.', () => {
    const layer: LayerType = {
      id: '0',
      name: 'ポイント',
      type: 'POINT',
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
      visible: false,
      active: true,
      field: [
        { id: '0-0', name: 'name', format: 'SERIAL' },
        { id: '0-1', name: 'time', format: 'DATETIME' },
        { id: '0-2', name: 'cmt', format: 'STRING' },
        { id: '0-3', name: 'photo', format: 'PHOTO' },
      ],
    };
    const action = deleteLayerAction(layer);
    expect(reducer(state, action)).toEqual([]);
  });
});
