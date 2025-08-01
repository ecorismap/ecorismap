import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR, LAYEREDIT_BTN } from '../../constants/AppConstants';
import { ColorTable } from '../organisms/FeatureStyleColorTable';
import { SimplePicker } from '../molecules/SimplePicker';
import { SingleColorSelect } from '../organisms/FeatureStyleSingleColorSelect';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import Slider from '../atoms/Slider';
import { t } from '../../i18n/config';
import { LayerEditFeatureStyleContext } from '../../contexts/LayerEditFeatureStyle';
import { TextInput } from '../atoms';
import { ScrollView } from 'react-native-gesture-handler';
import HeaderRightButton from '../molecules/HeaderRightButton';
import { HomeModalColorPicker } from '../organisms/HomeModalColorPicker';
import { CheckBox } from '../molecules/CheckBox';

export default function LayerEditFeatureStyleScreen() {
  const {
    isCustom,
    customFieldValue,
    colorStyle,
    colorTypes,
    colorTypeLabels,
    fieldValues,
    fieldLabels,
    colorRamps,
    colorRampLabels,
    layerType,
    modalVisible,
    isStyleChangeOnly,
    isEdited,
    changeCustomFieldValue,
    changeColorType,
    changeTransparency,
    changeLineWidth,
    changeFieldName,
    changeColorRamp,
    pressSelectSingleColor,
    gotoBack,
    pressSelectColorOK,
    pressSelectColorCancel,
    saveColorStyle,
  } = useContext(LayerEditFeatureStyleContext);
  const navigation = useNavigation();

  const customHeader = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 63, backgroundColor: COLOR.MAIN }}>
        <View style={{ flex: 1.5, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton
            {...props_}
            labelVisible={true}
            label={t('LayerEdit.navigation.title')}
            labelStyle={{ fontSize: 11 }}
            onPress={gotoBack}
            style={{ marginLeft: 10 }}
          />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('LayerEditFeatureStyle.navigation.title')}</Text>
        </View>
        <View style={{ flex: 1.5, justifyContent: 'flex-end', alignItems: 'center', flexDirection: 'row', paddingRight: 13 }}>
          {isStyleChangeOnly && (
            <HeaderRightButton
              name={LAYEREDIT_BTN.SAVE}
              onPress={saveColorStyle}
              backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
              disabled={!isEdited}
            />
          )}
        </View>
      </View>
    ),
    [gotoBack, isEdited, isStyleChangeOnly, saveColorStyle]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView>
        {(layerType === 'LINE' || layerType === 'POLYGON') && colorStyle.colorType !== 'INDIVIDUAL' && (
          <View style={{ paddingHorizontal: 10, borderBottomWidth: 1, borderColor: COLOR.GRAY2 }}>
            <Slider
              style={{ paddingHorizontal: 10 }}
              label={t('common.width')}
              labelColor={COLOR.BLACK}
              initialValue={colorStyle.lineWidth ?? 1.5}
              step={0.5}
              minimumValue={1}
              maximumValue={5}
              onSlidingComplete={changeLineWidth}
            />
          </View>
        )}
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
            <View style={styles.checkbox}>
              <CheckBox
                label={t('common.useOutline')}
                labelSize={14}
                labelColor="black"
                width={300}
                checked={Boolean(colorStyle.transparency)} //数値だった頃の互換性のためBoolean()を使用
                onCheck={changeTransparency}
              />
            </View>
          </View>
        )}
        {colorStyle.colorType === 'SINGLE' && (
          <SingleColorSelect value={colorStyle.color} onPressColorSelect={pressSelectSingleColor} />
        )}

        {(colorStyle.colorType === 'CATEGORIZED' || colorStyle.colorType === 'USER') && (
          <View>
            <SimplePicker
              label={t('common.fieldName')}
              value={colorStyle.fieldName}
              onValueChange={changeFieldName}
              itemValueArray={fieldValues}
              itemLabelArray={fieldLabels}
            />

            {isCustom && (
              <View style={styles.td}>
                <TextInput
                  label={t('common.customField')}
                  placeholder={'field1|field2'}
                  placeholderTextColor={COLOR.GRAY3}
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
        {colorStyle.colorType === 'INDIVIDUAL' && (
          <View>
            <SimplePicker
              label={t('common.fieldName')}
              value={colorStyle.fieldName}
              onValueChange={changeFieldName}
              itemValueArray={fieldValues}
              itemLabelArray={fieldLabels}
            />
            {isCustom && (
              <View style={styles.td}>
                <TextInput
                  label={t('common.customField')}
                  placeholder={'field1|field2'}
                  placeholderTextColor={COLOR.GRAY3}
                  value={customFieldValue}
                  onChangeText={changeCustomFieldValue}
                  style={styles.input}
                  editable={true}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <HomeModalColorPicker
        color={colorStyle.color}
        withAlpha={true}
        modalVisible={modalVisible}
        pressSelectColorOK={pressSelectColorOK}
        pressSelectColorCancel={pressSelectColorCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    flexDirection: 'column',
    height: 45,
    margin: 2,
    width: 180,
  },
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
