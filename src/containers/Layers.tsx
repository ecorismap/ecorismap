import React, { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
  const { layers, changeLabel, changeVisible, changeCustomLabel, changeActiveLayer, changeLayerOrder } = useLayers();
  const { isRunningProject } = usePermission();
  const { importGeoFile } = useGeoFile();
  const { runTutrial } = useTutrial();

  const pressLayerOrder = useCallback(
    (index: number) => {
      if (isRunningProject) {
        AlertAsync(t('hooks.message.cannotInRunningProject'));
        return;
      }
      changeLayerOrder(index);
    },
    [changeLayerOrder, isRunningProject]
  );

  const pressImportLayerAndData = useCallback(async () => {
    await runTutrial('LAYERS_BTN_IMPORT');
    if (isRunningProject) {
      AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    const file = await DocumentPicker.getDocumentAsync({});
    if (file.type === 'cancel') return;
    const ext = getExt(file.name)?.toLowerCase();
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
    if (file.size === undefined) {
      await AlertAsync(t('hooks.message.cannotGetFileSize'));
      return;
    }
    if (file.size / 1024 > 100000) {
      await AlertAsync(t('hooks.message.cannotImportData'));
      return;
    }
    const { message } = await importGeoFile(file.uri, file.name);
    if (message !== '') await AlertAsync(message);
  }, [importGeoFile, isRunningProject, runTutrial]);

  const gotoLayerEditForAdd = useCallback(() => {
    if (isRunningProject) {
      AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    navigation.navigate('LayerEdit', {
      previous: 'Layers',
      targetLayer: { ...TEMPLATE_LAYER, id: uuidv4() },
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

  return (
    <LayersContext.Provider
      value={{
        layers,
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
      }}
    >
      <Layers />
    </LayersContext.Provider>
  );
}
