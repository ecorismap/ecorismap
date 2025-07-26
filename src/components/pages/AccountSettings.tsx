import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { ACCOUNT_SETTINGS_BTN, FUNC_ENCRYPTION, FUNC_PROJECT, FUNC_PURCHASE } from '../../constants/AppConstants';
import { AccountSettingsContext } from '../../contexts/AccountSettings';
import { t } from '../../i18n/config';
import { TextButton } from '../molecules/TextButton';

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

  const navigation = useNavigation();
  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
  });

  const headerLeftButton = useCallback(
    (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      //@ts-ignore
      <HeaderBackButton {...props} labelVisible={false} onPress={pressGotoHome} />
    ),
    [pressGotoHome]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
      //
    });
  }, [headerLeftButton, navigation]);

  return (
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

        {FUNC_PROJECT && Platform.OS === 'web' && (
          <TextButton
            name={ACCOUNT_SETTINGS_BTN.PROJECT_DELETE_ALL}
            text={t('AccountSettings.project_delete_all.text')}
            info={t('AccountSettings.project_delete_all.info')}
            onPress={pressDeleteAllProjects}
          />
        )}
        {/* <TextButton
          name={'download'}
          text={'プロジェクトのバックアップ'}
          info="自分がオーナーのプロジェクトのデータをすべてダウンロードします。"
          onPress={() => null}
        /> */}
      </ScrollView>
    </View>
  );
}
