import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { AccountContext } from '../../contexts/Account';
import AccountContainer from '../Account';
import AccountSettingsContainer from '../AccountSettings';
import { AccountSettingsContext } from '../../contexts/AccountSettings';
import { Props_Account, Props_AccountSettings } from '../../routes';
import { LoginOptions } from '../../hooks/useAccount';

// アカウント監査（docs/ACCOUNT_AUDIT_2026-11.md）の判断項目（推奨案）
// - A-M1: 取りやめられないログアウトで持ち主を記録し、別の人がログインするなら確認して clearProject
// - A-L1: プロジェクトを開いたままアカウント削除へ進ませない

const mockAccountCtx: { ctx?: React.ContextType<typeof AccountContext> } = {};
const mockSettingsCtx: { ctx?: React.ContextType<typeof AccountSettingsContext> } = {};
let mockState: {
  settings: { projectId: string | undefined; projectName: string | undefined; projectSessionUid?: string };
  user: { uid: string | undefined };
} = { settings: { projectId: undefined, projectName: undefined }, user: { uid: undefined } };
const mockDispatch = jest.fn();
const mockClearProject = jest.fn();
const mockLogoutAccount = jest.fn(async () => undefined);
const mockLogin = jest.fn();
const mockAlertAsync = jest.fn(async (_message: string) => undefined);
const mockConfirmAsync = jest.fn(async (_message: string) => true);
const mockBackupBeforeReplace = jest.fn(async (_state: unknown, _trigger: string) => true);

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useStore: () => ({ getState: () => mockState }),
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  shallowEqual: () => true,
}));
jest.mock('../../components/pages/Account', () => {
  const { useContext: useCtx } = jest.requireActual('react');
  const { AccountContext: Ctx } = jest.requireActual('../../contexts/Account');
  return function MockAccount() {
    mockAccountCtx.ctx = useCtx(Ctx);
    return null;
  };
});
jest.mock('../../components/pages/AccountSettings', () => {
  const { useContext: useCtx } = jest.requireActual('react');
  const { AccountSettingsContext: Ctx } = jest.requireActual('../../contexts/AccountSettings');
  return function MockAccountSettings() {
    mockSettingsCtx.ctx = useCtx(Ctx);
    return null;
  };
});
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: (message: string) => mockAlertAsync(message),
  ConfirmAsync: (message: string) => mockConfirmAsync(message),
}));
jest.mock('../../utils/backupBeforeReplace', () => ({
  backupBeforeReplace: (state: unknown, trigger: string) => mockBackupBeforeReplace(state, trigger),
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../utils/trackingLeaveGuard', () => ({ stopTrackingBeforeForcedLogout: jest.fn(async () => true) }));
jest.mock('../../lib/googledrive/auth', () => ({ signInGoogleDrive: jest.fn() }));
jest.mock('../../hooks/useEncryptKeyResetConfirm', () => ({ useEncryptKeyResetConfirm: () => jest.fn() }));
jest.mock('../../hooks/useProject', () => ({ useProject: () => ({ clearProject: mockClearProject }) }));
jest.mock('../../hooks/useAccount', () => ({
  useAccount: () => ({
    user: mockState.user,
    accountMessage: '',
    accountFormState: 'loginUserAccount',
    isLoading: false,
    setAccountFormState: jest.fn(),
    setAccountMessage: jest.fn(),
    checkPassword: () => ({ isOK: true }),
    checkUserPassword: async () => ({ isOK: true }),
    checkEncryptPassword: () => ({ isOK: true }),
    checkNewEncryptPassword: () => ({ isOK: true }),
    checkEmail: () => ({ isOK: true }),
    checkProfile: () => ({ isOK: true }),
    initializeEncript: async () => ({ isOK: true }),
    sendConfirmEMail: jest.fn(),
    login: mockLogin,
    logout: mockLogoutAccount,
    signUp: jest.fn(),
    updateUserProfile: jest.fn(),
    changeUserPassword: jest.fn(),
    resetUserPassword: jest.fn(),
    deleteUserAccount: async () => ({ isOK: true }),
    changeEncryptPassword: jest.fn(),
    registEncryptPassword: jest.fn(),
    backupEncryptPassword: jest.fn(),
    migrateEncryptKey: jest.fn(),
    restoreEncryptKey: jest.fn(),
    resetEncryptKey: jest.fn(),
    deleteAllProjects: jest.fn(),
  }),
}));

const navigation = { navigate: jest.fn(), setParams: jest.fn() };

const renderAccount = async () => {
  const props = { navigation, route: { params: {} } } as unknown as Props_Account;
  render(<AccountContainer {...props} />);
  await waitFor(() => expect(mockAccountCtx.ctx).toBeDefined());
};

/** login のモック: 認証が通ったものとして beforeSwitchUser を呼ぶ */
const loginAs = (uid: string) =>
  mockLogin.mockImplementation(async (_email: string, _password: string, options?: LoginOptions) => {
    if (options?.beforeSwitchUser !== undefined && !(await options.beforeSwitchUser(uid))) {
      return { isOK: false, authUser: undefined };
    }
    return { isOK: true, authUser: { uid } };
  });

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
  mockAccountCtx.ctx = undefined;
  mockSettingsCtx.ctx = undefined;
  mockConfirmAsync.mockImplementation(async () => true);
  mockBackupBeforeReplace.mockImplementation(async () => true);
  mockState = { settings: { projectId: undefined, projectName: undefined }, user: { uid: undefined } };
});

describe('A-M1: 取りやめられないログアウトで持ち主を残す', () => {
  it('プロジェクトを開いたままなら、ログアウト前のユーザーを projectSessionUid に記録する', async () => {
    mockState = { settings: { projectId: 'p', projectName: 'P' }, user: { uid: 'a' } };
    await renderAccount();
    await act(async () => {
      await mockAccountCtx.ctx?.pressDeleteUserAccount('pw');
    });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { projectSessionUid: 'a' } })
    );
    expect(mockLogoutAccount).toHaveBeenCalled();
  });

  it('プロジェクトを開いていなければ何も記録しない', async () => {
    mockState = { settings: { projectId: undefined, projectName: undefined }, user: { uid: 'a' } };
    await renderAccount();
    await act(async () => {
      await mockAccountCtx.ctx?.pressDeleteUserAccount('pw');
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe('A-M1: 別の人がログインするとき', () => {
  it('前の人のプロジェクトが開いたままなら確認し、OK で閉じてからログインする', async () => {
    mockState = { settings: { projectId: 'p', projectName: 'P', projectSessionUid: 'a' }, user: { uid: undefined } };
    loginAs('b');
    await renderAccount();
    await act(async () => {
      await mockAccountCtx.ctx?.pressLoginUserAccount('b@example.com', 'pw');
    });
    expect(mockConfirmAsync).toHaveBeenCalledWith(
      'Account.confirm.closeOtherUserProject\nAccount.confirm.closeOtherUserProjectBackupNote'
    );
    expect(mockClearProject).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Projects');
  });

  it('キャンセルならプロジェクトを閉じずにログインを取りやめる', async () => {
    mockState = { settings: { projectId: 'p', projectName: 'P', projectSessionUid: 'a' }, user: { uid: undefined } };
    mockConfirmAsync.mockImplementation(async () => false);
    loginAs('b');
    await renderAccount();
    await act(async () => {
      await mockAccountCtx.ctx?.pressLoginUserAccount('b@example.com', 'pw');
    });
    expect(mockClearProject).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalledWith('Projects');
  });

  it('自動バックアップを作れず続けるのを取りやめたら、閉じずにログインも取りやめる（永続化監査 S-L2）', async () => {
    mockState = { settings: { projectId: 'p', projectName: 'P', projectSessionUid: 'a' }, user: { uid: undefined } };
    mockBackupBeforeReplace.mockImplementation(async () => false);
    loginAs('b');
    await renderAccount();
    await act(async () => {
      await mockAccountCtx.ctx?.pressLoginUserAccount('b@example.com', 'pw');
    });
    expect(mockBackupBeforeReplace).toHaveBeenCalledWith(mockState, 'projectClose');
    expect(mockClearProject).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalledWith('Projects');
  });

  it('Web は自動バックアップを作らないので、バックアップに残るとは書かない', async () => {
    (Platform as { OS: string }).OS = 'web';
    mockState = { settings: { projectId: 'p', projectName: 'P', projectSessionUid: 'a' }, user: { uid: undefined } };
    loginAs('b');
    await renderAccount();
    await act(async () => {
      await mockAccountCtx.ctx?.pressLoginUserAccount('b@example.com', 'pw');
    });
    expect(mockConfirmAsync).toHaveBeenCalledWith('Account.confirm.closeOtherUserProject');
  });

  it('同じ人が入り直すなら確認せず今のまま', async () => {
    mockState = { settings: { projectId: 'p', projectName: 'P', projectSessionUid: 'a' }, user: { uid: undefined } };
    loginAs('a');
    await renderAccount();
    await act(async () => {
      await mockAccountCtx.ctx?.pressLoginUserAccount('a@example.com', 'pw');
    });
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    expect(mockClearProject).not.toHaveBeenCalled();
  });
});

describe('A-L1: プロジェクトを開いたままのアカウント削除', () => {
  const renderSettings = async () => {
    const props = { navigation, route: { params: {} } } as unknown as Props_AccountSettings;
    render(<AccountSettingsContainer {...props} />);
    await waitFor(() => expect(mockSettingsCtx.ctx).toBeDefined());
  };

  it('開いていれば「閉じてから実行」で止め、削除フォームへ進まない', async () => {
    mockState = { settings: { projectId: 'p', projectName: 'P' }, user: { uid: 'a' } };
    await renderSettings();
    await act(async () => {
      await mockSettingsCtx.ctx?.pressDeleteUserAccount();
    });
    expect(mockAlertAsync).toHaveBeenCalledWith('AccountSettings.alert.deleteUserAccount');
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('開いていなければ従来どおり確認して削除フォームへ', async () => {
    await renderSettings();
    await act(async () => {
      await mockSettingsCtx.ctx?.pressDeleteUserAccount();
    });
    expect(mockConfirmAsync).toHaveBeenCalledWith('AccountSettings.confirm.deleteUserAccount');
    expect(navigation.navigate).toHaveBeenCalledWith('Account', expect.objectContaining({ accountFormState: 'deleteUserAccount' }));
  });
});
