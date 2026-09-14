import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useFieldList } from '../useFieldList';
import layersReducer from '../../modules/layers';
import { LayerType } from '../../types';

//辞書データの読み込みはこのテストの対象外
jest.mock('../../utils/SQLite', () => ({
  getDatabase: jest.fn(async () => ({ getAllSync: () => [] })),
  isValidTableName: () => false,
}));

const layerOf = (field: LayerType['field']): LayerType =>
  ({
    id: 'layer1',
    name: '植生図',
    type: 'POLYGON',
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'CATEGORIZED',
      transparency: false,
      color: 'rgba(0,0,0,1)',
      fieldName: '区分',
      customFieldValue: '',
      colorRamp: 'RANDOM',
      colorList: [],
    },
    label: '',
    visible: true,
    active: true,
    field,
  } as LayerType);

const renderFieldList = (layer: LayerType, fieldIndex = 0) => {
  const store = configureStore({ reducer: { layers: layersReducer }, preloadedState: { layers: [layer] } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useFieldList(layer, layer.field[fieldIndex], fieldIndex, false), { wrapper });
};

const categoryLayer = () =>
  layerOf([
    {
      id: 'f1',
      name: '区分',
      format: 'LIST',
      codeFieldId: 'f2',
      list: [
        { value: '草地', isOther: false, customFieldValue: '1' },
        { value: '樹林', isOther: false, customFieldValue: '2' },
      ],
    },
    { id: 'f2', name: '区分コード', format: 'STRING' },
    { id: 'f3', name: '写真', format: 'PHOTO' },
  ]);

describe('useFieldList コードの入れ先', () => {
  it('選択肢の文字を直してもコードは消えない', () => {
    const { result } = renderFieldList(categoryLayer());
    act(() => result.current.changeValue(0, '草原'));
    expect(result.current.itemValues[0]).toEqual({ value: '草原', isOther: false, customFieldValue: '1' });
    expect(result.current.itemValues[1].customFieldValue).toBe('2');
  });

  it('選択肢ごとのコードを変更できる', () => {
    const { result } = renderFieldList(categoryLayer());
    act(() => result.current.changeCodeValue(1, '20'));
    expect(result.current.itemValues[1]).toEqual({ value: '樹林', isOther: false, customFieldValue: '20' });
    expect(result.current.isEdited).toBe(true);
  });

  it('入れ先の候補は自分以外の文字・数値フィールドだけ（先頭は「なし」）', () => {
    const { result } = renderFieldList(categoryLayer());
    expect(result.current.codeFieldIds).toEqual(['', 'f2']);
    expect(result.current.codeFieldNames).toHaveLength(2);
  });

  it('保存済みの入れ先が初期値になる', () => {
    const { result } = renderFieldList(categoryLayer());
    expect(result.current.codeFieldId).toBe('f2');
    act(() => result.current.changeCodeFieldId(''));
    expect(result.current.codeFieldId).toBe('');
  });

  it('入れ先が消えていたら「なし」に戻す', () => {
    const layer = layerOf([
      { id: 'f1', name: '区分', format: 'LIST', codeFieldId: 'missing', list: [] },
      { id: 'f2', name: '写真', format: 'PHOTO' },
    ]);
    const { result } = renderFieldList(layer);
    expect(result.current.codeFieldId).toBe('');
    expect(result.current.codeFieldIds).toEqual(['']);
  });
});
