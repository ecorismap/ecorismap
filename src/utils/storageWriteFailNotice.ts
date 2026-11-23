import { Alert } from '../components/atoms/Alert';
import { t } from '../i18n/config';

let notified = false;

/**
 * 状態の保存（persist:root・dataSet）に失敗したことを、起動中に1回だけ知らせる。
 * 失敗は空き容量不足で起き、知らされないまま再起動するとデータが消えている（永続化監査 S-M4）。
 * 失敗は状態が変わるたびに続くので、毎回出すと操作できなくなる。
 * 結果を待つ呼び出し元が無い（タイマーや購読の中）ので AlertAsync ではなく Alert を使う
 */
export const notifyStorageWriteFailed = (error: unknown): void => {
  console.log('[storage] write failed:', error);
  if (notified) return;
  notified = true;
  try {
    Alert.alert('', t('hooks.message.storageWriteFailed'));
  } catch (e) {
    console.log('[storage] write fail notice error:', e);
  }
};

/** テスト用 */
export const resetStorageWriteFailNoticeForTest = (): void => {
  notified = false;
};
