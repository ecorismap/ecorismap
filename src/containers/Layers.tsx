import React, { useCallback } from 'react';
import { ulid } from 'ulid';
import { LayerType } from '../types';
import Layers from '../components/pages/Layers';
import { TEMPLATE_LAYER } from '../modules/layers';
import { useLayers } from '../hooks/useLayers';
import { Props_Layers } from '../routes';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { useTutrial } from '../hooks/useTutrial';
import { t } from '../i18n/config';
import { LayersContext } from '../contexts/Layers';
import { usePermission } from '../hooks/usePermission';
import * as DocumentPicker from 'expo-document-picker';
import { useGeoFile } from '../hooks/useGeoFile';
import { getExt } from '../utils/General';

export default function LayerContainer({ navigation }: Props_Layers) {
  //console.log('render LayerContainer');
  const {
    layers,
    filterdLayers,
    changeExpand,
    changeLabel,
    changeVisible,
    changeCustomLabel,
    changeActiveLayer,
    changeLayerOrder,
    updateLayersOrder,
    onDragBegin,
  } = useLayers();
  const { isRunningProject } = usePermission();
  const { importGeoFile } = useGeoFile();
  const { runTutrial } = useTutrial();

  const pressLayerOrder = useCallback(
    (layer: LayerType, direction: 'up' | 'down') => {
      const index = layers.findIndex((l) => l.id === layer.id);
      if (index === -1) return;
      changeLayerOrder(index, direction);
    },
    [changeLayerOrder, layers]
  );

  const pressImportLayerAndData = useCallback(async () => {
    await runTutrial('LAYERS_BTN_IMPORT');

    const file = await DocumentPicker.getDocumentAsync({});
    if (file.assets === null) return;
    const ext = getExt(file.assets[0].name)?.toLowerCase();
    if (
      !(
        ext === 'gpx' ||
        ext === 'geojson' ||
        ext === 'kml' ||
        ext === 'kmz' ||
        ext === 'zip' ||
        ext === 'csv' ||
        ext === 'json'
      )
    ) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    if (ext === 'json' && isRunningProject) {
      await AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    if (file.assets[0].size === undefined) {
      await AlertAsync(t('hooks.message.cannotGetFileSize'));
      return;
    }
    if (file.assets[0].size / 1024 > 100000) {
      await AlertAsync(t('hooks.message.cannotImportData'));
      return;
    }
    const { message } = await importGeoFile(file.assets[0].uri, file.assets[0].name);
    if (message !== '') await AlertAsync(message);
  }, [importGeoFile, isRunningProject, runTutrial]);

  const gotoLayerEditForAdd = useCallback(() => {
    if (isRunningProject) {
      AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    navigation.navigate('LayerEdit', {
      previous: 'Layers',
      targetLayer: { ...TEMPLATE_LAYER, id: ulid() },
      isEdited: true,
    });
  }, [isRunningProject, navigation]);

  const gotoLayerEdit = useCallback(
    (layer: LayerType) => {
      navigation.navigate('LayerEdit', {
        previous: 'Layers',
        targetLayer: { ...layer },
        isEdited: false,
      });
    },
    [navigation]
  );

  const gotoData = useCallback(
    (layer: LayerType) => {
      navigation.navigate('Data', {
        targetLayer: { ...layer },
      });
    },
    [navigation]
  );

  const gotoColorStyle = useCallback(
    (layer: LayerType) => {
      navigation.navigate('LayerEditFeatureStyle', {
        targetLayer: { ...layer },
        isEdited: false,
        previous: 'Layers',
      });
    },
    [navigation]
  );

  const layersContextValue = React.useMemo(
    () => ({
      layers,
      filterdLayers,
      changeExpand,
      changeVisible,
      changeLabel,
      changeCustomLabel,
      changeActiveLayer,
      pressLayerOrder,
      gotoLayerEditForAdd,
      pressImportLayerAndData,
      gotoData,
      gotoLayerEdit,
      gotoColorStyle,
      updateLayersOrder,
      onDragBegin,
    }),
    [
      changeActiveLayer,
      changeCustomLabel,
      changeExpand,
      changeLabel,
      changeVisible,
      filterdLayers,
      gotoColorStyle,
      gotoData,
      gotoLayerEdit,
      gotoLayerEditForAdd,
      layers,
      onDragBegin,
      pressImportLayerAndData,
      pressLayerOrder,
      updateLayersOrder,
    ]
  );

  return (
    <LayersContext.Provider value={layersContextValue}>
      <Layers />
    </LayersContext.Provider>
  );
}
