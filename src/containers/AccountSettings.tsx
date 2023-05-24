import React, { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useSelector } from 'react-redux';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import AccountSettings from '../components/pages/AccountSettings';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';
import { t } from '../i18n/config';
import { AppState } from '../modules';
import { Props_AccountSettings } from '../routes';
import { getExt } from '../utils/General';
import * as DocumentPicker from 'expo-document-picker';
import { usePermission } from '../hooks/usePermission';
import { AccountSettingsContext } from '../contexts/AccountSettings';

export default function AccountSettingsContainers({ navigation }: Props_AccountSettings) {
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const { importProject } = useEcorisMapFile();
  const { isRunningProject } = usePermission();

  const pressUpdateUserProfile = useCallback(() => {
    navigation.navigate('Account', { accountFormState: 'updateUserProfile' });
  }, [navigation]);
  const pressChangeUserPassword = useCallback(() => {
    navigation.navigate('Account', { accountFormState: 'changeUserPassword' });
  }, [navigation]);

  const pressChangeEncryptPassword = useCallback(() => {
    navigation.navigate('Account', { accountFormState: 'changeEncryptPassword' });
  }, [navigation]);

  const pressResetEncryptKey = useCallback(async () => {
    const ret = await ConfirmAsync(t('AccountSettings.confirm.resetEncryptKey'));
    if (ret) {
      navigation.navigate('Account', {
        accountFormState: 'resetEncryptKey',
        message: t('AccountSettings.message.resetEncryptKey'),
      });
    }
  }, [navigation]);

  const pressDeleteUserAccount = useCallback(async () => {
    const ret = await ConfirmAsync(t('AccountSettings.confirm.deleteUserAccount'));
    if (ret) {
      navigation.navigate('Account', {
        accountFormState: 'deleteUserAccount',
        message: t('AccountSettings.message.deleteUserAccount'),
      });
    }
  }, [navigation]);

  const pressImportProject = useCallback(async () => {
    if (Platform.OS !== 'web') {
      //呼び出し元でチェックしているけど、サポートするときのために残す
      return { isOK: false, message: t('hooks.message.onlySupportWeb') };
    }
    if (isRunningProject) {
      Alert.alert('', t('hooks.message.cannotInRunningProject'));
    }
    if (tracking !== undefined) {
      return { isOK: false, message: t('hooks.message.cannotInTracking') };
    }
    const file = await DocumentPicker.getDocumentAsync({});
    if (file.type === 'cancel') return;
    const ext = getExt(file.name)?.toLowerCase();

    if (ext !== 'json') {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }

    const { isOK, message } = await importProject(file.uri, file.name, file.size);
    if (!isOK) {
      await AlertAsync(message);
    } else {
      navigation.navigate('Home');
    }
  }, [importProject, isRunningProject, navigation, tracking]);

  const pressDeleteAllProjects = useCallback(async () => {
    if (projectId !== undefined) {
      await AlertAsync(t('AccountSettings.alert.deleteAllProjects'));
      return;
    }
    const ret = await ConfirmAsync(t('AccountSettings.confirm.deleteAllProjects'));
    if (ret) {
      navigation.navigate('Account', {
        accountFormState: 'deleteAllProjects',
        message: t('AccountSettings.message.deleteAllProjects'),
      });
    }
  }, [navigation, projectId]);

  const pressUpgradeAccount = useCallback(async () => {
    navigation.navigate('Purchases');
  }, [navigation]);

  const pressGotoHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  return (
    <AccountSettingsContext.Provider
      value={{
        pressUpdateUserProfile,
        pressChangeUserPassword,
        pressChangeEncryptPassword,
        pressResetEncryptKey,
        pressDeleteUserAccount,
        pressUpgradeAccount,
        pressImportProject,
        pressDeleteAllProjects,
        pressGotoHome,
      }}
    >
      <AccountSettings />
    </AccountSettingsContext.Provider>
  );
}
