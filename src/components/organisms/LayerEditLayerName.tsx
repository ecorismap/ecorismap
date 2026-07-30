import React, { useContext, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ModalSelector from 'react-native-modal-selector';

import { COLOR } from '../../constants/AppConstants';
import { LAYER_PRESETS } from '../../constants/Presets';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { t } from '../../i18n/config';
import { TextInput } from '../atoms';

export const LayerName = () => {
  const { layer, isNewLayer, onChangeLayerName, submitLayerName, onChangeLayerPreset } = useContext(LayerEditContext);
  const { mapLayerPresets } = useFeatureFlags();
  const editable = true;
  const showPresetSelector = isNewLayer && mapLayerPresets;
  const presetItems = useMemo(
    () => LAYER_PRESETS.map((p, index) => ({ key: index, label: p.presetName, value: p.presetId })),
    []
  );

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TextInput
          style={styles.input}
          label={t('common.layerName')}
          editable={editable}
          value={layer.name}
          onChangeText={onChangeLayerName}
          onEndEditing={submitLayerName}
          onBlur={submitLayerName}
        />
        {showPresetSelector && (
          <ModalSelector
            data={presetItems}
            animationType={'none'}
            cancelText={t('common.cancel')}
            onChange={(option) => onChangeLayerPreset(option.value)}
          >
            <View style={styles.presetButton}>
              <MaterialCommunityIcons name={'chevron-down'} size={24} color={COLOR.GRAY4} />
            </View>
          </ModalSelector>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
    paddingLeft: 10,
  },

  presetButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingTop: 15,
  },

  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    borderTopWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },

  tr: {
    flexDirection: 'row',
    height: 70,
  },
});
