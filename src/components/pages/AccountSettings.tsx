import React, { useContext } from 'react';
import { View, StyleSheet, ScrollView, Platform, Text, TouchableOpacity } from 'react-native';
import { ACCOUNT_SETTINGS_BTN, COLOR, FUNC_ENCRYPTION, FUNC_LOGIN, FUNC_PURCHASE } from '../../constants/AppConstants';
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
    pressUpgradeAccount,
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
        <TouchableOpacity style={{ padding: 5 }} onPress={pressGotoHome}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLOR.BLACK} />
        </TouchableOpacity>
        <Text style={{ fontSize: 16 }}>{t('AccountSettings.navigation.title')}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.container}>
        <ScrollView>
          <TextButton
            name={ACCOUNT_SETTINGS_BTN.ACCOUNT_EDIT}
            text={t('AccountSettings.account_edit.text')}
            info={t('AccountSettings.account_edit.info')}
            onPress={pressUpdateUserProfile}
          />
          <TextButton
            name={ACCOUNT_SETTINGS_BTN.PASSWORD_CHANGE}
            text={t('AccountSettings.password_change.text')}
            info={t('AccountSettings.password_change.info')}
            onPress={pressChangeUserPassword}
          />
          {FUNC_ENCRYPTION && (
            <TextButton
              name={ACCOUNT_SETTINGS_BTN.ENCRYPTION_PASSWORD_CHANGE}
              text={t('AccountSettings.encryption_password_change.text')}
              info={t('AccountSettings.encryption_password_change.info')}
              onPress={pressChangeEncryptPassword}
            />
          )}
          {FUNC_ENCRYPTION && (
            <TextButton
              name={ACCOUNT_SETTINGS_BTN.ENCRYPTION_KEY_RESET}
              text={t('AccountSettings.encryption_key_reset.text')}
              info={t('AccountSettings.encryption_key_reset.info')}
              onPress={pressResetEncryptKey}
            />
          )}
          <TextButton
            name={ACCOUNT_SETTINGS_BTN.ACCOUNT_DELETE}
            text={t('AccountSettings.account_delete.text')}
            info={t('AccountSettings.account_delete.info')}
            onPress={pressDeleteUserAccount}
          />
          {FUNC_PURCHASE && Platform.OS === 'web' && (
            <TextButton
              name={ACCOUNT_SETTINGS_BTN.UPGRADE}
              text={t('AccountSettings.upgrade.text')}
              info={t('AccountSettings.upgrade.info')}
              onPress={pressUpgradeAccount}
            />
          )}

          {FUNC_LOGIN && Platform.OS === 'web' && (
            <TextButton
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
