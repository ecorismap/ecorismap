import { googleDriveOAuth } from '../../constants/APIKeys';
import { DRIVE_FILE_SCOPE, GoogleDriveAuthError, GoogleDriveAuthResult } from './types';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const SCOPES = `${DRIVE_FILE_SCOPE} openid email`;
const STORAGE_KEY = 'ecorismap:googleDriveEmail';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const SILENT_TIMEOUT_MS = 10 * 1000;
const INTERACTIVE_TIMEOUT_MS = 5 * 60 * 1000;

type GsiTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GsiTokenClient = {
  callback: (resp: GsiTokenResponse) => void;
  requestAccessToken: (overrideConfig?: { prompt?: string; login_hint?: string }) => void;
};

type GsiOauth2 = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: GsiTokenResponse) => void;
    error_callback?: (err: { type: string; message?: string }) => void;
  }) => GsiTokenClient;
  revoke: (token: string, done?: () => void) => void;
};

function getGsiOauth2(): GsiOauth2 | undefined {
  return (window as unknown as { google?: { accounts?: { oauth2?: GsiOauth2 } } }).google?.accounts?.oauth2;
}

let tokenClient: GsiTokenClient | undefined;
let accessToken: { token: string; expiresAt: number } | undefined;
let connectedEmail: string | undefined;
let scriptPromise: Promise<void> | undefined;
let pendingRequest: { resolve: (resp: GsiTokenResponse) => void; reject: (e: GoogleDriveAuthError) => void } | undefined;

function loadStoredEmail(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeEmail(email: string | undefined) {
  try {
    if (email === undefined) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, email);
    }
  } catch {
    // localStorageが使えない環境では再接続ヒントが残らないだけなので無視
  }
}

function loadGsiScript(): Promise<void> {
  if (getGsiOauth2() !== undefined) return Promise.resolve();
  if (scriptPromise !== undefined) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new GoogleDriveAuthError('unavailable', 'Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function ensureTokenClient(): Promise<GsiTokenClient> {
  if (googleDriveOAuth.webClientId === '') {
    throw new GoogleDriveAuthError('unavailable', 'Google Drive OAuth client ID is not configured');
  }
  await loadGsiScript();
  if (tokenClient !== undefined) return tokenClient;
  const oauth2 = getGsiOauth2();
  if (oauth2 === undefined) {
    throw new GoogleDriveAuthError('unavailable', 'Google Identity Services is not available');
  }
  tokenClient = oauth2.initTokenClient({
    client_id: googleDriveOAuth.webClientId,
    scope: SCOPES,
    callback: (resp) => {
      pendingRequest?.resolve(resp);
      pendingRequest = undefined;
    },
    error_callback: (err) => {
      const reason = err.type === 'popup_closed' ? 'cancelled' : 'reauth-required';
      pendingRequest?.reject(new GoogleDriveAuthError(reason, err.message));
      pendingRequest = undefined;
    },
  });
  return tokenClient;
}

async function requestToken(options: { silent: boolean }): Promise<string> {
  const client = await ensureTokenClient();
  if (pendingRequest !== undefined) {
    throw new GoogleDriveAuthError('unknown', 'Another token request is in progress');
  }
  const timeoutMs = options.silent ? SILENT_TIMEOUT_MS : INTERACTIVE_TIMEOUT_MS;
  const resp = await new Promise<GsiTokenResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequest = undefined;
      reject(new GoogleDriveAuthError('reauth-required', 'Token request timed out'));
    }, timeoutMs);
    pendingRequest = {
      resolve: (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    };
    const hint = connectedEmail ?? loadStoredEmail();
    client.requestAccessToken({
      ...(options.silent ? { prompt: '' } : {}),
      ...(hint !== undefined ? { login_hint: hint } : {}),
    });
  });
  if (resp.access_token === undefined || resp.access_token === '') {
    const reason = resp.error === 'access_denied' ? 'cancelled' : 'reauth-required';
    throw new GoogleDriveAuthError(reason, resp.error_description ?? resp.error);
  }
  // 同意画面のチェックボックス(デフォルトOFF)でDrive権限が外されたまま続行されると、
  // ログインは成功するがDrive操作が403(insufficientPermissions)になる。ここで検知する。
  if (resp.scope !== undefined && !resp.scope.includes(DRIVE_FILE_SCOPE)) {
    throw new GoogleDriveAuthError('scope-denied', 'drive.file scope was not granted');
  }
  const expiresIn = resp.expires_in ?? 3600;
  accessToken = { token: resp.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return resp.access_token;
}

async function fetchEmail(token: string): Promise<string | undefined> {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return undefined;
    const info = (await res.json()) as { email?: string };
    return info.email;
  } catch {
    return undefined;
  }
}

export const signInGoogleDrive = async (): Promise<GoogleDriveAuthResult> => {
  try {
    const token = await requestToken({ silent: false });
    const email = await fetchEmail(token);
    connectedEmail = email ?? connectedEmail ?? loadStoredEmail();
    storeEmail(connectedEmail);
    return { isOK: true, message: '', email: connectedEmail };
  } catch (e) {
    if (e instanceof GoogleDriveAuthError) {
      return { isOK: false, message: e.reason };
    }
    return { isOK: false, message: 'unknown' };
  }
};

export const trySilentSignIn = async (): Promise<GoogleDriveAuthResult> => {
  const storedEmail = loadStoredEmail();
  if (storedEmail === undefined) return { isOK: false, message: 'not-connected' };
  try {
    const token = await requestToken({ silent: true });
    connectedEmail = (await fetchEmail(token)) ?? storedEmail;
    storeEmail(connectedEmail);
    return { isOK: true, message: '', email: connectedEmail };
  } catch (e) {
    if (e instanceof GoogleDriveAuthError) {
      return { isOK: false, message: e.reason };
    }
    return { isOK: false, message: 'unknown' };
  }
};

export const getAccessToken = async (options?: { forceRefresh?: boolean; minTtlSec?: number }): Promise<string> => {
  const minTtlMs = (options?.minTtlSec ?? 60) * 1000;
  if (options?.forceRefresh !== true && accessToken !== undefined && accessToken.expiresAt - Date.now() > minTtlMs) {
    return accessToken.token;
  }
  return await requestToken({ silent: true });
};

export const signOutGoogleDrive = async (): Promise<void> => {
  const token = accessToken?.token;
  accessToken = undefined;
  connectedEmail = undefined;
  storeEmail(undefined);
  if (token !== undefined) {
    const oauth2 = getGsiOauth2();
    oauth2?.revoke(token);
  }
};

export const getConnectedEmail = (): string | undefined => {
  return connectedEmail ?? loadStoredEmail();
};
