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

const setup = (projectId?: string) => {
  const baseSettings = settingsReducer(undefined, { type: '@@init' });
  const store = configureStore({
    reducer: { dataSet: dataSetReducer, layers: layersReducer, settings: settingsReducer, user: userReducer },
    preloadedState: {
      dataSet: [{ layerId: 'layer1', userId: undefined, data: [record] }],
      layers: [layer],
      settings: { ...baseSettings, projectId },
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

describe('useLayerEdit 共有プロジェクトで移行されない属性変更（同期監査 M12）', () => {
  it('個人（ローカル）プロジェクトでは改名・型変更しても警告対象にしない', () => {
    const { result } = setup();
    act(() => result.current.changeFieldName(0, '名前'));
    act(() => result.current.changeFieldFormat(1, 'STRING_MULTI'));
    expect(result.current.unmigratedCloudFieldNames).toEqual([]);
  });

  it('共有プロジェクトでは改名と型変更をした属性を変更前の名前で返す', () => {
    const { result } = setup('project1');
    act(() => result.current.changeFieldName(0, '名前'));
    act(() => result.current.changeFieldFormat(1, 'STRING_MULTI'));
    expect(result.current.unmigratedCloudFieldNames).toEqual(['name', 'description']);
  });

  it('共有プロジェクトでも、追加・削除・未変更の属性は対象にしない', () => {
    const { result } = setup('project1');
    expect(result.current.unmigratedCloudFieldNames).toEqual([]);
    act(() => result.current.addField());
    act(() => result.current.deleteField(2));
    expect(result.current.unmigratedCloudFieldNames).toEqual([]);
  });

  it('名前を変えて元に戻した属性は対象にしない', () => {
    const { result } = setup('project1');
    act(() => result.current.changeFieldName(0, '名前'));
    act(() => result.current.changeFieldName(0, 'name'));
    expect(result.current.unmigratedCloudFieldNames).toEqual([]);
  });

  it('保存後は保存済みの設定が基準になり、対象が無くなる', () => {
    const { result } = setup('project1');
    act(() => result.current.changeFieldName(0, '名前'));
    act(() => result.current.saveLayer());
    expect(result.current.unmigratedCloudFieldNames).toEqual([]);
  });
});

describe('useLayerEdit 形式変更で消える値の件数（E-M4）', () => {
  it('個人データでも、値が消える形式変更は件数を返す', () => {
    const { result } = setup();
    expect(result.current.lostFieldValueCount).toBe(0);
    act(() => result.current.changeFieldFormat(0, 'INTEGER'));
    //「地点A」は数値にならず空欄になる
    expect(result.current.lostFieldValueCount).toBe(1);
  });

  it('値がそのまま残る形式変更は0', () => {
    const { result } = setup();
    act(() => result.current.changeFieldFormat(1, 'STRING_MULTI'));
    expect(result.current.lostFieldValueCount).toBe(0);
  });
});
