import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { googleDriveOAuth } from '../../constants/APIKeys';
import { DRIVE_FILE_SCOPE, GoogleDriveAuthError, GoogleDriveAuthResult } from './types';

let configured = false;
let connectedEmail: string | undefined;
let cachedToken: string | undefined;

function configure() {
  if (configured) return;
  if (googleDriveOAuth.webClientId === '') {
    throw new GoogleDriveAuthError('unavailable', 'Google Drive OAuth client ID is not configured');
  }
  GoogleSignin.configure({
    scopes: [DRIVE_FILE_SCOPE],
    webClientId: googleDriveOAuth.webClientId,
    iosClientId: googleDriveOAuth.iosClientId,
    offlineAccess: false,
  });
  configured = true;
}

export const signInGoogleDrive = async (): Promise<GoogleDriveAuthResult> => {
  try {
    configure();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') {
      return { isOK: false, message: 'cancelled' };
    }
    connectedEmail = response.data.user.email;
    cachedToken = undefined;
    return { isOK: true, message: '', email: connectedEmail };
  } catch (e) {
    if (e instanceof GoogleDriveAuthError) {
      return { isOK: false, message: e.reason };
    }
    return { isOK: false, message: 'unknown' };
  }
};

export const trySilentSignIn = async (): Promise<GoogleDriveAuthResult> => {
  try {
    configure();
    const response = await GoogleSignin.signInSilently();
    if (response.type !== 'success') {
      return { isOK: false, message: 'not-connected' };
    }
    connectedEmail = response.data.user.email;
    return { isOK: true, message: '', email: connectedEmail };
  } catch (e) {
    if (e instanceof GoogleDriveAuthError) {
      return { isOK: false, message: e.reason };
    }
    return { isOK: false, message: 'unknown' };
  }
};

export const getAccessToken = async (options?: { forceRefresh?: boolean; minTtlSec?: number }): Promise<string> => {
  configure();
  try {
    if (options?.forceRefresh === true && cachedToken !== undefined) {
      // ネイティブSDKのキャッシュを破棄させ、次のgetTokensで再発行させる
      await GoogleSignin.clearCachedAccessToken(cachedToken);
      cachedToken = undefined;
    }
    const { accessToken } = await GoogleSignin.getTokens();
    cachedToken = accessToken;
    return accessToken;
  } catch (e) {
    throw new GoogleDriveAuthError('reauth-required', e instanceof Error ? e.message : undefined);
  }
};

export const signOutGoogleDrive = async (): Promise<void> => {
  try {
    configure();
    await GoogleSignin.signOut();
  } catch {
    // サインアウト失敗時もローカル状態はクリアする
  }
  connectedEmail = undefined;
  cachedToken = undefined;
};

export const getConnectedEmail = (): string | undefined => {
  return connectedEmail ?? GoogleSignin.getCurrentUser()?.user.email ?? undefined;
};
