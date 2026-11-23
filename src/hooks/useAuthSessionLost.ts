import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { RootState } from '../store';
import { ConfirmAsync } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';
import { editSettingsAction } from '../modules/settings';
import {
  clearLostSession,
  consumeLostSessionPrompt,
  getLostSessionUid,
  startAuthSessionWatch,
  subscribeAuthSessionLost,
} from '../lib/firebase/sign-in';
import { resolveProjectSessionUid } from '../utils/projectSession';

/**
 * 同期が止まったときの「再ログインが必要」の文言。外からセッションが切れたのを見ていればその旨を、
 * そうでなければ（ログアウト後にバックアップを復元した状態など）これまでの文言を返す（A-L4）
 */
export const reloginRequiredMessage = (uid: string | undefined): string =>
  uid !== undefined && getLostSessionUid() === uid
    ? t('hooks.message.reloginRequiredSessionExpired')
    : t('hooks.message.reloginRequired');

/**
 * 別の場所でのパスワード変更などでセッションが切れたら、ログインし直すよう案内する（A-L4）。
 * 鍵を消して手元も閉じる LOGOUT を通さずにログイン画面へ送るので、同じ人が入り直せば Redux の状態と端末の鍵を
 * そのまま使える。別の人が入るときは、開いたままのプロジェクトを閉じるかをログイン時に尋ねる（A-M1）。
 * 自動で画面を移らないのは、軌跡の記録中にホームを離れると記録が抜けるため（移るときは記録ガードを通す）
 */
export const useAuthSessionLost = (navigateToLogin: () => Promise<void> | void) => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const isPromptingRef = useRef(false);

  const askRelogin = useCallback(async () => {
    isPromptingRef.current = true;
    try {
      const ok = await ConfirmAsync(t('Home.confirm.sessionExpired'), {
        true: t('Home.confirm.sessionExpiredLogin'),
        false: t('Home.confirm.sessionExpiredLater'),
      });
      if (ok) await navigateToLogin();
    } finally {
      isPromptingRef.current = false;
    }
  }, [navigateToLogin]);

  const handleLost = useCallback(async () => {
    const lostUid = getLostSessionUid();
    if (lostUid === undefined || isPromptingRef.current) return;
    const { user, settings } = store.getState();
    if (user.uid !== lostUid) {
      // 退会やログアウトで Redux の user も入れ替わった後。案内することはない
      clearLostSession();
      return;
    }
    // この版より前に開いたプロジェクトは持ち主の記録が無い。ここで残しておけば、別の人が入ったときに照合できる
    const sessionUid = resolveProjectSessionUid(settings, user.uid);
    if (sessionUid !== undefined && settings.projectSessionUid !== sessionUid) {
      dispatch(editSettingsAction({ projectSessionUid: sessionUid }));
    }
    if (!consumeLostSessionPrompt()) return;
    await askRelogin();
  }, [askRelogin, dispatch, store]);

  /**
   * セッションが切れているなら、ログインし直すかをもう一度尋ねて true を返す（「後で」を選んだ後の入口。
   * プロジェクト一覧はセッションが無いと汎用の権限エラーになるので、その手前で使う）。切れていなければ false
   */
  const promptReloginIfSessionLost = useCallback(async (): Promise<boolean> => {
    const lostUid = getLostSessionUid();
    if (lostUid === undefined || lostUid !== store.getState().user.uid) return false;
    if (!isPromptingRef.current) await askRelogin();
    return true;
  }, [askRelogin, store]);

  useEffect(() => {
    startAuthSessionWatch();
    // ホームにいない間に切れていたら、戻ったときに案内する
    handleLost();
    return subscribeAuthSessionLost(() => {
      handleLost();
    });
  }, [handleLost]);

  return { promptReloginIfSessionLost };
};
