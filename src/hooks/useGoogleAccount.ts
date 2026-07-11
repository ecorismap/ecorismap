import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { getConnectedEmail, signOutGoogleDrive, trySilentSignIn } from '../lib/googledrive/auth';
import { clearAppFolderCache } from '../lib/googledrive/driveApi';
import { setGoogleDriveConnectedEmailAction } from '../modules/googleDrive';

export type UseGoogleAccountReturnType = {
  googleAccountEmail: string | undefined;
  disconnectGoogleAccount: () => Promise<void>;
};

/**
 * Googleアカウント（Drive個人プロジェクト）の接続状態をアプリ全体のUIに提供する軽量フック。
 * persistされた connectedEmail はトークン失効後も残るため、起動時に一度だけサイレント再接続を試し、
 * 接続が確実に存在しない場合（not-connected/unavailable）のみ表示をクリアする。
 * reauth-required等の一時的な失敗では表示を維持し、Drive操作時の再認証導線（既存挙動）に委ねる。
 */
export const useGoogleAccount = (): UseGoogleAccountReturnType => {
  const dispatch = useDispatch();
  const connectedEmail = useSelector((state: RootState) => state.googleDrive.connectedEmail);
  const triedSilentSignIn = useRef(false);

  useEffect(() => {
    // redux-persistの復元後、connectedEmailが現れた時点で一度だけ実行する
    if (triedSilentSignIn.current || connectedEmail === undefined) return;
    triedSilentSignIn.current = true;
    // Webはサイレント取得でも一瞬ポップアップが開き、ユーザー操作なしだとブロックもされうるため、
    // 起動時の再接続は行わず保存済みの接続状態を表示に使う。実認証はDrive操作時の既存導線に委ねる。
    if (Platform.OS === 'web') return;
    (async () => {
      const result = await trySilentSignIn();
      if (result.isOK) {
        const email = result.email ?? getConnectedEmail();
        if (email !== undefined && email !== connectedEmail) {
          dispatch(setGoogleDriveConnectedEmailAction(email));
        }
      } else if (result.message === 'not-connected' || result.message === 'unavailable') {
        dispatch(setGoogleDriveConnectedEmailAction(undefined));
      }
    })();
  }, [connectedEmail, dispatch]);

  const disconnectGoogleAccount = useCallback(async () => {
    await signOutGoogleDrive();
    clearAppFolderCache();
    dispatch(setGoogleDriveConnectedEmailAction(undefined));
  }, [dispatch]);

  return { googleAccountEmail: connectedEmail, disconnectGoogleAccount } as const;
};
