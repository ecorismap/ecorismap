import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
//@ts-ignore
import HsvColorPicker from 'react-native-hsv-color-picker';
import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';

interface Props {
  visible: boolean;
  pressOK: (hue: number, sat: number, val: number) => void;
  pressCancel: () => void;
}

export const FeatureStyleModalColorPicker = (props: Props) => {
  const { windowWidth } = useWindow();
  const [hue, setHue] = useState(0.5);
  const [sat, setSat] = useState(0.5);
  const [val, setVal] = useState(1);

  const { visible, pressOK, pressCancel } = props;

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={[styles.modalContents, { width: windowWidth * 0.6 }]}>
            <Text style={styles.modalTitle}>{t('common.selectColor')} </Text>
            <HsvColorPicker
              huePickerHue={hue}
              // eslint-disable-next-line @typescript-eslint/no-shadow
              onHuePickerDragMove={({ hue }: any) => {
                setHue(hue);
              }}
              // eslint-disable-next-line @typescript-eslint/no-shadow
              onHuePickerPress={({ hue }: any) => {
                setHue(hue);
              }}
              satValPickerHue={hue}
              satValPickerSaturation={sat}
              satValPickerValue={val}
              onSatValPickerDragMove={({ saturation, value }: any) => {
                setSat(saturation);
                setVal(value);
              }}
              onSatValPickerPress={({ saturation, value }: any) => {
                setSat(saturation);
                setVal(value);
              }}
            />
            <View style={[styles.modalButtonContainer, { width: windowWidth * 0.6 }]}>
              <TouchableOpacity style={styles.modalOKCancelButton} onPress={() => pressOK(hue, sat, val)}>
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={() => pressCancel()}
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
});
