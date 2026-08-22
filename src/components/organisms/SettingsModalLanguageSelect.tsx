import React from 'react';
import { View, Modal, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { AppLanguageType } from '../../types';

interface Props {
  visible: boolean;
  currentLanguage: AppLanguageType | null;
  pressSelect: (language: AppLanguageType | null) => void;
  pressCancel: () => void;
}

export const SettingsModalLanguageSelect = React.memo((props: Props) => {
  const { visible, currentLanguage, pressSelect, pressCancel } = props;

  const languageOptions: { value: AppLanguageType | null; label: string }[] = [
    { value: null, label: t('Settings.language.system') },
    { value: 'ja', label: '日本語' },
    { value: 'en', label: 'English' },
  ];
  const { windowWidth } = useWindow();
  const modalWidthScale = 0.7;

  const styles = StyleSheet.create({
    modalCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      marginTop: 10,
      padding: 10,
      width: 80,
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
    modalOptionButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      flexDirection: 'row',
      height: 48,
      justifyContent: 'flex-start',
      marginBottom: 10,
      paddingHorizontal: 15,
      width: windowWidth * modalWidthScale,
    },
    modalOptionText: {
      fontSize: 16,
      marginLeft: 10,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 15,
      textAlign: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('Settings.language.title')}`}</Text>

            {languageOptions.map((option) => (
              <Pressable
                key={option.value ?? 'system'}
                style={styles.modalOptionButton}
                onPress={() => pressSelect(option.value)}
              >
                <MaterialCommunityIcons
                  name={currentLanguage === option.value ? 'radiobox-marked' : 'radiobox-blank'}
                  size={24}
                  color={currentLanguage === option.value ? COLOR.BLUE : COLOR.GRAY4}
                />
                <Text style={styles.modalOptionText}>{option.label}</Text>
              </Pressable>
            ))}

            <Pressable style={styles.modalCancelButton} onPress={pressCancel}>
              <Text>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});
