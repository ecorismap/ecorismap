import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
//@ts-ignore
import { SketchPicker } from 'react-color';
import { t } from '../../i18n/config';
import { LayerEditFeatureStyleContext } from '../../contexts/LayerEditFeatureStyle';

export const FeatureStyleModalColorPicker = () => {
  const { modalVisible, pressSelectColorOK, pressSelectColorCancel } = useContext(LayerEditFeatureStyleContext);
  const [val, setVal] = useState({
    a: 0.74,
    h: 161.2987012987013,
    s: 0.6695050558807878,
    v: 0.45096,
  });

  return (
    <Modal animationType="none" transparent={true} visible={modalVisible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{t('common.selectColor')}</Text>
            <SketchPicker
              disableAlpha={true}
              color={val}
              onChangeComplete={(color: any) => {
                //console.log(color);
                setVal(color.hsv);
              }}
            />

            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.modalOKCancelButton}
                onPress={() => pressSelectColorOK(val.h, val.s, val.v)}
              >
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={pressSelectColorCancel}
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
    margin: 10,
    padding: 10,
    width: 80,
  },
  modalTitle: {
    fontSize: 20,
    textAlign: 'center',
  },
});
