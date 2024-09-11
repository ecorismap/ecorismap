import React, { useState, useEffect, useContext } from 'react';
import { View, TextInput, TouchableOpacity, Modal, Text, StyleSheet } from 'react-native';

import { COLOR, NAV_BTN } from '../../constants/AppConstants';
import Slider from '../atoms/Slider';
import { CheckBox } from '../molecules/CheckBox';
import { formattedInputs } from '../../utils/Format';
import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';
import { MapsContext } from '../../contexts/Maps';
import { SmallButton } from '../atoms';
import { ScrollView } from 'react-native-gesture-handler';

export const MapModalTileMap = React.memo(() => {
  //console.log('render ModalTileMap');
  const {
    editedMap: data,
    isMapEditorOpen: visible,
    pressDeleteMap,
    pressEditMapOK,
    pressEditMapCancel,
    pressImportStyle,
  } = useContext(MapsContext);

  const [tileName, setTileName] = useState('');
  const [tileURL, setTileURL] = useState('');
  const [styleURL, setStyleURL] = useState('');
  const [isVector, setIsVector] = useState(true);
  const [isGroup, setIsGroup] = useState(false);
  const [attribution, setAttribution] = useState('');
  const [transparency, setTransparency] = useState(0);
  const [minimumZ, setMinimumZ] = useState(0);
  const [maximumZ, setMaximumZ] = useState(22);
  const [overzoomThreshold, setOverzoomThreshold] = useState(18);
  const [highResolutionEnabled, setHighResolutionEnabled] = useState(true);
  const [flipY, setFlipY] = useState(false);

  const { windowWidth, windowHeight } = useWindow();
  const modalWidthScale = 0.7;

  useEffect(() => {
    setTileName(data.name);
    setTileURL(data.url);
    setStyleURL(data.styleURL ?? '');
    setIsVector(data.isVector ?? true);
    setIsGroup(data.isGroup ?? false);
    setAttribution(data.attribution);
    setTransparency(data.transparency);
    setMinimumZ(data.minimumZ);
    setMaximumZ(data.maximumZ);
    setOverzoomThreshold(data.overzoomThreshold);
    setHighResolutionEnabled(data.highResolutionEnabled);
    setFlipY(data.flipY);
  }, [data]);

  const styles = StyleSheet.create({
    modalButtonContainer: {
      flexDirection: 'row',

      justifyContent: 'space-evenly',
      marginTop: 10,
      width: windowWidth * modalWidthScale,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
      height: windowHeight * 0.55,
      width: windowWidth * modalWidthScale,
    },
    modalFrameView: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderRadius: 20,
      elevation: 5,
      margin: 0,
      paddingHorizontal: 35,
      paddingVertical: 25,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    modalHeaderButton: {
      position: 'absolute',
      right: -20,
      top: -10,
    },
    modalOKCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      padding: 10,
      width: 80,
    },
    modalTextInput: {
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      height: 40,
      marginBottom: 10,
      paddingHorizontal: 5,
      width: windowWidth * modalWidthScale,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 10,
      textAlign: 'center',
    },
  });

  const checkInputs = () => {
    if (isGroup) return tileName !== '';
    const { isOK } = formattedInputs(tileURL, 'url');
    return isOK;
  };

  const tileMap = () => {
    return {
      ...data,
      name: tileName,
      url: tileURL,
      styleURL: styleURL,
      isVector: isVector,
      attribution: attribution,
      transparency: transparency,
      overzoomThreshold: overzoomThreshold,
      highResolutionEnabled: highResolutionEnabled,
      minimumZ: minimumZ,
      maximumZ: maximumZ,
      flipY: flipY,
      isGroup: isGroup,
    };
  };
  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('Maps.modal.title')}`}</Text>
            <View style={styles.modalHeaderButton}>
              <SmallButton name={NAV_BTN.CLOSE} onPress={pressEditMapCancel} backgroundColor={COLOR.GRAY1} />
            </View>
            <ScrollView>
              <CheckBox
                style={{ backgroundColor: COLOR.WHITE }}
                label={t('common.addGroup')}
                width={windowWidth * modalWidthScale * 0.5}
                checked={isGroup}
                onCheck={(checked) => setIsGroup(checked)}
              />
              <TextInput
                style={styles.modalTextInput}
                placeholder={t('common.name')}
                placeholderTextColor={COLOR.GRAY4}
                value={tileName}
                onChangeText={(text) => setTileName(text)}
              />

              {!isGroup && (
                <>
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder=" https://example/{z}/{x}/{y}.png"
                    placeholderTextColor={COLOR.GRAY4}
                    value={tileURL}
                    onChangeText={(text) => setTileURL(text)}
                  />
                  <TextInput
                    style={styles.modalTextInput}
                    placeholder={t('common.sourceName')}
                    placeholderTextColor={COLOR.GRAY4}
                    value={attribution}
                    onChangeText={(text) => setAttribution(text)}
                  />
                  <Slider
                    label={t('common.transparency')}
                    width={windowWidth * modalWidthScale}
                    initialValue={transparency}
                    step={0.1}
                    minimumValue={0}
                    maximumValue={1}
                    onSlidingComplete={(value) => setTransparency(value)}
                  />
                  {!tileURL?.includes('pdf') && !(tileURL?.includes('pmtiles') && isVector) && (
                    <Slider
                      label={t('common.fixZoom')}
                      width={windowWidth * modalWidthScale}
                      initialValue={overzoomThreshold!}
                      step={1}
                      minimumValue={0}
                      maximumValue={22}
                      onSlidingComplete={(value) => setOverzoomThreshold(value)}
                    />
                  )}
                  {!tileURL?.includes('pmtiles') && !tileURL?.includes('.pbf') && !tileURL?.includes('pdf') && (
                    <View style={{ flexDirection: 'row' }}>
                      <CheckBox
                        style={{ backgroundColor: COLOR.WHITE }}
                        label={t('common.highResolution')}
                        width={windowWidth * modalWidthScale * 0.5}
                        checked={highResolutionEnabled!}
                        onCheck={(checked) => setHighResolutionEnabled(checked)}
                      />
                      <CheckBox
                        style={{ backgroundColor: COLOR.WHITE }}
                        label={t('common.Yaxis')}
                        width={windowWidth * modalWidthScale * 0.5}
                        checked={flipY!}
                        onCheck={(checked) => setFlipY(checked)}
                      />
                    </View>
                  )}
                  {tileURL && (tileURL.includes('pmtiles') || tileURL.includes('.pbf')) && (
                    <CheckBox
                      style={{ backgroundColor: COLOR.WHITE }}
                      label={t('common.vectortile')}
                      width={windowWidth * modalWidthScale * 0.5}
                      checked={isVector}
                      onCheck={(checked) => setIsVector(checked)}
                    />
                  )}
                  {tileURL && (tileURL.includes('pmtiles') || tileURL.includes('.pbf')) && isVector && (
                    <View style={{ flexDirection: 'row' }}>
                      <TextInput
                        style={[styles.modalTextInput, { width: windowWidth * modalWidthScale - 65 }]}
                        placeholder="Style URL (json)"
                        placeholderTextColor={COLOR.GRAY4}
                        value={styleURL}
                        onChangeText={(text) => setStyleURL(text)}
                      />
                      <View
                        style={{
                          alignItems: 'center',
                          flex: 1,
                          flexDirection: 'row',
                          justifyContent: 'flex-start',
                          paddingHorizontal: 10,
                          paddingVertical: 0,
                          marginBottom: 10,
                        }}
                      >
                        <SmallButton
                          name={'folder-open'}
                          onPress={() => pressImportStyle(tileMap())}
                          backgroundColor={COLOR.GRAY3}
                          size={22}
                          borderRadius={5}
                        />
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.modalOKCancelButton}
                onPress={() => (checkInputs() ? pressEditMapOK(tileMap()) : null)}
              >
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={pressEditMapCancel}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.DARKRED }]}
                onPress={() => pressDeleteMap(tileMap())}
              >
                <Text style={{ color: COLOR.WHITE }}>{`${t('common.delete')}`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
