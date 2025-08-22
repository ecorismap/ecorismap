import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { StorageInfo, formatDataSize, migrateToMMKV, skipMigration, postponeMigration } from '../../utils/storageMigration';

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
  const [createBackup, setCreateBackup] = useState(true);
  const [clearOldData, setClearOldData] = useState(false);
  const [progress, setProgress] = useState('');

  const handleMigrate = async () => {
    // データ移行前の確認ダイアログを表示
    Alert.alert(
      '移行前の確認',
      '移行を実行すると、現在のデータが古いデータで上書きされる可能性があります。\n\n安全のため、移行前に現在のデータをエクスポートすることを推奨します。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '理解して続行',
          style: 'destructive',
          onPress: () => performMigration(),
        },
      ]
    );
  };

  const performMigration = async () => {
    setIsProcessing(true);
    setProgress('移行処理を開始しています...');

    try {
      const result = await migrateToMMKV({
        backup: createBackup,
        clearOldData: clearOldData,
      });

      if (result.success) {
        setProgress('移行が完了しました');
        
        Alert.alert(
          '移行完了',
          result.message + (result.backupPath ? '\n\nバックアップファイルが保存されました' : ''),
          [
            {
              text: 'OK',
              onPress: () => {
                onMigrationComplete();
                onClose();
              },
            },
          ]
        );
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      setProgress('');
      Alert.alert(
        'エラー',
        `移行中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
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

            <View style={styles.infoSection}>
              <Text style={styles.infoLabel}>データ項目数:</Text>
              <Text style={styles.infoValue}>{storageInfo.keys.length} 項目</Text>
            </View>

            <Text style={styles.description}>
              アプリのストレージシステムが更新されました。
              以前のデータを新しいシステムに移行することができます。
            </Text>

            <View style={styles.warningBox}>
              <MaterialIcons name="warning" size={20} color={COLORS.warningText} />
              <Text style={styles.warningText}>
                注意: 移行により現在のデータが上書きされる可能性があります。
                安全のため、移行前に設定画面から現在のデータをエクスポートすることを推奨します。
              </Text>
            </View>

            {!isProcessing && (
              <>
                <View style={styles.optionSection}>
                  <View style={styles.option}>
                    <Text style={styles.optionText}>バックアップを作成</Text>
                    <Switch
                      value={createBackup}
                      onValueChange={setCreateBackup}
                      trackColor={{ false: '#767577', true: COLOR.MAIN }}
                    />
                  </View>
                  <Text style={styles.optionDescription}>
                    移行前にデータのバックアップファイル（.ecorismap形式）を作成します
                  </Text>
                </View>

                <View style={styles.optionSection}>
                  <View style={styles.option}>
                    <Text style={styles.optionText}>古いデータを削除</Text>
                    <Switch
                      value={clearOldData}
                      onValueChange={setClearOldData}
                      trackColor={{ false: '#767577', true: COLOR.MAIN }}
                    />
                  </View>
                  <Text style={styles.optionDescription}>
                    移行後に古いストレージのデータを削除します
                  </Text>
                </View>
              </>
            )}

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
                <Text style={styles.primaryButtonText}>データを移行する</Text>
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
  warningBg: '#FFF3CD',
  warningText: '#856404',
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
  optionSection: {
    marginBottom: 15,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  optionText: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  optionDescription: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginLeft: 5,
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
    backgroundColor: COLOR.MAIN,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
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
  warningBox: {
    backgroundColor: COLORS.warningBg,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningText: {
    color: COLORS.warningText,
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
});