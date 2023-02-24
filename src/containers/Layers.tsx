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
import { useLayers2 } from '../hooks/useLayers2';
import { useEditable } from '../hooks/useEditable';

export default function LayerContainer({ navigation }: Props_Layers) {
  const { layers, changeLabel, changeVisible, changeActiveLayer, changeLayerOrder } = useLayers();
  const { editable } = useEditable();
  const { importFile } = useLayers2();
  const { expandData } = useScreen();
  const { runTutrial } = useTutrial();

  const pressLayerOrder = useCallback(
    (index: number) => {
      if (!editable) {
        AlertAsync(t('hooks.message.lockProject'));
        return;
      }
      changeLayerOrder(index);
    },
    [changeLayerOrder, editable]
  );

  const pressImportLayerAndData = useCallback(async () => {
    await runTutrial('LAYERS_BTN_IMPORT');
    if (!editable) {
      AlertAsync(t('hooks.message.lockProject'));
      return;
    }
    const { message } = await importFile();
    if (message !== '') await AlertAsync(message);
  }, [editable, importFile, runTutrial]);

  const gotoLayerEditForAdd = useCallback(() => {
    if (!editable) {
      AlertAsync(t('hooks.message.lockProject'));
      return;
    }
    expandData();
    navigation.navigate('LayerEdit', {
      previous: 'Layers',
      targetLayer: { ...TEMPLATE_LAYER, id: uuidv4() },
      isEdited: true,
    });
  }, [editable, expandData, navigation]);

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
