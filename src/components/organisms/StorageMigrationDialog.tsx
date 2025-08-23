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
    setProgress('データをエクスポートしています...');

    try {
      // エクスポートのみ実行（自動移行はしない）
      const { exportAsyncStorageData } = require('../../utils/storageMigration');
      const backupPath = await exportAsyncStorageData();

      if (backupPath) {
        setProgress('エクスポートが完了しました');
        
        Alert.alert(
          'エクスポート完了',
          '以前のデータをエクスポートしました。\n\n設定画面の「データ」タブから「インポート」を選択して、保存したファイルを読み込むことができます。',
          [
            {
              text: 'OK',
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
        throw new Error('エクスポートに失敗しました');
      }
    } catch (error) {
      setProgress('');
      Alert.alert(
        'エラー',
        `エクスポート中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      '確認',
      '以前のデータをスキップして新規として開始しますか？\n\n注意: 以前のデータは復元できなくなる可能性があります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'スキップ',
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
      '後で確認',
      '次回アプリ起動時に再度確認します。',
      [{ text: 'OK', onPress: onClose }]
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
            <Text style={styles.title}>以前のデータが見つかりました</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>データサイズ:</Text>
              <Text style={styles.infoValue}>{formatDataSize(storageInfo.dataSize)}</Text>
            </View>

            <Text style={styles.description}>
              アプリのストレージシステムが更新されました。
              以前のデータをエクスポートして、新しいシステムで使用できます。
            </Text>

            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={20} color={COLOR.BLUE} />
              <Text style={styles.infoText}>
                エクスポート後、設定画面の「データ」タブから「インポート」を選択して、保存したファイルを読み込むことができます。
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
                <Text style={styles.primaryButtonText}>データをエクスポート</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handlePostpone}
              >
                <Text style={styles.secondaryButtonText}>後で確認</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.skipButton]}
                onPress={handleSkip}
              >
                <Text style={styles.skipButtonText}>新規として開始</Text>
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