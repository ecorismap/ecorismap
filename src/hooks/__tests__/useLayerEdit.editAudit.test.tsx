/**
 * レイヤ設定の監査修正（docs/EDIT_AUDIT_2026-11.md の E-M6・E-M7・E-M8・E-M17・E-L2）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { discardPendingLayerPreset, useLayerEdit } from '../useLayerEdit';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import settingsReducer from '../../modules/settings';
import userReducer from '../../modules/user';
import { COLOR } from '../../constants/AppConstants';
import { LAYER_PRESETS } from '../../constants/Presets';
import { createLayerFromPreset } from '../../utils/Preset';
import { importPresetDictionaries } from '../../utils/PresetDictionary';
import { t } from '../../i18n/config';
import { LayerType, RecordType, SettingsType } from '../../types';

jest.mock('../../utils/PresetDictionary', () => ({
  importPresetDictionaries: jest.fn(() => Promise.resolve()),
}));

const baseLayer: LayerType = {
  id: 'layer1',
  name: 'L',
  type: 'POLYGON',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    color: COLOR.RED,
    fieldName: '',
    colorRamp: 'RANDOM',
    customFieldValue: '',
    colorList: [],
    transparency: 0.2,
  },
  label: '',
  visible: true,
  active: true,
  field: [
    { id: 'a', name: '樹種', format: 'STRING' },
    { id: 'b', name: '本数', format: 'INTEGER' },
  ],
};

const record = {
  id: 'r1',
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: undefined,
  field: { 樹種: 'スギ', 本数: 3 },
} as unknown as RecordType;

const createStore = (layers: LayerType[], dataFilter?: { text: string; fieldName: string }) => {
  const baseSettings = settingsReducer(undefined, { type: '@@init' });
  return configureStore({
    reducer: { dataSet: dataSetReducer, layers: layersReducer, settings: settingsReducer, user: userReducer },
    preloadedState: {
      dataSet: [{ layerId: 'layer1', userId: undefined, data: [record] }],
      layers,
      settings: {
        ...baseSettings,
        projectId: undefined,
        dataFilterPerLayer: (dataFilter === undefined ? {} : { layer1: dataFilter }) as SettingsType['dataFilterPerLayer'],
      },
    },
  });
};

const render = (store: ReturnType<typeof createStore>, layer: LayerType, isEdited = false) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useLayerEdit(layer, isEdited, undefined, undefined, undefined, undefined, undefined), {
    wrapper,
  });
};

describe('E-M6 数値の既定値', () => {
  it('値設定で空欄のまま戻ると、既定値はNaNではなく未設定になる', () => {
    const store = createStore([baseLayer]);
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    //値設定の画面から戻るときの params。毎回作り直すと effect が回り続けるので固定する
    const itemValues = [{ value: '', isOther: false, customFieldValue: '' }];
    const { result } = renderHook(() => useLayerEdit(baseLayer, true, 1, itemValues, undefined, false, undefined), {
      wrapper,
    });
    expect(result.current.targetLayer.field[1].defaultValue).toBeUndefined();
  });
});

describe('E-L2 形式の変更と既定値', () => {
  it('STRINGの既定値「未確認」はINTEGERへ変えると外れる', () => {
    const layer = { ...baseLayer, field: [{ ...baseLayer.field[0], defaultValue: '未確認' }, baseLayer.field[1]] };
    const store = createStore([layer]);
    const { result } = render(store, layer);
    act(() => result.current.changeFieldFormat(0, 'INTEGER'));
    expect(result.current.targetLayer.field[0].format).toBe('INTEGER');
    expect('defaultValue' in result.current.targetLayer.field[0]).toBe(false);
  });

  //再レビュー: 形式を誤って変えてすぐ戻したとき、保存前に既定値が失われないこと
  it('LISTの既定の区分は、STRINGへ変えてLISTへ戻しても残る', () => {
    const listField = {
      id: 'a',
      name: '樹種',
      format: 'LIST' as const,
      list: [
        { value: 'スギ', isOther: false, customFieldValue: '' },
        { value: 'ヒノキ', isOther: false, customFieldValue: '' },
      ],
      defaultValue: 'ヒノキ',
    };
    const layer = { ...baseLayer, field: [listField, baseLayer.field[1]] };
    const store = createStore([layer]);
    const { result } = render(store, layer);
    act(() => result.current.changeFieldFormat(0, 'STRING'));
    act(() => result.current.changeFieldFormat(0, 'LIST'));
    expect(result.current.targetLayer.field[0].defaultValue).toBe('ヒノキ');
  });

  it('TIMERANGEの既定値は、STRINGを経てTIMERANGEへ戻すと保存済みの値に戻る', () => {
    const layer = {
      ...baseLayer,
      field: [{ id: 'a', name: '時間', format: 'TIMERANGE' as const, defaultValue: '09:00-10:00' }, baseLayer.field[1]],
    };
    const store = createStore([layer]);
    const { result } = render(store, layer);
    act(() => result.current.changeFieldFormat(0, 'STRING'));
    act(() => result.current.changeFieldFormat(0, 'TIMERANGE'));
    expect(result.current.targetLayer.field[0].defaultValue).toBe('09:00-10:00');
  });

  it('INTEGERの既定値は、外れる形式を経てINTEGERへ戻すと保存済みの値に戻る', () => {
    const layer = { ...baseLayer, field: [baseLayer.field[0], { ...baseLayer.field[1], defaultValue: 5 }] };
    const store = createStore([layer]);
    const { result } = render(store, layer);
    act(() => result.current.changeFieldFormat(1, 'DATESTRING'));
    expect('defaultValue' in result.current.targetLayer.field[1]).toBe(false);
    act(() => result.current.changeFieldFormat(1, 'INTEGER'));
    expect(result.current.targetLayer.field[1].defaultValue).toBe(5);
  });
});

describe('E-M7 プリセットの辞書は値設定・スタイルの画面を往復しても登録される', () => {
  const preset = LAYER_PRESETS.find((p) => createLayerFromPreset(p, 'x').dictionaries.length > 0);

  beforeEach(() => {
    (importPresetDictionaries as jest.Mock).mockClear();
  });

  it('適用→画面を離れて戻る（再マウント）→保存で辞書を登録する', () => {
    expect(preset).toBeDefined();
    const newLayer = { ...baseLayer, id: 'newLayer', field: [] };
    const store = createStore([baseLayer]);
    const first = render(store, newLayer, true);
    act(() => first.result.current.applyLayerPreset(preset!.presetId));
    const presetLayer = first.result.current.targetLayer;
    //値設定の画面へ移るとLayerEditはアンマウントされ、戻ると編集中の状態で新しく作られる
    first.unmount();
    const second = render(store, presetLayer, true);
    act(() => second.result.current.saveLayer());
    expect(importPresetDictionaries).toHaveBeenCalledTimes(1);
    expect((importPresetDictionaries as jest.Mock).mock.calls[0][0]).toBe('newLayer');
  });

  it('保存せずに離れた保留分は捨て、一覧から開き直したときに登録しない', () => {
    const newLayer = { ...baseLayer, id: 'newLayer2', field: [] };
    const store = createStore([baseLayer]);
    const first = render(store, newLayer, true);
    act(() => first.result.current.applyLayerPreset(preset!.presetId));
    first.unmount();
    discardPendingLayerPreset('newLayer2');
    const second = render(store, first.result.current.targetLayer, true);
    act(() => second.result.current.saveLayer());
    expect(importPresetDictionaries).not.toHaveBeenCalled();
  });

  //再レビュー: ← 以外の経路で離れたときも、一覧から開き直せば（isEdited=false のマウント）保留分は捨てられる
  it('既存レイヤで適用して離れ、一覧から開き直して保存しても古い辞書を登録しない', () => {
    expect(preset).toBeDefined();
    const store = createStore([baseLayer]);
    const first = render(store, baseLayer, true);
    act(() => first.result.current.applyLayerPreset(preset!.presetId));
    first.unmount();
    //discardPendingLayerPreset は呼ばない
    const second = render(store, baseLayer, false);
    act(() => second.result.current.saveLayer());
    expect(importPresetDictionaries).not.toHaveBeenCalled();
  });
});

describe('E-M8 区分がSTRINGのレイヤで用途を植生図にする', () => {
  it('コードの入れ先を結ばない（保存できない設定を作らない）', () => {
    const category = t('common.category');
    const layer = { ...baseLayer, field: [{ id: 'cat', name: category, format: 'STRING' as const }] };
    const store = createStore([layer]);
    const { result } = render(store, layer);
    act(() => result.current.changeToolPalette('VEGETATION'));
    expect(result.current.targetLayer.field.find((f) => f.name === category)?.codeFieldId).toBeUndefined();
  });

  it('区分が無いときは従来どおり選択肢の区分を作り、コードの入れ先を結ぶ', () => {
    const store = createStore([baseLayer]);
    const { result } = render(store, baseLayer);
    act(() => result.current.changeToolPalette('VEGETATION'));
    const category = result.current.targetLayer.field.find((f) => f.name === t('common.category'));
    expect(category?.format).toBe('LIST');
    expect(category?.codeFieldId).toBeDefined();
  });
});

describe('E-M17 データ一覧の絞り込みと列の改名・削除', () => {
  it('絞り込み中の列を改名すると、絞り込みも新しい名前へ移る', () => {
    const store = createStore([baseLayer], { text: 'スギ', fieldName: '樹種' });
    const { result } = render(store, baseLayer);
    act(() => result.current.changeFieldName(0, '樹木名'));
    act(() => result.current.saveLayer());
    expect(store.getState().settings.dataFilterPerLayer?.layer1).toEqual({ text: 'スギ', fieldName: '樹木名' });
  });

  it('絞り込み中の列を削除すると、絞り込みを解除する', () => {
    const store = createStore([baseLayer], { text: 'スギ', fieldName: '樹種' });
    const { result } = render(store, baseLayer);
    act(() => result.current.deleteField(0));
    act(() => result.current.saveLayer());
    expect(store.getState().settings.dataFilterPerLayer?.layer1).toEqual({ text: '', fieldName: '' });
  });

  it('別の列の変更では絞り込みに触れない', () => {
    const store = createStore([baseLayer], { text: 'スギ', fieldName: '樹種' });
    const { result } = render(store, baseLayer);
    act(() => result.current.changeFieldName(1, '株数'));
    act(() => result.current.saveLayer());
    expect(store.getState().settings.dataFilterPerLayer?.layer1).toEqual({ text: 'スギ', fieldName: '樹種' });
  });
});
