import React, { useContext } from 'react';
import { View, StyleSheet, ScrollView, Platform, Text, TouchableOpacity } from 'react-native';
import { ACCOUNT_SETTINGS_BTN, COLOR, FUNC_ENCRYPTION } from '../../constants/AppConstants';
import { AccountSettingsContext } from '../../contexts/AccountSettings';
import { t } from '../../i18n/config';
import { TextButton } from '../molecules/TextButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function AccountSettings() {
  const {
    pressUpdateUserProfile,
    pressChangeUserPassword,
    pressChangeEncryptPassword,
    pressResetEncryptKey,
    pressDeleteUserAccount,
    pressDeleteAllProjects,
    pressGotoHome,
  } = useContext(AccountSettingsContext);

  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: 56 + insets.top,
      backgroundColor: COLOR.MAIN,
      paddingHorizontal: 10,
      paddingTop: insets.top,
    },
  });

  return (
    <>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="accountsettings-back" style={{ padding: 5 }} onPress={pressGotoHome}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLOR.BLACK} />
        </TouchableOpacity>
        <Text style={{ fontSize: 16 }}>{t('AccountSettings.navigation.title')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.container}>
        <ScrollView>
          <TextButton
            testID="accountsettings-account-edit"
            name={ACCOUNT_SETTINGS_BTN.ACCOUNT_EDIT}
            text={t('AccountSettings.account_edit.text')}
            info={t('AccountSettings.account_edit.info')}
            onPress={pressUpdateUserProfile}
          />
          <TextButton
            testID="accountsettings-password-change"
            name={ACCOUNT_SETTINGS_BTN.PASSWORD_CHANGE}
            text={t('AccountSettings.password_change.text')}
            info={t('AccountSettings.password_change.info')}
            onPress={pressChangeUserPassword}
          />
          {FUNC_ENCRYPTION && (
            <TextButton
              testID="accountsettings-encryption-password-change"
              name={ACCOUNT_SETTINGS_BTN.ENCRYPTION_PASSWORD_CHANGE}
              text={t('AccountSettings.encryption_password_change.text')}
              info={t('AccountSettings.encryption_password_change.info')}
              onPress={pressChangeEncryptPassword}
            />
          )}
          {FUNC_ENCRYPTION && (
            <TextButton
              testID="accountsettings-encryption-key-reset"
              name={ACCOUNT_SETTINGS_BTN.ENCRYPTION_KEY_RESET}
              text={t('AccountSettings.encryption_key_reset.text')}
              info={t('AccountSettings.encryption_key_reset.info')}
              onPress={pressResetEncryptKey}
            />
          )}
          <TextButton
            testID="accountsettings-account-delete"
            name={ACCOUNT_SETTINGS_BTN.ACCOUNT_DELETE}
            text={t('AccountSettings.account_delete.text')}
            info={t('AccountSettings.account_delete.info')}
            onPress={pressDeleteUserAccount}
          />
          {Platform.OS === 'web' && (
            <TextButton
              testID="accountsettings-project-delete-all"
              name={ACCOUNT_SETTINGS_BTN.PROJECT_DELETE_ALL}
              text={t('AccountSettings.project_delete_all.text')}
              info={t('AccountSettings.project_delete_all.info')}
              onPress={pressDeleteAllProjects}
            />
          )}
        </ScrollView>
      </View>
    </>
  );
}
