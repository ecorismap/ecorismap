import React, { useMemo } from 'react';
import { View, Modal, Text, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

export type StorageSelectChoice = 'device' | 'share' | 'drive' | 'local';

interface Props {
  visible: boolean;
  mode: 'save' | 'open';
  onSelect: (choice: StorageSelectChoice) => void;
  onCancel: () => void;
}

type Option = {
  choice: StorageSelectChoice;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  description: string;
};

/**
 * データの保存先/読み込み元を選択するモーダル。
 * 保存時はプラットフォームごとに選択肢を出し分ける:
 * - Android: デバイスに保存 / 他のアプリで共有 / Google Drive
 * - iOS: 共有（"ファイル"に保存を含む） / Google Drive（Downloadフォルダへ直接書き込めないため）
 * - Web: デバイスに保存（ダウンロード） / Google Drive
 */
export const SettingsModalStorageSelect = React.memo((props: Props) => {
  const { visible, mode, onSelect, onCancel } = props;

  const options: Option[] = useMemo(() => {
    if (mode === 'open') {
      return [
        {
          choice: 'local',
          icon: 'cellphone',
          label: t('Settings.storage.local'),
          description: t('Settings.storage.localDescription'),
        },
        {
          choice: 'drive',
          icon: 'google-drive',
          label: t('Settings.storage.drive'),
          description: t('Settings.storage.driveLoadDescription'),
        },
      ];
    }
    const driveOption: Option = {
      choice: 'drive',
      icon: 'google-drive',
      label: t('Settings.storage.drive'),
      description: t('Settings.storage.driveSaveDescription'),
    };
    if (Platform.OS === 'android') {
      return [
        {
          choice: 'device',
          icon: 'folder-download-outline',
          label: t('Settings.storage.device'),
          description: t('Settings.storage.deviceDescription'),
        },
        {
          choice: 'share',
          icon: 'share-variant-outline',
          label: t('Settings.storage.share'),
          description: t('Settings.storage.shareDescription'),
        },
        driveOption,
      ];
    }
    if (Platform.OS === 'ios') {
      return [
        {
          choice: 'share',
          icon: 'share-variant-outline',
          label: t('Settings.storage.shareIOS'),
          description: t('Settings.storage.shareIOSDescription'),
        },
        driveOption,
      ];
    }
    return [
      {
        choice: 'device',
        icon: 'folder-download-outline',
        label: t('Settings.storage.device'),
        description: t('Settings.storage.deviceDescriptionWeb'),
      },
      driveOption,
    ];
  }, [mode]);

  return (
    <Modal animationType="fade" visible={visible} transparent={true} onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel} disablePressedAnimation>
        <Pressable style={styles.modalCard} onPress={() => null} disablePressedAnimation>
          <View style={styles.headerIconCircle}>
            <MaterialCommunityIcons
              name={mode === 'save' ? 'content-save-outline' : 'folder-open-outline'}
              size={28}
              color={COLOR.BLUE}
            />
          </View>
          <Text style={styles.title}>
            {mode === 'save' ? t('Settings.storage.saveTitle') : t('Settings.storage.loadTitle')}
          </Text>

          {options.map((option) => (
            <Pressable key={option.choice} style={styles.optionButton} onPress={() => onSelect(option.choice)}>
              <View style={styles.optionIconCircle}>
                <MaterialCommunityIcons name={option.icon} size={24} color={COLOR.BLUE} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={22} color={COLOR.GRAY2} />
            </Pressable>
          ))}

          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  cancelButton: {
    alignItems: 'center',
    borderRadius: 12,
    marginTop: 4,
    paddingVertical: 14,
    width: '100%',
  },
  cancelButtonText: {
    color: COLOR.GRAY3,
    fontSize: 16,
    fontWeight: '600',
  },
  headerIconCircle: {
    alignItems: 'center',
    backgroundColor: COLOR.PALEBLUE,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginBottom: 12,
    width: 56,
  },
  modalCard: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderRadius: 20,
    elevation: 5,
    maxWidth: 360,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    width: '85%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: COLOR.MODAL_OVERLAY,
    flex: 1,
    justifyContent: 'center',
  },
  optionButton: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: '100%',
  },
  optionDescription: {
    color: COLOR.GRAY3,
    fontSize: 12,
    marginTop: 2,
  },
  optionIconCircle: {
    alignItems: 'center',
    backgroundColor: COLOR.PALEBLUE,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 12,
    width: 40,
  },
  optionLabel: {
    color: COLOR.BLACK,
    fontSize: 15,
    fontWeight: '600',
  },
  optionTextContainer: {
    flex: 1,
  },
  title: {
    color: COLOR.BLACK,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
});
