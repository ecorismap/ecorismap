import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import {
  StorageInfo,
  exportAsyncStorageData,
  formatDataSize,
  markMigrationExported,
  skipMigration,
  postponeMigration,
} from '../../utils/storageMigration';
import { t } from '../../i18n/config';
import { useDialogPresence } from '../molecules/StyledDialog';

/**
 * 確認・完了・エラーの表示は、別のダイアログを重ねずにこのカードの中で切り替える
 * （StyledDialogはModalなので、このModalと同時には出せない）。
 * 起動直後は利用規約・更新情報のModalも同時に出ようとする。iOSはModalを2枚同時に出せず、出せなかった方が
 * 見えないまま残って画面の操作を一切受け付けなくなるので、ダイアログ相当として登録して相手を引っ込ませる。
 */
type Step = 'choose' | 'exporting' | 'exported' | 'exportError' | 'skipConfirm' | 'postponed';

interface StorageMigrationDialogProps {
  visible: boolean;
  storageInfo: StorageInfo;
  onClose: () => void;
  onMigrationComplete: () => void;
}

export const StorageMigrationDialog: React.FC<StorageMigrationDialogProps> = ({
  visible,
  storageInfo,
  onClose,
  onMigrationComplete,
}) => {
  const shown = useDialogPresence('storage-migration', visible);
  const [step, setStep] = useState<Step>('choose');
  const [errorMessage, setErrorMessage] = useState('');

  const handleExport = async () => {
    setStep('exporting');
    try {
      // エクスポートのみ実行（自動移行はしない）
      const backupPath = await exportAsyncStorageData();
      if (!backupPath) throw new Error(t('storageMigration.exportFailed'));
      // 完了の表示を閉じる前にアプリを終了しても、次回また確認されないよう先に記録する
      markMigrationExported();
      setStep('exported');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setStep('exportError');
    }
  };

  const handlePostpone = () => {
    postponeMigration();
    setStep('postponed');
  };

  const handleSkip = () => {
    skipMigration();
    onClose();
  };

  const finishExport = () => {
    onMigrationComplete();
    onClose();
  };

  // Androidの戻るボタンは、各段階の「閉じる・戻る」に当たる操作にする
  const handleRequestClose = () => {
    if (step === 'choose') handlePostpone();
    else if (step === 'skipConfirm' || step === 'exportError') setStep('choose');
    else if (step === 'exported') finishExport();
    else if (step === 'postponed') onClose();
  };

  const renderMessage = (title: string, message: string, buttons: React.ReactNode) => (
    <>
      <View style={styles.header}>
        <MaterialIcons name="storage" size={32} color={COLOR.MAIN} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
      </View>
      <View style={styles.buttonSection}>{buttons}</View>
    </>
  );

  const okButton = (onPress: () => void) => (
    <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={onPress}>
      <Text style={styles.primaryButtonText}>{t('storageMigration.okButton')}</Text>
    </TouchableOpacity>
  );

  const renderBody = () => {
    switch (step) {
      case 'exported':
        return renderMessage(
          t('storageMigration.exportCompleteTitle'),
          t('storageMigration.exportCompleteMessage'),
          okButton(finishExport)
        );
      case 'exportError':
        return renderMessage(
          t('storageMigration.exportErrorTitle'),
          t('storageMigration.exportError', { error: errorMessage }),
          okButton(() => setStep('choose'))
        );
      case 'postponed':
        return renderMessage(
          t('storageMigration.postponeTitle'),
          t('storageMigration.postponeMessage'),
          okButton(onClose)
        );
      case 'skipConfirm':
        return renderMessage(
          t('storageMigration.skipConfirmTitle'),
          t('storageMigration.skipConfirmMessage'),
          <>
            <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleSkip}>
              <Text style={styles.primaryButtonText}>{t('storageMigration.skipConfirmButton')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setStep('choose')}>
              <Text style={styles.secondaryButtonText}>{t('storageMigration.cancelButton')}</Text>
            </TouchableOpacity>
          </>
        );
      default:
        return (
          <>
            <View style={styles.header}>
              <MaterialIcons name="storage" size={32} color={COLOR.MAIN} />
              <Text style={styles.title}>{t('storageMigration.title')}</Text>
            </View>

            <View style={styles.content}>
              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>{t('storageMigration.dataSize')}</Text>
                <Text style={styles.infoValue}>{formatDataSize(storageInfo.dataSize)}</Text>
              </View>

              <Text style={styles.description}>{t('storageMigration.description')}</Text>

              <View style={styles.infoBox}>
                <MaterialIcons name="info" size={20} color={COLOR.BLUE} />
                <Text style={styles.infoText}>{t('storageMigration.infoText')}</Text>
              </View>

              {step === 'exporting' && (
                <View style={styles.progressSection}>
                  <ActivityIndicator size="large" color={COLOR.MAIN} />
                  <Text style={styles.progressText}>{t('storageMigration.exportProgress')}</Text>
                </View>
              )}
            </View>

            {step === 'choose' && (
              <View style={styles.buttonSection}>
                <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleExport}>
                  <Text style={styles.primaryButtonText}>{t('storageMigration.exportButton')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handlePostpone}>
                  <Text style={styles.secondaryButtonText}>{t('storageMigration.postponeButton')}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.button, styles.skipButton]} onPress={() => setStep('skipConfirm')}>
                  <Text style={styles.skipButtonText}>{t('storageMigration.skipButton')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        );
    }
  };

  return (
    <Modal visible={shown} transparent animationType="fade" onRequestClose={handleRequestClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>{renderBody()}</View>
      </View>
    </Modal>
  );
};

const COLORS = {
  overlay: 'rgba(0, 0, 0, 0.5)',
  white: 'white',
  text: '#333',
  textSecondary: '#666',
  textTertiary: '#999',
  background: '#f0f0f0',
  border: '#ddd',
  transparent: 'transparent',
  infoBg: '#E3F2FD',
  infoText: '#1565C0',
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    color: COLORS.text,
  },
  content: {
    marginBottom: 20,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingVertical: 5,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 15,
    marginBottom: 20,
    lineHeight: 20,
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  progressSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  progressText: {
    marginTop: 15,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  buttonSection: {
    gap: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: COLOR.BLUE,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  dangerButton: {
    backgroundColor: COLOR.RED,
  },
  secondaryButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 15,
  },
  skipButton: {
    backgroundColor: COLORS.transparent,
  },
  skipButtonText: {
    color: COLORS.textTertiary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  infoBox: {
    backgroundColor: COLORS.infoBg,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    color: COLORS.infoText,
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
});
