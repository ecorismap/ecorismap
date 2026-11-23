// アカウント監査 A-M8（保存前のトークン確保）・A-L11（フォルダIDのキャッシュ）の Web 側
jest.mock('../../../constants/APIKeys', () => ({
  googleDriveOAuth: { webClientId: 'web-client', iosClientId: '' },
}));

import { getAccessToken, signInGoogleDrive, trySilentSignIn } from '../auth.web';
import { getCachedAppFolderId, setCachedAppFolderId } from '../appFolderCache';
import { DRIVE_FILE_SCOPE } from '../types';

type TokenResp = { access_token?: string; expires_in?: number; scope?: string; error?: string };
type Config = { callback: (r: TokenResp) => void; error_callback?: (e: { type: string }) => void };

// GIS の応答を1件ずつ差し込む。'popup' はポップアップがブロックされた場合
const responses: (TokenResp | 'popup')[] = [];
const requestAccessToken = jest.fn();
let config: Config | undefined;

const storage: Record<string, string> = {};
const g = globalThis as unknown as Record<string, unknown>;

beforeAll(() => {
  g.window = g.window ?? globalThis;
  (g.window as Record<string, unknown>).google = {
    accounts: {
      oauth2: {
        initTokenClient: (c: Config) => {
          config = c;
          return {
            callback: c.callback,
            requestAccessToken: (opts: unknown) => {
              requestAccessToken(opts);
              const r = responses.shift();
              setTimeout(() => {
                if (r === 'popup' || r === undefined) config?.error_callback?.({ type: 'popup_failed_to_open' });
                else config?.callback(r);
              }, 0);
            },
          };
        },
        revoke: jest.fn(),
      },
    },
  };
  g.localStorage = {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: (k: string, v: string) => {
      storage[k] = v;
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
  };
  g.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ email: 'a@example.com' }) });
});

const token = (expiresIn: number): TokenResp => ({
  access_token: `tok-${expiresIn}`,
  expires_in: expiresIn,
  scope: DRIVE_FILE_SCOPE,
});

beforeEach(() => {
  responses.length = 0;
  requestAccessToken.mockClear();
});

describe('auth.web', () => {
  test('A-L11: サインインに成功したらフォルダIDのキャッシュを捨てる', async () => {
    setCachedAppFolderId('folder-of-previous-account');
    responses.push(token(3600));
    const result = await signInGoogleDrive();
    expect(result.isOK).toBe(true);
    expect(getCachedAppFolderId()).toBeUndefined();
  });

  test('A-M8: 画面を開いたとき残りが10分を切っていれば前倒しで更新する', async () => {
    // 残り5分のトークンを持たせる
    responses.push(token(300));
    await getAccessToken({ forceRefresh: true });
    requestAccessToken.mockClear();

    responses.push(token(3600));
    const result = await trySilentSignIn();
    expect(result.isOK).toBe(true);
    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    // 更新後は保存時に再取得しない
    requestAccessToken.mockClear();
    expect(await getAccessToken({ minTtlSec: 600 })).toBe('tok-3600');
    expect(requestAccessToken).not.toHaveBeenCalled();
  });

  test('A-M8: 前倒しの更新に失敗しても、まだ使えるトークンがあれば接続済みのまま', async () => {
    responses.push(token(300));
    await getAccessToken({ forceRefresh: true });

    responses.push('popup');
    const result = await trySilentSignIn();
    expect(result).toEqual({ isOK: true, message: '', email: 'a@example.com' });
  });

  test('残りが10分を超えていれば取得しない（チラつき防止は従来どおり）', async () => {
    responses.push(token(3600));
    await getAccessToken({ forceRefresh: true });
    requestAccessToken.mockClear();
    const result = await trySilentSignIn();
    expect(result.isOK).toBe(true);
    expect(requestAccessToken).not.toHaveBeenCalled();
  });
});
