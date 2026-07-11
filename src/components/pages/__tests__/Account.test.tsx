import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Account from '../Account';
import { AccountContext } from '../../../contexts/Account';
import { AccountFormStateType, UserType } from '../../../types';

// @expo/vector-iconsのモック
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'View',
}));

const noUser: UserType = { uid: undefined, email: null, displayName: null, photoURL: null };

const createContextValue = (accountFormState: AccountFormStateType) => ({
  user: noUser,
  accountFormState,
  message: '',
  isLoading: false,
  changeResetPasswordForm: jest.fn(),
  changeResetEncryptForm: jest.fn(),
  changeSignUpForm: jest.fn(),
  changeLoginForm: jest.fn(),
  changeSelectLoginMethodForm: jest.fn(),
  pressConnectGoogle: jest.fn(),
  pressLoginUserAccount: jest.fn(),
  pressSignupUserAccount: jest.fn(),
  pressResetUserPassword: jest.fn(),
  pressUpdateUserProfile: jest.fn(),
  pressChangeUserPassword: jest.fn(),
  pressDeleteUserAccount: jest.fn(),
  pressChangeEncryptPassword: jest.fn(),
  pressRestoreEncryptKey: jest.fn(),
  pressRegistEncryptPassword: jest.fn(),
  pressBackupEncryptPassword: jest.fn(),
  pressResetEncryptKey: jest.fn(),
  pressDeleteAllProjects: jest.fn(),
  pressClose: jest.fn(),
});

const renderAccount = async (contextValue: ReturnType<typeof createContextValue>) =>
  await render(
    <AccountContext.Provider value={contextValue}>
      <Account />
    </AccountContext.Provider>
  );

describe('Account (selectLoginMethod)', () => {
  it('ログイン方法選択: Google接続ボタン（主）と組織ログインリンク（従）を表示し、次へボタンは出さない', async () => {
    const contextValue = createContextValue('selectLoginMethod');
    const { getByText, queryByText } = await renderAccount(contextValue);
    expect(getByText('Account.text.connectGoogle')).toBeTruthy();
    expect(getByText('Account.text.connectGoogleInfo')).toBeTruthy();
    expect(getByText('Account.text.orgAccountLogin')).toBeTruthy();
    expect(getByText('Account.text.orgAccountLoginInfo')).toBeTruthy();
    expect(queryByText('Account.text.next')).toBeNull();
  });

  it('Googleで接続を押すとpressConnectGoogleが呼ばれる', async () => {
    const contextValue = createContextValue('selectLoginMethod');
    const { getByText } = await renderAccount(contextValue);
    await fireEvent.press(getByText('Account.text.connectGoogle'));
    expect(contextValue.pressConnectGoogle).toHaveBeenCalled();
  });

  it('組織アカウントでログインを押すとログインフォームへ切り替わる', async () => {
    const contextValue = createContextValue('selectLoginMethod');
    const { getByText } = await renderAccount(contextValue);
    await fireEvent.press(getByText('Account.text.orgAccountLogin'));
    expect(contextValue.changeLoginForm).toHaveBeenCalled();
  });
});

describe('Account (loginUserAccount / signupUserAccount)', () => {
  it('ログインフォームから選択画面へ戻れる', async () => {
    const contextValue = createContextValue('loginUserAccount');
    const { getByText } = await renderAccount(contextValue);
    await fireEvent.press(getByText('Account.text.backToSelectLogin'));
    expect(contextValue.changeSelectLoginMethodForm).toHaveBeenCalled();
  });

  it('サインアップフォームに組織メンバー専用の注記を表示する', async () => {
    const contextValue = createContextValue('signupUserAccount');
    const { getByText } = await renderAccount(contextValue);
    expect(getByText('Account.text.signupOrgNote')).toBeTruthy();
  });
});
