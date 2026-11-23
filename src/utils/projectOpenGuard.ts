import { DataType } from '../types';
import { t } from '../i18n/config';

/** 削除済みでない記録が手元に1件でもあるか。プロジェクトを開くと手元の記録はプロジェクトのデータに置き換わる */
export const hasLocalRecords = (dataSet: DataType[]): boolean =>
  dataSet.some((data) => data.data.some((record) => !record.deleted));

/**
 * プロジェクトを開いていない状態（端末内で記録したデータ、Drive やファイルから読み込んだデータ）から開くときの確認文（A-L2）。
 * ネイティブは開く直前の自動バックアップから戻せるが、Web はバックアップを作らないので戻せないと書き分ける
 */
export const buildOpenReplaceConfirmMessage = (isWeb: boolean): string =>
  isWeb ? t('ProjectEdit.confirm.replaceLocalDataWeb') : t('ProjectEdit.confirm.replaceLocalData');

/**
 * 開いていたプロジェクトがあり、開く途中で失敗して途中まで読み込んだ状態を残さないよう閉じたときの知らせ（A-H2）。
 * 開いていなかったときは閉じない（projectId が無くクラウドを上書きする経路が無く、閉じると独自の地図一覧やレイヤ構成まで消えるため）
 */
export const buildOpenFailedMessage = (errorMessage: string): string => {
  const base = t('ProjectEdit.alert.openFailedClosed');
  return errorMessage ? `${base}\n${errorMessage}` : base;
};
