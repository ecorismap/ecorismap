import RNFS from 'react-native-fs';
import * as Sharing from 'expo-sharing';
import { debugLogMMKV } from './mmkvStorage';
import { Alert } from 'react-native';

export const exportDebugLogs = async (): Promise<void> => {
  try {
    // ログを取得してJSON形式に変換
    const logs = debugLogMMKV.exportLogs();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ecorismap-debug-log-${timestamp}.json`;
    
    // ドキュメントディレクトリに保存
    const path = `${RNFS.DocumentDirectoryPath}/${filename}`;
    await RNFS.writeFile(path, logs, 'utf8');
    
    // ファイルサイズを確認
    const stat = await RNFS.stat(path);
    const sizeInKB = (stat.size / 1024).toFixed(2);
    
    Alert.alert('Debug Log', `Exported ${debugLogMMKV.getLogs().length} log entries (${sizeInKB} KB)`);
    
    // 共有
    await Sharing.shareAsync(`file://${encodeURI(path)}`, {
      mimeType: 'application/json',
      dialogTitle: 'Export Debug Logs',
    });
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('cancelled')) {
      // ユーザーがキャンセルした場合は何もしない
      return;
    }
    Alert.alert('Export Failed', `Failed to export debug logs: ${error}`);
  }
};

export const clearDebugLogs = (): void => {
  Alert.alert(
    'Clear Debug Logs',
    'Are you sure you want to clear all debug logs?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          debugLogMMKV.clearLogs();
          Alert.alert('Success', 'Debug logs cleared');
        },
      },
    ]
  );
};

export const getDebugLogSize = (): string => {
  const sizeInBytes = debugLogMMKV.getSize();
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  } else if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
};

export const getDebugLogCount = (): number => {
  return debugLogMMKV.getLogs().length;
};