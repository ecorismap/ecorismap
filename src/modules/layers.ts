import produce, { enableES5 } from 'immer';
enableES5();
import { COLOR } from '../constants/AppConstants';
import { t } from '../i18n/config';
import { LayerType } from '../types';
import { v4 as uuidv4 } from 'uuid';

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

export function createLayersInitialState(): LayerType[] {
  return [
    {
      id: uuidv4(),
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
        { id: uuidv4(), name: 'name', format: 'SERIAL' },
        { id: uuidv4(), name: 'time', format: 'DATETIME' },
        { id: uuidv4(), name: 'cmt', format: 'STRING' },
        { id: uuidv4(), name: 'photo', format: 'PHOTO' },
      ],
    },
    {
      id: uuidv4(),
      name: t('common.track'),
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
        { id: uuidv4(), name: 'name', format: 'SERIAL' },
        { id: uuidv4(), name: 'time', format: 'DATETIME' },
        { id: uuidv4(), name: 'cmt', format: 'STRING' },
      ],
    },
    {
      id: uuidv4(),
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
        { id: uuidv4(), name: 'name', format: 'SERIAL' },
        { id: uuidv4(), name: 'time', format: 'DATETIME' },
        { id: uuidv4(), name: 'cmt', format: 'STRING' },
      ],
    },
  ];
}

export const SET = 'layers/set' as const;
export const ADD = 'layers/add' as const;
export const UPDATE = 'layers/update' as const;
export const DELETE = 'layers/delete' as const;

export const setLayersAction = (payload: LayerType[]) => ({
  type: SET,
  value: payload,
});
export const addLayerAction = (payload: LayerType) => ({
  type: ADD,
  value: payload,
});
export const updateLayerAction = (payload: LayerType) => ({
  type: UPDATE,
  value: payload,
});
export const deleteLayerAction = (payload: LayerType) => ({
  type: DELETE,
  value: payload,
});

export type Action =
  | Readonly<ReturnType<typeof setLayersAction>>
  | Readonly<ReturnType<typeof addLayerAction>>
  | Readonly<ReturnType<typeof updateLayerAction>>
  | Readonly<ReturnType<typeof deleteLayerAction>>;

const reducer = produce((draft, action: Action) => {
  switch (action.type) {
    case SET:
      return action.value;
    case ADD:
      draft.push(action.value);
      break;
    case UPDATE: {
      return draft.map((n) => (n.id !== action.value.id ? n : action.value));
    }
    case DELETE: {
      return draft.filter((n) => n.id !== action.value.id);
    }
    default:
      return draft;
  }
}, createLayersInitialState());
export default reducer;
