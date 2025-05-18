import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { Pressable } from '../atoms/Pressable';

import { COLOR } from '../../constants/AppConstants';
//@ts-ignore
import { SketchPicker } from 'react-color';
import { t } from '../../i18n/config';
import { colorKit } from 'reanimated-color-picker';
interface Props {
  color?: string;
  modalVisible: boolean;
  withAlpha: boolean;
  pressSelectColorOK: (hue: number, sat: number, val: number, alpha: number) => void;
  pressSelectColorCancel: () => void;
}

export const HomeModalColorPicker = React.memo((props: Props) => {
  const { color, modalVisible, withAlpha, pressSelectColorOK, pressSelectColorCancel } = props;

  const [val, setVal] = useState({
    a: 0.5,
    h: 0,
    s: 1,
    v: 1,
  });

  useEffect(() => {
    if (modalVisible && color !== undefined) {
      const hsv = colorKit.HSV(color).object();
      setVal({ a: hsv.a, h: hsv.h, s: hsv.s / 100, v: hsv.v / 100 });
    }
  }, [modalVisible, color]);

  return (
    <Modal animationType="none" transparent={true} visible={modalVisible}>
      <Pressable style={styles.modalCenteredView} onPress={pressSelectColorCancel} disablePressedAnimation>
        <Pressable
          style={styles.modalFrameView}
          onPress={() => {}} // モーダル本体は閉じない
          disablePressedAnimation
        >
          {/* バツボタン */}
          <Pressable
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 1,
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onPress={pressSelectColorCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 24, color: COLOR.GRAY2 }}>×</Text>
          </Pressable>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('common.selectColor')}`}</Text>
            <SketchPicker
              disableAlpha={!withAlpha}
              color={val}
              onChangeComplete={(color_: any) => {
                //console.log(color);
                setVal(color_.hsv);
              }}
            />

            <View style={styles.modalButtonContainer}>
              <Pressable
                style={styles.modalOKCancelButton}
                onPress={() => {
                  const a = withAlpha ? val.a : 1;
                  pressSelectColorOK(val.h, val.s, val.v, a);
                }}
              >
                <Text>OK</Text>
              </Pressable>
              <Pressable
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={pressSelectColorCancel}
              >
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

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
