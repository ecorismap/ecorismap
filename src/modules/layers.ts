import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { COLOR } from '../constants/AppConstants';
import { t } from '../i18n/config';
import { LayerType } from '../types';
import { ulid } from 'ulid';

export const TEMPLATE_LAYER: LayerType = {
  id: '',
  name: '',
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.2,
    color: COLOR.RED,
    fieldName: '',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
    lineWidth: 1.5,
  },
  label: '',
  visible: true,
  active: false,
  field: [],
};

export const layersInitialState: LayerType[] = [
  {
    id: ulid(),
    name: t('common.point'),
    type: 'POINT',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.2,
      color: COLOR.RED,
      fieldName: 'name',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
    },
    label: 'name',
    visible: true,
    active: true,
    field: [
      { id: ulid(), name: 'name', format: 'SERIAL' },
      { id: ulid(), name: 'time', format: 'DATETIME' },
      { id: ulid(), name: 'cmt', format: 'STRING' },
      { id: ulid(), name: 'photo', format: 'PHOTO' },
    ],
  },
  {
    id: ulid(),
    name: t('common.line'),
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.2,
      color: COLOR.RED,
      fieldName: 'name',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: 'name',
    visible: true,
    active: true,
    field: [
      { id: ulid(), name: 'name', format: 'SERIAL' },
      { id: ulid(), name: 'time', format: 'DATETIME' },
      { id: ulid(), name: 'cmt', format: 'STRING' },
    ],
  },
  {
    id: ulid(),
    name: t('common.polygon'),
    type: 'POLYGON',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.2,
      color: COLOR.RED,
      fieldName: 'name',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 1.5,
    },
    label: 'name',
    visible: true,
    active: true,
    field: [
      { id: ulid(), name: 'name', format: 'SERIAL' },
      { id: ulid(), name: 'time', format: 'DATETIME' },
      { id: ulid(), name: 'cmt', format: 'STRING' },
    ],
  },
  {
    id: 'track',
    name: t('common.track'),
    type: 'LINE',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'SINGLE',
      transparency: 0.2,
      color: COLOR.BLUE,
      fieldName: 'name',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
      lineWidth: 2.5,
    },
    label: 'name',
    visible: true,
    active: false,
    field: [
      { id: ulid(), name: 'name', format: 'SERIAL' },
      { id: ulid(), name: 'time', format: 'DATETIME' },
      { id: ulid(), name: 'cmt', format: 'STRING' },
    ],
  },
];

const reducers = {
  setLayersAction: (_state: LayerType[], action: PayloadAction<LayerType[]>) => {
    return action.payload;
  },
  addLayerAction: (state: LayerType[], action: PayloadAction<LayerType>) => {
    state.push(action.payload);
  },
  updateLayerAction: (state: LayerType[], action: PayloadAction<LayerType>) => {
    const index = state.findIndex((layer) => layer.id === action.payload.id);
    if (index !== -1) {
      state[index] = action.payload;
    }
  },
  deleteLayerAction: (state: LayerType[], action: PayloadAction<LayerType>) => {
    return state.filter((layer) => layer.id !== action.payload.id);
  },
};

const layersSlice = createSlice({
  name: 'layers',
  initialState: layersInitialState,
  reducers,
});

export const { setLayersAction, addLayerAction, updateLayerAction, deleteLayerAction } = layersSlice.actions;
export default layersSlice.reducer;
