import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { StorageInfo, formatDataSize, skipMigration, postponeMigration } from '../../utils/storageMigration';
import { t } from '../../i18n/config';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');

  const handleMigrate = async () => {
    performMigration();
  };

  const performMigration = async () => {
    setIsProcessing(true);
    setProgress(t('storageMigration.exportProgress'));

    try {
      // エクスポートのみ実行（自動移行はしない）
      const { exportAsyncStorageData } = require('../../utils/storageMigration');
      const backupPath = await exportAsyncStorageData();

      if (backupPath) {
        setProgress(t('storageMigration.exportComplete'));
        
        Alert.alert(
          t('storageMigration.exportCompleteTitle'),
          t('storageMigration.exportCompleteMessage'),
          [
            {
              text: t('storageMigration.okButton'),
              onPress: () => {
                // エクスポート後は移行完了フラグを設定
                const { storage } = require('../../utils/mmkvStorage');
                storage.set('migration_completed_v2', 'true');
                onMigrationComplete();
                onClose();
              },
            },
          ]
        );
      } else {
        throw new Error(t('storageMigration.exportFailed'));
      }
    } catch (error) {
      setProgress('');
      Alert.alert(
        t('storageMigration.exportErrorTitle'),
        t('storageMigration.exportError', { error: error instanceof Error ? error.message : 'Unknown error' }),
        [{ text: t('storageMigration.okButton') }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      t('storageMigration.skipConfirmTitle'),
      t('storageMigration.skipConfirmMessage'),
      [
        { text: t('storageMigration.cancelButton'), style: 'cancel' },
        {
          text: t('storageMigration.skipConfirmButton'),
          style: 'destructive',
          onPress: () => {
            skipMigration();
            onClose();
          },
        },
      ]
    );
  };

  const handlePostpone = () => {
    postponeMigration();
    Alert.alert(
      t('storageMigration.postponeTitle'),
      t('storageMigration.postponeMessage'),
      [{ text: t('storageMigration.okButton'), onPress: onClose }]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={!isProcessing ? handlePostpone : undefined}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <MaterialIcons name="storage" size={32} color={COLOR.MAIN} />
            <Text style={styles.title}>{t('storageMigration.title')}</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>{t('storageMigration.dataSize')}</Text>
              <Text style={styles.infoValue}>{formatDataSize(storageInfo.dataSize)}</Text>
            </View>

            <Text style={styles.description}>
              {t('storageMigration.description')}
            </Text>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color={COLOR.BLUE} />
              <Text style={styles.infoText}>
                {t('storageMigration.infoText')}
              </Text>
            </View>

            {isProcessing && (
              <View style={styles.progressSection}>
                <ActivityIndicator size="large" color={COLOR.MAIN} />
                <Text style={styles.progressText}>{progress}</Text>
              </View>
            )}
          </View>

          {!isProcessing && (
            <View style={styles.buttonSection}>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleMigrate}
              >
                <Text style={styles.primaryButtonText}>{t('storageMigration.exportButton')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handlePostpone}
              >
                <Text style={styles.secondaryButtonText}>{t('storageMigration.postponeButton')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.skipButton]}
                onPress={handleSkip}
              >
                <Text style={styles.skipButtonText}>{t('storageMigration.skipButton')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
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