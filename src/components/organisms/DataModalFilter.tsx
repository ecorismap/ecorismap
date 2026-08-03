import React, { useState, useEffect } from 'react';
import { View, Modal, Text, StyleSheet } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { TextInput } from '../atoms';

interface Props {
  //絞り込む列の名前。空文字なら全フィールド横断
  fieldName: string;
  defaultValue: string;
  visible: boolean;
  //空欄でOKすると解除になるため、専用の解除ボタンは持たない
  pressOK: (value: string) => void;
  pressCancel: () => void;
}

export const DataModalFilter = React.memo((props: Props) => {
  const { fieldName, defaultValue, visible, pressOK, pressCancel } = props;
  const [value, setValue] = useState('');
  const { windowWidth } = useWindow();
  const modalWidthScale = 0.7;

  useEffect(() => {
    if (visible) setValue(defaultValue);
  }, [defaultValue, visible]);

  const styles = StyleSheet.create({
    input: {
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY1,
      borderWidth: 1,
      fontSize: 16,
      height: 40,
      paddingHorizontal: 12,
      width: windowWidth * modalWidthScale,
    },
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
      marginBottom: 10,
      textAlign: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('Data.label.filter')}: ${fieldName}`}</Text>

            <View style={{ flexDirection: 'row' }}>
              <TextInput
                placeholder={t('Data.label.filter')}
                value={value}
                style={styles.input}
                onChangeText={setValue}
                autoFocus
              />
            </View>

            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalOKCancelButton} onPress={() => pressOK(value)}>
                <Text>OK</Text>
              </Pressable>
              <Pressable style={styles.modalOKCancelButton} onPress={pressCancel}>
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
