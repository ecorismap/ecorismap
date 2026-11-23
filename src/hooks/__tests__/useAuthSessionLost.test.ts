// アカウント監査（docs/ACCOUNT_AUDIT_2026-11.md）A-L4: 外からのセッション切れでログインし直しへ誘導する
let mockState: {
  settings: { projectId: string | undefined; projectSessionUid?: string };
  user: { uid: string | undefined };
} = { settings: { projectId: undefined }, user: { uid: undefined } };
const mockDispatch = jest.fn();
let mockLostUid: string | undefined;
let mockPrompted = false;
let mockListener: ((uid: string) => void) | undefined;
const mockClearLost = jest.fn(() => {
  mockLostUid = undefined;
});
const mockConfirmAsync = jest.fn(async (_message: string, _text?: unknown) => true);

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useStore: () => ({ getState: () => mockState }),
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../components/molecules/AlertAsync', () => ({
  ConfirmAsync: (message: string, text?: unknown) => mockConfirmAsync(message, text),
}));
jest.mock('../../lib/firebase/sign-in', () => ({
  startAuthSessionWatch: jest.fn(async () => undefined),
  getLostSessionUid: () => mockLostUid,
  clearLostSession: () => mockClearLost(),
  consumeLostSessionPrompt: () => {
    if (mockLostUid === undefined || mockPrompted) return false;
    mockPrompted = true;
    return true;
  },
  subscribeAuthSessionLost: (listener: (uid: string) => void) => {
    mockListener = listener;
    return () => {
      mockListener = undefined;
    };
  },
}));

import { renderHook, act } from '@testing-library/react-hooks';
import { reloginRequiredMessage, useAuthSessionLost } from '../useAuthSessionLost';

const flush = () => act(async () => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockLostUid = undefined;
  mockPrompted = false;
  mockListener = undefined;
  mockConfirmAsync.mockImplementation(async () => true);
  mockState = { settings: { projectId: undefined }, user: { uid: 'a' } };
});

describe('useAuthSessionLost', () => {
  it('切れたことを知らされたら尋ね、OK ならログイン画面へ送る（鍵を消す LOGOUT は通さない）', async () => {
    const navigateToLogin = jest.fn();
    renderHook(() => useAuthSessionLost(navigateToLogin));
    await flush();
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    mockLostUid = 'a';
    await act(async () => {
      mockListener?.('a');
    });
    expect(mockConfirmAsync).toHaveBeenCalledWith('Home.confirm.sessionExpired', expect.anything());
    expect(navigateToLogin).toHaveBeenCalledTimes(1);
  });

  it('「後で」ならそのまま。案内は1回だけで、プロジェクト一覧の入口でもう一度尋ねる', async () => {
    mockConfirmAsync.mockImplementation(async () => false);
    mockLostUid = 'a';
    const navigateToLogin = jest.fn();
    const { result } = renderHook(() => useAuthSessionLost(navigateToLogin));
    await flush();
    expect(mockConfirmAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      mockListener?.('a');
    });
    expect(mockConfirmAsync).toHaveBeenCalledTimes(1);
    let handled: boolean | undefined;
    await act(async () => {
      handled = await result.current.promptReloginIfSessionLost();
    });
    expect(handled).toBe(true);
    expect(mockConfirmAsync).toHaveBeenCalledTimes(2);
    expect(navigateToLogin).not.toHaveBeenCalled();
  });

  it('開いたままのプロジェクトに持ち主の記録が無ければ、今のユーザーを記録する（別の人のログインで照合するため）', async () => {
    mockState = { settings: { projectId: 'p' }, user: { uid: 'a' } };
    mockLostUid = 'a';
    renderHook(() => useAuthSessionLost(jest.fn()));
    await flush();
    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: { projectSessionUid: 'a' } }));
  });

  it('Redux の user が既に入れ替わっていれば（退会・ログアウト後）案内せず記録を捨てる', async () => {
    mockState = { settings: { projectId: undefined }, user: { uid: undefined } };
    mockLostUid = 'a';
    renderHook(() => useAuthSessionLost(jest.fn()));
    await flush();
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    expect(mockClearLost).toHaveBeenCalled();
  });

  it('切れていなければプロジェクト一覧の入口は素通し', async () => {
    const { result } = renderHook(() => useAuthSessionLost(jest.fn()));
    await flush();
    let handled: boolean | undefined;
    await act(async () => {
      handled = await result.current.promptReloginIfSessionLost();
    });
    expect(handled).toBe(false);
  });
});

describe('reloginRequiredMessage', () => {
  it('セッション切れを見ていればその文言、そうでなければ従来の「復元データ」の文言', () => {
    mockLostUid = 'a';
    expect(reloginRequiredMessage('a')).toBe('hooks.message.reloginRequiredSessionExpired');
    expect(reloginRequiredMessage('b')).toBe('hooks.message.reloginRequired');
    mockLostUid = undefined;
    expect(reloginRequiredMessage('a')).toBe('hooks.message.reloginRequired');
  });
});
