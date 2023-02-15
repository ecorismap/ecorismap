import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { ColorTable } from '../organisms/FeatureStyleColorTable';
import { SimplePicker } from '../molecules/SimplePicker';
import { SingleColorSelect } from '../organisms/FeatureStyleSingleColorSelect';
import { FeatureStyleModalColorPicker } from '../organisms/FeatureStyleModalColorPicker';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import Slider from '../atoms/Slider';
import { t } from '../../i18n/config';
import { LayerEditFeatureStyleContext } from '../../contexts/LayerEditFeatureStyle';
import { TextInput } from '../atoms';

export default function LayerEditFeatureStyleScreen() {
  const {
    isCustom,
    customFieldValue,
    colorStyle,
    colorTypes,
    colorTypeLabels,
    fieldNames,
    colorRamps,
    colorRampLabels,
    layerType,
    changeCustomFieldValue,
    changeColorType,
    changeTransparency,
    changeFieldName,
    changeColorRamp,
    pressSelectSingleColor,
    gotoBack,
  } = useContext(LayerEditFeatureStyleContext);
  const navigation = useNavigation();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoBack} />,
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props_),
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView>
        <SimplePicker
          style={{ flex: 2, borderTopWidth: 1, borderColor: COLOR.GRAY2 }}
          label={t('common.colorType')}
          value={colorStyle.colorType}
          onValueChange={changeColorType}
          itemValueArray={colorTypes}
          itemLabelArray={colorTypeLabels}
        />
        {layerType === 'POLYGON' && (
          <View style={{ paddingHorizontal: 10, borderBottomWidth: 1, borderColor: COLOR.GRAY2 }}>
            <Slider
              style={{ paddingHorizontal: 10 }}
              label={t('common.transparency')}
              labelColor={COLOR.BLACK}
              initialValue={colorStyle.transparency}
              step={0.1}
              minimumValue={0}
              maximumValue={1}
              onSlidingComplete={changeTransparency}
            />
          </View>
        )}
        {colorStyle.colorType === 'SINGLE' && (
          <SingleColorSelect value={colorStyle.color} onPressColorSelect={pressSelectSingleColor} />
        )}

        {colorStyle.colorType === 'CATEGORIZED' && (
          <View>
            {colorStyle.colorType === 'CATEGORIZED' && (
              <SimplePicker
                label={t('common.fieldName')}
                value={colorStyle.fieldName}
                onValueChange={changeFieldName}
                itemValueArray={fieldNames}
                itemLabelArray={fieldNames}
              />
            )}
            {isCustom && (
              <View style={styles.td}>
                <TextInput
                  label={t('common.customField')}
                  value={customFieldValue}
                  onChangeText={changeCustomFieldValue}
                  style={styles.input}
                  editable={true}
                />
              </View>
            )}
            <SimplePicker
              label={t('common.colorLamp')}
              value={colorStyle.colorRamp}
              onValueChange={changeColorRamp}
              itemValueArray={colorRamps}
              itemLabelArray={colorRampLabels}
            />
            <ColorTable />
          </View>
        )}
      </ScrollView>

      <FeatureStyleModalColorPicker />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
    paddingLeft: 10,
  },

  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
});
