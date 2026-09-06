import { useCallback, useMemo, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { LayerType } from '../types';
import { RootState, AppDispatch } from '../store';
import { useLayers } from './useLayers';
import { usePermission } from './usePermission';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';

export type EditableFeatureType = 'POINT' | 'LINE' | 'POLYGON' | 'MEMO';
type LayerFeatureType = 'POINT' | 'LINE' | 'POLYGON';
type PickerResult = LayerType | 'NEW' | undefined;

export type LayerSelectProps = {
  visible: boolean;
  candidates: LayerType[];
  activeLayerId: string | undefined;
  showCreateNew: boolean;
  onSelect: (layer: LayerType) => void;
  onCreateNew: () => void;
  onCancel: () => void;
};

export type UseEditableLayerSelectionReturnType = {
  layerSelectProps: LayerSelectProps;
  ensureEditableLayer: (featureType: EditableFeatureType) => Promise<boolean>;
  openLayerSwitcher: (featureType: EditableFeatureType) => Promise<void>;
};

const typeLabel = (layerType: LayerFeatureType) => {
  switch (layerType) {
    case 'POINT':
      return t('common.point');
    case 'LINE':
      return t('common.line');
    case 'POLYGON':
      return t('common.polygon');
  }
};

export const useEditableLayerSelection = (opts: {
  onRequestCreateLayer: (featureType: LayerFeatureType) => void;
}): UseEditableLayerSelectionReturnType => {
  const { onRequestCreateLayer } = opts;
  const dispatch = useDispatch<AppDispatch>();
  const { activateLayer, changeVisible } = useLayers();
  const { isRunningProject } = usePermission();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<LayerType[]>([]);
  const [pickerActiveLayerId, setPickerActiveLayerId] = useState<string | undefined>(undefined);
  const [pickerShowCreateNew, setPickerShowCreateNew] = useState(false);
  const pickerResolveRef = useRef<((result: PickerResult) => void) | undefined>(undefined);

  //ツール選択のハンドラ実行中でも最新のレイヤ状態を読む（stale closure対策）
  const getCurrentLayers = useCallback(
    () => dispatch((_thunkDispatch, getState) => (getState() as RootState).layers),
    [dispatch]
  );

  const getCandidates = useCallback(
    (layerType: LayerFeatureType) =>
      getCurrentLayers().filter(
        (l: LayerType) =>
          l.type === layerType && l.id !== 'track' && !(isRunningProject && l.permission === 'COMMON')
      ),
    [getCurrentLayers, isRunningProject]
  );

  const openPicker = useCallback(
    (candidates: LayerType[], activeLayerId: string | undefined, showCreateNew: boolean): Promise<PickerResult> => {
      setPickerCandidates(candidates);
      setPickerActiveLayerId(activeLayerId);
      setPickerShowCreateNew(showCreateNew);
      setPickerVisible(true);
      return new Promise<PickerResult>((resolve) => {
        pickerResolveRef.current = resolve;
      });
    },
    []
  );

  const closePicker = useCallback((result: PickerResult) => {
    setPickerVisible(false);
    pickerResolveRef.current?.(result);
    pickerResolveRef.current = undefined;
  }, []);

  //選択したレイヤを編集レイヤにする。非表示なら表示もする
  const applyLayer = useCallback(
    (layer: LayerType) => {
      activateLayer(layer);
      if (!layer.visible) changeVisible(true, layer);
    },
    [activateLayer, changeVisible]
  );

  //候補ゼロのときの処理。実行中プロジェクトはロック通知、それ以外は新規レイヤ作成を提案
  const handleNoCandidates = useCallback(
    async (layerType: LayerFeatureType) => {
      if (isRunningProject) {
        await AlertAsync(t('hooks.message.lockProject'));
        return;
      }
      const ret = await ConfirmAsync(t('Home.confirm.createNewLayerForType', { type: typeLabel(layerType) }));
      if (ret) onRequestCreateLayer(layerType);
    },
    [isRunningProject, onRequestCreateLayer]
  );

  const ensureEditableLayer = useCallback(
    async (featureType: EditableFeatureType): Promise<boolean> => {
      const layerType: LayerFeatureType = featureType === 'MEMO' ? 'LINE' : featureType;
      const candidates = getCandidates(layerType);
      const activeLayer = candidates.find((l) => l.active);

      if (activeLayer !== undefined) {
        if (!activeLayer.visible) {
          const ret = await ConfirmAsync(t('Home.confirm.showLayerAndEdit', { name: activeLayer.name }));
          if (!ret) return false;
          changeVisible(true, activeLayer);
        }
        return true;
      }
      if (candidates.length === 0) {
        await handleNoCandidates(layerType);
        return false;
      }
      if (candidates.length === 1) {
        const layer = candidates[0];
        const ret = await ConfirmAsync(t('Home.confirm.activateLayer', { name: layer.name }));
        if (!ret) return false;
        applyLayer(layer);
        return true;
      }
      const result = await openPicker(candidates, undefined, !isRunningProject);
      if (result === undefined) return false;
      if (result === 'NEW') {
        onRequestCreateLayer(layerType);
        return false;
      }
      applyLayer(result);
      return true;
    },
    [applyLayer, changeVisible, getCandidates, handleNoCandidates, isRunningProject, onRequestCreateLayer, openPicker]
  );

  const openLayerSwitcher = useCallback(
    async (featureType: EditableFeatureType): Promise<void> => {
      const layerType: LayerFeatureType = featureType === 'MEMO' ? 'LINE' : featureType;
      const candidates = getCandidates(layerType);
      if (candidates.length === 0) {
        await handleNoCandidates(layerType);
        return;
      }
      const activeLayer = candidates.find((l) => l.active);
      const result = await openPicker(candidates, activeLayer?.id, !isRunningProject);
      if (result === undefined) return;
      if (result === 'NEW') {
        onRequestCreateLayer(layerType);
        return;
      }
      if (result.id === activeLayer?.id) {
        //既に編集レイヤ。非表示なら表示化だけ行う
        if (!result.visible) changeVisible(true, result);
        return;
      }
      applyLayer(result);
    },
    [applyLayer, changeVisible, getCandidates, handleNoCandidates, isRunningProject, onRequestCreateLayer, openPicker]
  );

  const layerSelectProps: LayerSelectProps = useMemo(
    () => ({
      visible: pickerVisible,
      candidates: pickerCandidates,
      activeLayerId: pickerActiveLayerId,
      showCreateNew: pickerShowCreateNew,
      onSelect: (layer: LayerType) => closePicker(layer),
      onCreateNew: () => closePicker('NEW'),
      onCancel: () => closePicker(undefined),
    }),
    [closePicker, pickerActiveLayerId, pickerCandidates, pickerShowCreateNew, pickerVisible]
  );

  return { layerSelectProps, ensureEditableLayer, openLayerSwitcher } as const;
};
