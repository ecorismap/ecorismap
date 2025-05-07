import React, { useState } from 'react';
import { View, Pressable, Modal, Text, StyleSheet } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { TextInput } from '../atoms';

interface Props {
  visible: boolean;
  pressOK: (encryptPassword: string) => void;
  pressCancel: () => void;
}

export const ProjectsModalEncryptPassword = React.memo((props: Props) => {
  const { visible, pressOK, pressCancel } = props;
  const [value, setValue] = useState('');
  const { windowWidth } = useWindow();
  const modalWidthScale = 0.7;

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

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('common.EncryptPassword')}`} </Text>

            <View style={{ flexDirection: 'row' }}>
              <TextInput
                value={value}
                placeholder={t('Account.placeholder.pin')}
                style={styles.input}
                onChangeText={setValue}
                secureTextEntry={true}
                autoComplete={'password'}
                placeholderTextColor={COLOR.GRAY3}
              />
            </View>

            <View style={styles.modalButtonContainer}>
              <Pressable
                style={styles.modalOKCancelButton}
                onPress={() => {
                  pressOK(value);
                  setValue('');
                }}
              >
                <Text>OK</Text>
              </Pressable>
              <Pressable
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={() => {
                  setValue('');
                  pressCancel();
                }}
              >
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
