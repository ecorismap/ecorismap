import produce, { enableES5 } from 'immer';
enableES5();
import { COLOR } from '../constants/AppConstants';
import { t } from '../i18n/config';
import { LayerType } from '../types';

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
      id: '0',
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
        { id: '0-0', name: 'name', format: 'SERIAL' },
        { id: '0-1', name: 'time', format: 'DATETIME' },
        { id: '0-2', name: 'cmt', format: 'STRING' },
        { id: '0-3', name: 'photo', format: 'PHOTO' },
      ],
    },
    {
      id: '1',
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
        { id: '1-0', name: 'name', format: 'SERIAL' },
        { id: '1-1', name: 'time', format: 'DATETIME' },
        { id: '1-2', name: 'cmt', format: 'STRING' },
      ],
    },
    {
      id: '2',
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
        { id: '2-0', name: 'name', format: 'SERIAL' },
        { id: '2-1', name: 'time', format: 'DATETIME' },
        { id: '2-2', name: 'cmt', format: 'STRING' },
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
