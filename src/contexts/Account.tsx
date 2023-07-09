import { createContext } from 'react';
import { AccountFormStateType, UserType } from '../types';

interface AccountContextType {
  user: UserType;
  accountFormState: AccountFormStateType | undefined;
  message: string;
  isLoading: boolean;
  changeResetPasswordForm: () => void;
  changeResetEncryptForm: () => void;
  changeSignUpForm: () => void;
  pressLoginUserAccount: (email: string, password: string) => void;
  pressSignupUserAccount: (email: string, password: string) => void;
  pressResetUserPassword: (email: string) => void;
  pressUpdateUserProfile: (displayName: string, photoURL: string) => void;
  pressChangeUserPassword: (oldPassword: string, password: string) => void;
  pressDeleteUserAccount: (password: string) => void;
  pressChangeEncryptPassword: (oldPassword: string, password: string) => void;
  pressRestoreEncryptKey: (password: string) => void;
  pressRegistEncryptPassword: (password: string) => void;
  pressBackupEncryptPassword: (password: string) => void;
  pressResetEncryptKey: (password: string) => void;
  pressDeleteAllProjects: (password: string) => void;
  pressClose: () => void;
}
export const AccountContext = createContext({} as AccountContextType);
