import React, { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { LayerType } from '../types';
import Layers from '../components/pages/Layers';
import { TEMPLATE_LAYER } from '../modules/layers';
import { useLayers } from '../hooks/useLayers';
import { Props_Layers } from '../routes';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { useScreen } from '../hooks/useScreen';
import { useTutrial } from '../hooks/useTutrial';
import { t } from '../i18n/config';
import { LayersContext } from '../contexts/Layers';
import { usePermission } from '../hooks/usePermission';
import * as DocumentPicker from 'expo-document-picker';
import { useGeoFile } from '../hooks/useGeoFile';

export default function LayerContainer({ navigation }: Props_Layers) {
  const { layers, changeLabel, changeVisible, changeActiveLayer, changeLayerOrder } = useLayers();
  const { isRunningProject } = usePermission();
  const { importGeoFile } = useGeoFile();
  const { expandData } = useScreen();
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

    const { message } = await importGeoFile(file.uri, file.name, file.size);
    if (message !== '') await AlertAsync(message);
  }, [importGeoFile, isRunningProject, runTutrial]);

  const gotoLayerEditForAdd = useCallback(() => {
    if (isRunningProject) {
      AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    expandData();
    navigation.navigate('LayerEdit', {
      previous: 'Layers',
      targetLayer: { ...TEMPLATE_LAYER, id: uuidv4() },
      isEdited: true,
    });
  }, [expandData, isRunningProject, navigation]);

  const gotoLayerEdit = useCallback(
    (layer: LayerType) => {
      expandData();
      navigation.navigate('LayerEdit', {
        previous: 'Layers',
        targetLayer: { ...layer },
        isEdited: false,
      });
    },
    [expandData, navigation]
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
      expandData();
      navigation.navigate('LayerEditFeatureStyle', {
        targetLayer: { ...layer },
        isEdited: false,
        previous: 'Layers',
      });
    },
    [expandData, navigation]
  );

  return (
    <LayersContext.Provider
      value={{
        layers,
        changeVisible,
        changeLabel,
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
