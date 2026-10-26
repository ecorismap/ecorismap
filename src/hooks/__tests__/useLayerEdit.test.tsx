import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useLayerEdit } from '../useLayerEdit';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import settingsReducer from '../../modules/settings';
import userReducer from '../../modules/user';
import { COLOR } from '../../constants/AppConstants';
import { LayerType, RecordType } from '../../types';

const layer: LayerType = {
  id: 'layer1',
  name: 'kml',
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'CATEGORIZED',
    color: COLOR.RED,
    fieldName: 'name',
    colorRamp: 'RANDOM',
    customFieldValue: '',
    colorList: [{ value: '地点A', color: COLOR.BLUE }],
    transparency: 1,
  },
  label: 'name',
  visible: true,
  active: true,
  field: [
    { id: 'a', name: 'name', format: 'STRING' },
    { id: 'b', name: 'description', format: 'STRING' },
    { id: 'c', name: 'memo', format: 'STRING' },
  ],
};

const record = {
  id: 'r1',
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field: { name: '地点A', description: '説明A', memo: 'メモA' },
} as RecordType;

const setup = () => {
  const store = configureStore({
    reducer: { dataSet: dataSetReducer, layers: layersReducer, settings: settingsReducer, user: userReducer },
    preloadedState: {
      dataSet: [{ layerId: 'layer1', userId: undefined, data: [record] }],
      layers: [layer],
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(
    () => useLayerEdit(layer, false, undefined, undefined, undefined, undefined, undefined),
    { wrapper }
  );
  const saved = () => ({
    field: store.getState().dataSet[0].data[0].field,
    layer: store.getState().layers[0],
  });
  return { result, saved };
};

describe('useLayerEdit 属性の削除と名前変更を同時に行う', () => {
  it('削除した属性の名前を別の属性に付けると、その属性の値が入る', () => {
    const { result, saved } = setup();
    act(() => result.current.deleteField(0));
    act(() => result.current.changeFieldName(0, 'name'));
    act(() => result.current.saveLayer());
    const { field, layer: savedLayer } = saved();
    expect(field).toEqual({ name: '説明A', memo: 'メモA' });
    //消した属性を指していたラベル・色分けは解除され、付け直した属性へは移らない
    expect(savedLayer.label).toBe('');
    expect(savedLayer.colorStyle).toMatchObject({ colorType: 'SINGLE', fieldName: '', colorList: [] });
  });

  it('名前を変えた属性を削除すると、値も消える', () => {
    const { result, saved } = setup();
    act(() => result.current.changeFieldName(1, 'detail'));
    act(() => result.current.deleteField(1));
    act(() => result.current.saveLayer());
    expect(saved().field).toEqual({ name: '地点A', memo: 'メモA' });
  });

  it('ある属性を削除しつつ別の属性の名前を変えると、それぞれ反映される', () => {
    const { result, saved } = setup();
    act(() => result.current.deleteField(1));
    act(() => result.current.changeFieldName(0, '名前'));
    act(() => result.current.saveLayer());
    const { field, layer: savedLayer } = saved();
    expect(field).toEqual({ 名前: '地点A', memo: 'メモA' });
    expect(savedLayer.label).toBe('名前');
    expect(savedLayer.colorStyle.fieldName).toBe('名前');
  });

  it('名前の変更と形式の変更を同時に行っても値が残る', () => {
    const { result, saved } = setup();
    act(() => result.current.changeFieldName(2, '備考'));
    act(() => result.current.changeFieldFormat(2, 'STRING_MULTI'));
    act(() => result.current.saveLayer());
    expect(saved().field).toEqual({ name: '地点A', description: '説明A', 備考: 'メモA' });
  });
});
