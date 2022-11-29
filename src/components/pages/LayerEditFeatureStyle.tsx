import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { ColorTable } from '../organisms/FeatureStyleColorTable';
import { SimplePicker } from '../molecules/SimplePicker';
import { SingleColorSelect } from '../organisms/FeatureStyleSingleColorSelect';
import { FeatureStyleModalColorPicker } from '../organisms/FeatureStyleModalColorPicker';
import { ColorRampType, ColorStyle, ColorTypesType, FeatureType } from '../../types';
import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import Slider from '../atoms/Slider';
import { t } from '../../i18n/config';

interface Props {
  colorStyle: ColorStyle;
  colorTypes: ColorTypesType[];
  colorTypeLabels: string[];
  fieldNames: string[];
  colorRamps: ColorRampType[];
  colorRampLabels: string[];
  layerType: FeatureType;
  modalVisible: boolean;
  changeColorType: (itemValue: ItemValue, itemIndex: number) => void;
  changeTransparency: (value: number) => void;
  changeFieldName: (itemValue: ItemValue, itemIndex: number) => void;
  changeColorRamp: (itemValue: ItemValue, itemIndex: number) => void;
  changeValue: (index: number, value: string) => void;
  pressDeleteValue: (id: number) => void;
  pressAddValue: () => void;
  pressReloadValue: () => void;
  pressSelectSingleColor: () => void;
  pressSelectValueColor: (index: number) => void;
  pressSelectColorOK: (hue: number, sat: number, val: number) => void;
  pressSelectColorCancel: () => void;
  gotoBack: () => void;
}

export default function LayerEditFeatureStyleScreen(props: Props) {
  const {
    colorStyle,
    colorTypes,
    colorTypeLabels,
    fieldNames,
    colorRamps,
    colorRampLabels,
    layerType,
    modalVisible,
    changeColorType,
    changeTransparency,
    changeFieldName,
    changeColorRamp,
    changeValue,
    pressDeleteValue,
    pressAddValue,
    pressReloadValue,
    pressSelectSingleColor,
    pressSelectValueColor,
    pressSelectColorOK,
    pressSelectColorCancel,
    gotoBack,
  } = props;
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

        {(colorStyle.colorType === 'CATEGORIZED' || colorStyle.colorType === 'USER') && (
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
            <SimplePicker
              label={t('common.colorLamp')}
              value={colorStyle.colorRamp}
              onValueChange={changeColorRamp}
              itemValueArray={colorRamps}
              itemLabelArray={colorRampLabels}
            />
            <ColorTable
              data={colorStyle.colorList}
              changeColorValue={changeValue}
              selectValueColor={pressSelectValueColor}
              deleteValueColor={pressDeleteValue}
              addColor={pressAddValue}
              reloadFieldValue={pressReloadValue}
            />
          </View>
        )}
      </ScrollView>

      <FeatureStyleModalColorPicker
        visible={modalVisible}
        pressOK={pressSelectColorOK}
        pressCancel={pressSelectColorCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
