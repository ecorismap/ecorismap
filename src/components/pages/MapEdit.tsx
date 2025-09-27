import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Text, TextInput, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { MapEditContext } from '../../contexts/MapEdit';
import { COLOR, MAPS_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { t } from '../../i18n/config';
import { CheckBox } from '../molecules/CheckBox';
import Slider from '../atoms/Slider';
import { useWindow } from '../../hooks/useWindow';

export default function MapEditScreen() {
  const {
    map,
    isEdited,
    isNewMap,
    pressSaveMap,
    pressDeleteMap,
    pressExportMap,
    pressImportStyle,
    gotoBack,
    changeMapName,
    changeMapURL,
    changeStyleURL,
    changeIsVector,
    changeIsGroup,
    changeAttribution,
    changeTransparency,
    changeOverzoomThreshold,
    changeHighResolutionEnabled,
    changeFlipY,
  } = useContext(MapEditContext);

  const navigation = useNavigation();
  const { windowWidth, isLandscape } = useWindow();

  const customHeader = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 63,
          backgroundColor: COLOR.MAIN,
        }}
      >
        <View style={{ flex: 1.5, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton
            {...props_}
            label={t('Maps.navigation.title')}
            labelStyle={{ fontSize: 11 }}
            onPress={gotoBack}
            style={{ marginLeft: 10 }}
          />
        </View>
        <View style={{ flex: 2, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('MapEdit.navigation.title')}</Text>
        </View>
        <View
          style={{
            flex: 1.5,
            justifyContent: 'flex-end',
            alignItems: 'center',
            flexDirection: 'row',
            paddingRight: 13,
          }}
        >
          <Button
            name={MAPS_BTN.SAVE}
            onPress={pressSaveMap}
            backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
            disabled={!isEdited}
            labelText={t('MapEdit.label.save')}
          />
        </View>
      </View>
    ),
    [gotoBack, isEdited, pressSaveMap]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>
        <View style={styles.content}>
          <View style={{ width: '101%', alignItems: 'flex-start' }}>
            <CheckBox
              style={{ backgroundColor: COLOR.GRAY0, marginVertical: 10 }}
              label={t('common.addGroup')}
              labelSize={13}
              checked={map.isGroup || false}
              onCheck={changeIsGroup}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{t('common.name')}</Text>
            <TextInput
              style={styles.textInput}
              placeholderTextColor={COLOR.GRAY4}
              value={map.name}
              onChangeText={changeMapName}
            />
          </View>

          {!map.isGroup && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>URL</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder=" https://example/{z}/{x}/{y}.png"
                  placeholderTextColor={COLOR.GRAY4}
                  value={map.url}
                  onChangeText={changeMapURL}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>{t('common.sourceName')}</Text>
                <TextInput
                  style={styles.textInput}
                  placeholderTextColor={COLOR.GRAY4}
                  value={map.attribution}
                  onChangeText={changeAttribution}
                />
              </View>

              <Slider
                label={t('common.transparency')}
                labelColor={COLOR.GRAY4}
                style={{ marginTop: 10 }}
                width={windowWidth * (isLandscape ? 0.45 : 0.88)}
                initialValue={map.transparency}
                step={0.1}
                minimumValue={0}
                maximumValue={1}
                onSlidingComplete={changeTransparency}
              />

              {!map.url?.includes('pdf') && (
                <Slider
                  label={t('common.fixZoom')}
                  labelColor={COLOR.GRAY4}
                  width={windowWidth * (isLandscape ? 0.45 : 0.88)}
                  initialValue={map.overzoomThreshold || 18}
                  step={1}
                  minimumValue={0}
                  maximumValue={22}
                  onSlidingComplete={changeOverzoomThreshold}
                />
              )}

              {!map.url?.includes('pmtiles') && !map.url?.includes('.pbf') && !map.url?.includes('pdf') && (
                <>
                  <View style={{ width: '101%', alignItems: 'flex-start', marginTop: 10 }}>
                    <CheckBox
                      style={{ backgroundColor: COLOR.GRAY0 }}
                      labelSize={13}
                      width={windowWidth * (isLandscape ? 0.45 : 0.85)}
                      label={`${t('common.highResolution')}`}
                      checked={map.highResolutionEnabled || false}
                      onCheck={changeHighResolutionEnabled}
                    />
                  </View>
                  <View style={{ width: '101%', alignItems: 'flex-start', marginTop: 10 }}>
                    <CheckBox
                      style={{ backgroundColor: COLOR.GRAY0 }}
                      labelSize={13}
                      width={windowWidth * (isLandscape ? 0.45 : 0.85)}
                      label={`${t('common.Yaxis')}`}
                      checked={map.flipY || false}
                      onCheck={changeFlipY}
                    />
                  </View>
                </>
              )}

              {map.url?.includes('pmtiles') && (
                <View style={{ width: '100%', alignItems: 'flex-start' }}>
                  <CheckBox
                    style={{ backgroundColor: COLOR.GRAY0, marginVertical: 10 }}
                    label={t('common.vectortile')}
                    checked={map.isVector ? true : false}
                    onCheck={changeIsVector}
                  />
                </View>
              )}

              {((map.url?.includes('pmtiles') && map.isVector) || map.url?.includes('.pbf')) && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>{t('Maps.modal.styleURL')}</Text>
                  <View style={{ flexDirection: 'row', width: '100%' }}>
                    <TextInput
                      style={[styles.textInput, { flex: 1, marginRight: 10 }]}
                      placeholderTextColor={COLOR.GRAY4}
                      value={map.styleURL || ''}
                      onChangeText={changeStyleURL}
                    />
                    <Button
                      name={'folder-open'}
                      onPress={pressImportStyle}
                      backgroundColor={COLOR.GRAY2}
                      size={20}
                      borderRadius={5}
                      color={COLOR.GRAY4}
                    />
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {!isNewMap && !map.isGroup && (
        <View style={styles.buttonContainer}>
          <Button
            name="briefcase-download"
            onPress={pressExportMap}
            backgroundColor={COLOR.BLUE}
            labelText={t('Maps.label.export')}
          />
          <Button
            name="delete"
            onPress={pressDeleteMap}
            backgroundColor={COLOR.DARKRED}
            labelText={t('common.delete')}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR.GRAY0,
    justifyContent: 'flex-end',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 20,
    alignItems: 'center',
  },
  inputContainer: {
    width: '99%',
    marginVertical: 5,
  },
  inputLabel: {
    fontSize: 14,
    color: COLOR.GRAY4,
    marginBottom: 5,
    marginLeft: 3,
  },
  textInput: {
    backgroundColor: COLOR.GRAY1,
    borderRadius: 5,
    height: 40,
    paddingHorizontal: 10,
    width: '100%',
  },
  buttonContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 20,
  },
});
