import { createContext } from 'react';

interface AccountSettingsContextType {
  pressUpdateUserProfile: () => void;
  pressChangeUserPassword: () => void;
  pressChangeEncryptPassword: () => void;
  pressResetEncryptKey: () => void;
  pressDeleteUserAccount: () => void;
  pressUpgradeAccount: () => void;
  pressDeleteAllProjects: () => void;
  pressGotoHome: () => void;
}
export const AccountSettingsContext = createContext({} as AccountSettingsContextType);
