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
