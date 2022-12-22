import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, Modal, Text, StyleSheet, TextInput } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';

import { CheckBox } from '../molecules/CheckBox';

interface Props {
  visible: boolean;
  pressOK: (fileName: string, includePhoto: boolean) => void;
  pressCancel: () => void;
}

export const SettingsModalFileSave = React.memo((props: Props) => {
  //console.log('render ModalTileMap');
  const { visible, pressOK, pressCancel } = props;
  const [value, setValue] = useState('');
  const [includePhoto, setIncludePhoto] = useState(true);
  const { windowWidth } = useWindow();
  const modalWidthScale = 0.7;

  const onChangeText = useCallback((input) => {
    //console.log('#', input);
    //console.log('##', sanitize(input));
    setValue(input);
  }, []);

  const styles = StyleSheet.create({
    input: {
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY1,
      borderWidth: 1,
      flex: 1,
      fontSize: 16,
      height: 40,
      paddingHorizontal: 12,
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
    modalCheckbox: {
      alignItems: 'flex-end',
      height: 40,
      width: windowWidth * modalWidthScale,
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
      marginBottom: 20,
      textAlign: 'center',
    },
    text: {
      backgroundColor: COLOR.GRAY0,
      fontSize: 16,
      height: 40,
      lineHeight: 40,
      marginLeft: 3,
      paddingHorizontal: 5,
      textAlignVertical: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{t('common.fileName')} </Text>

            <View
              style={{
                flexDirection: 'row',
                width: windowWidth * modalWidthScale,
                alignItems: 'center',
              }}
            >
              <TextInput placeholder={''} value={value} style={styles.input} onChangeText={onChangeText} />
              <Text style={styles.text}>.ecorismap</Text>
            </View>
            <View style={styles.modalCheckbox}>
              <CheckBox
                style={{ backgroundColor: COLOR.WHITE }}
                label={t('common.includePhoto')}
                checked={includePhoto}
                onCheck={(checked) => setIncludePhoto(checked)}
              />
            </View>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.modalOKCancelButton} onPress={() => pressOK(value, includePhoto)}>
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={pressCancel}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
