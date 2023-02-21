import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { colorKit } from 'reanimated-color-picker';
import { COLOR } from '../../constants/AppConstants';

import ColorPicker, { Panel2, BrightnessSlider, Swatches } from 'reanimated-color-picker';

import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';
import { LayerEditFeatureStyleContext } from '../../contexts/LayerEditFeatureStyle';

const customSwatches = [
  COLOR.BLACK,
  COLOR.WHITE,
  COLOR.BLUE,
  COLOR.RED,
  COLOR.GREEN,
  COLOR.YELLOW,
  COLOR.ORANGE,
  COLOR.PALERED,
  COLOR.GRAY2,
  COLOR.GRAY3,
];

export const FeatureStyleModalColorPicker = () => {
  const { modalVisible, pressSelectColorOK, pressSelectColorCancel } = useContext(LayerEditFeatureStyleContext);

  const { windowWidth } = useWindow();
  const [hue, setHue] = useState(0.5);
  const [sat, setSat] = useState(0.5);
  const [val, setVal] = useState(1);

  const onSelectColor = ({ hex }: { hex: string }) => {
    // do something with the selected color.
    const hsv = colorKit.HSV(hex).object();
    setHue(hsv.h);
    setSat(hsv.s / 100);
    setVal(hsv.v / 100);
    //console.log(hsv.h, hsv.s / 100, hsv.v / 100);
  };

  return (
    <Modal animationType="none" transparent={true} visible={modalVisible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={[styles.modalContents, { width: windowWidth * 0.6, height: 330 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectColor')}`} </Text>
            <ColorPicker
              value={'red'}
              sliderThickness={20}
              thumbSize={25}
              thumbShape="rect"
              onComplete={onSelectColor}
              style={{ width: '75%', justifyContent: 'center' }}
            >
              <View style={styles.panelBrightnessContainer}>
                <Panel2 style={[{ flex: 1, marginEnd: 20 }, styles.shadow]} />
                <BrightnessSlider style={[{ height: '100%' }, styles.shadow]} vertical reverse />
              </View>
              <Swatches
                style={{ marginTop: 0, justifyContent: 'space-between' }}
                swatchStyle={styles.swatchStyle}
                colors={customSwatches}
              />
            </ColorPicker>

            <View style={[styles.modalButtonContainer, { width: windowWidth * 0.6 }]}>
              <TouchableOpacity style={styles.modalOKCancelButton} onPress={() => pressSelectColorOK(hue, sat, val)}>
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={() => pressSelectColorCancel()}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 10,
  },
  modalCenteredView: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  modalContents: {
    alignItems: 'center',
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
  modalTitle: {
    fontSize: 20,
    textAlign: 'center',
  },
  panelBrightnessContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginBottom: 20,
  },
  shadow: {
    elevation: 5,
    shadowColor: COLOR.BLACK,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,

    shadowRadius: 3.84,
  },
  swatchStyle: {
    borderRadius: 5,
    height: 20,
    width: 20,
  },
});
