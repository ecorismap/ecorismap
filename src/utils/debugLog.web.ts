import { debugLogMMKV } from './mmkvStorage';

export const exportDebugLogs = async (): Promise<void> => {
  try {
    // ログを取得してJSON形式に変換
    const logs = debugLogMMKV.exportLogs();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ecorismap-debug-log-${timestamp}.json`;
    
    // ブラウザでダウンロード
    const blob = new Blob([logs], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const logCount = debugLogMMKV.getLogs().length;
    const sizeInKB = (logs.length / 1024).toFixed(2);
    
    alert(`Exported ${logCount} log entries (${sizeInKB} KB)`);
    
  } catch (error) {
    console.error('Failed to export debug logs:', error);
    alert('Failed to export debug logs');
  }
};

export const clearDebugLogs = (): void => {
  try {
    debugLogMMKV.clearLogs();
    alert('Debug logs cleared');
  } catch (error) {
    console.error('Failed to clear debug logs:', error);
    alert('Failed to clear debug logs');
  }
};

export const getDebugLogSize = (): string => {
  const size = debugLogMMKV.getSize();
  const sizeInKB = (size / 1024).toFixed(2);
  return `${sizeInKB} KB`;
};