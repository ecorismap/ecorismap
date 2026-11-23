import type { RootState } from '../store';
import { BackupSaveResultType, BackupStateType, BackupTriggerType, saveProjectBackupWithResult } from './projectBackup';
import { ConfirmAsync, waitForModalTransition } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';

export const toBackupState = (state: RootState): BackupStateType => ({
  settings: state.settings,
  layers: state.layers,
  tileMaps: state.tileMaps,
  dataSet: state.dataSet,
  user: state.user,
  projects: state.projects,
  dataSync: state.dataSync,
});

/**
 * 自動バックアップを作れなかったときだけ、置き換えを続けるかを尋ねる。true なら続けてよい。
 * 黙って置き換えると、データが大きい（失ったときの損害が大きい）利用者ほど救済が働かない（永続化監査 S-L2・S-M5）
 */
export const confirmProceedWithoutBackup = async (result: BackupSaveResultType): Promise<boolean> => {
  if (result !== 'failed') return true;
  // 直前の確認ダイアログが閉じ切る前に出すと iOS で表示に失敗する
  await waitForModalTransition();
  return await ConfirmAsync(t('Settings.confirm.backupFailedProceed'), {
    true: t('Settings.confirm.backupFailedProceedOK'),
    false: t('common.cancel'),
  });
};

/** 置き換え直前の自動バックアップ。作れなかったときは続けるかを尋ね、取りやめなら false */
export const backupBeforeReplace = async (state: RootState, trigger: BackupTriggerType): Promise<boolean> =>
  await confirmProceedWithoutBackup(saveProjectBackupWithResult(toBackupState(state), trigger));
