import { Alert } from '../atoms/Alert';
import { t } from '../../i18n/config';

export type DuplicateLayerChoice = 'replace' | 'newLayer' | 'cancel';

export const DuplicateLayerConfirmAsync = async (layerName: string): Promise<DuplicateLayerChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      t('hooks.duplicateLayer.title'),
      t('hooks.duplicateLayer.message', { layerName }),
      [
        { text: t('hooks.duplicateLayer.replace'), swalType: 'confirm', onPress: () => resolve('replace') },
        { text: t('hooks.duplicateLayer.newLayer'), swalType: 'deny', onPress: () => resolve('newLayer') },
        { text: t('common.cancel'), swalType: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: false }
    );
  });

export type ExportDestinationChoice = 'save' | 'share' | 'cancel';

/**
 * Androidでのエクスポート先（デバイスに保存 / 他のアプリで共有）をユーザーに確認する。
 * Androidの共有シートには「デバイスに保存」の選択肢がないため、共有前にここで選ばせる。
 */
export const ExportDestinationConfirmAsync = async (): Promise<ExportDestinationChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      t('hooks.exportDestination.title'),
      t('hooks.exportDestination.message'),
      [
        { text: t('hooks.exportDestination.save'), swalType: 'confirm', onPress: () => resolve('save') },
        { text: t('hooks.exportDestination.share'), swalType: 'deny', onPress: () => resolve('share') },
        { text: t('common.cancel'), swalType: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: false }
    );
  });

export type DataConflictChoice = 'merge' | 'overwrite' | 'cancel';

/**
 * 別端末で同じデータが更新されていた場合の対処をユーザーに確認する。
 * マージ（両方の変更を保持）/ 上書き（クラウドの別端末変更を破棄）/ キャンセル の3択。
 */
export const DataConflictConfirmAsync = async (): Promise<DataConflictChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      t('hooks.dataConflict.title'),
      t('hooks.dataConflict.message'),
      [
        { text: t('hooks.dataConflict.merge'), swalType: 'confirm', onPress: () => resolve('merge') },
        { text: t('hooks.dataConflict.overwrite'), swalType: 'deny', onPress: () => resolve('overwrite') },
        { text: t('common.cancel'), swalType: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: false }
    );
  });

export type StopDownloadChoice = 'continue' | 'pause' | 'discard';

/**
 * タイルダウンロード中断時の対処をユーザーに確認する。
 * 続ける / 一時停止（後で続きから再開可能）/ 破棄（記録を削除）の3択。
 */
export const StopDownloadConfirmAsync = async (): Promise<StopDownloadChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      t('hooks.stopDownload.title'),
      t('hooks.stopDownload.message'),
      [
        { text: t('hooks.stopDownload.continue'), swalType: 'confirm', onPress: () => resolve('continue') },
        { text: t('hooks.stopDownload.pause'), swalType: 'deny', onPress: () => resolve('pause') },
        { text: t('hooks.stopDownload.discard'), swalType: 'cancel', onPress: () => resolve('discard') },
      ],
      { cancelable: false }
    );
  });

export type ResumeDownloadChoice = 'resume' | 'later' | 'discard';

/**
 * 未完了のタイルダウンロードをどうするかユーザーに確認する。
 * 再開する / 後で（次回起動時に改めて確認）/ 破棄（未完了の記録を削除し以後確認しない）の3択。
 */
export const ResumeDownloadConfirmAsync = async (message: string): Promise<ResumeDownloadChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      t('hooks.resumeDownload.title'),
      message,
      [
        { text: t('hooks.resumeDownload.resume'), swalType: 'confirm', onPress: () => resolve('resume') },
        { text: t('hooks.resumeDownload.later'), swalType: 'deny', onPress: () => resolve('later') },
        { text: t('hooks.resumeDownload.discard'), swalType: 'cancel', onPress: () => resolve('discard') },
      ],
      { cancelable: false }
    );
  });

export const ConfirmAsync = async (
  message: string,
  text: { true: string; false: string } = { true: 'Yes', false: 'No' }
): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      '',
      message,
      [
        { text: text.false, style: 'cancel', onPress: () => resolve(false), swalType: 'cancel' },
        { text: text.true, onPress: () => resolve(true), swalType: 'confirm' },
      ],
      {
        cancelable: false,
      }
    );
  });

export const AlertAsync = async (message: string) =>
  new Promise((resolve) => {
    Alert.alert('', message, [{ text: 'OK', onPress: () => resolve(true), swalType: 'confirm' }], {
      cancelable: true,
      onDismiss: () => resolve(false),
    });
  });
