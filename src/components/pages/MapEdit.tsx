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
          <View style={{ width: '100%', alignItems: 'flex-start' }}>
            <CheckBox
              style={{ backgroundColor: COLOR.GRAY0, marginVertical: 10 }}
              label={t('common.addGroup')}
              width={windowWidth * (isLandscape ? 0.25 : 0.5)}
              checked={map.isGroup || false}
              onCheck={changeIsGroup}
            />
          </View>

          <TextInput
            style={styles.textInput}
            placeholder={t('common.name')}
            placeholderTextColor={COLOR.GRAY4}
            value={map.name}
            onChangeText={changeMapName}
          />

          {!map.isGroup && (
            <>
              <TextInput
                style={styles.textInput}
                placeholder=" https://example/{z}/{x}/{y}.png"
                placeholderTextColor={COLOR.GRAY4}
                value={map.url}
                onChangeText={changeMapURL}
              />

              <TextInput
                style={styles.textInput}
                placeholder={t('common.sourceName')}
                placeholderTextColor={COLOR.GRAY4}
                value={map.attribution}
                onChangeText={changeAttribution}
              />

              <Slider
                label={t('common.transparency')}
                width={windowWidth * (isLandscape ? 0.4 : 0.8)}
                initialValue={map.transparency}
                step={0.1}
                minimumValue={0}
                maximumValue={1}
                onSlidingComplete={changeTransparency}
              />

              {!map.url?.includes('pdf') && !map.isVector && (
                <Slider
                  label={t('common.fixZoom')}
                  width={windowWidth * (isLandscape ? 0.4 : 0.8)}
                  initialValue={map.overzoomThreshold || 18}
                  step={1}
                  minimumValue={0}
                  maximumValue={22}
                  onSlidingComplete={changeOverzoomThreshold}
                />
              )}

              {!map.url?.includes('pmtiles') && !map.url?.includes('.pbf') && !map.url?.includes('pdf') && (
                <View style={{ flexDirection: 'row', marginVertical: 10 }}>
                  <CheckBox
                    style={{ backgroundColor: COLOR.GRAY0 }}
                    label={t('common.highResolution')}
                    width={windowWidth * (isLandscape ? 0.4 : 0.8) * 0.5}
                    checked={map.highResolutionEnabled || false}
                    onCheck={changeHighResolutionEnabled}
                  />
                  <CheckBox
                    style={{ backgroundColor: COLOR.GRAY0 }}
                    label={t('common.Yaxis')}
                    width={windowWidth * (isLandscape ? 0.4 : 0.8) * 0.5}
                    checked={map.flipY || false}
                    onCheck={changeFlipY}
                  />
                </View>
              )}

              {map.url && (map.url.includes('pmtiles') || map.url.includes('.pbf')) && (
                <CheckBox
                  style={{ backgroundColor: COLOR.GRAY0, marginVertical: 10 }}
                  label={t('common.vectortile')}
                  width={windowWidth * (isLandscape ? 0.4 : 0.8) * 0.5}
                  checked={map.isVector ?? true}
                  onCheck={changeIsVector}
                />
              )}

              {map.url && (map.url.includes('pmtiles') || map.url.includes('.pbf')) && map.isVector && (
                <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                  <TextInput
                    style={[styles.textInput, { flex: 1, marginRight: 10 }]}
                    placeholder={t('Maps.modal.styleURL')}
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
                    color={COLOR.GRAY3}
                  />
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
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },
  textInput: {
    backgroundColor: COLOR.GRAY1,
    borderRadius: 5,
    height: 40,
    marginBottom: 10,
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
