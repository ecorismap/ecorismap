import React, { useEffect, useState, useContext } from 'react';
import { View, TextInput, Text, StyleSheet, Image, SafeAreaView } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { AccountContext } from '../../contexts/Account';
import { t } from '../../i18n/config';
import { Button } from '../atoms';
import { Loading } from '../molecules/Loading';

export default function Account() {
  const {
    user,
    accountFormState,
    message,
    isLoading,
    changeResetPasswordForm,
    changeResetEncryptForm,
    changeSignUpForm,
    pressLoginUserAccount,
    pressSignupUserAccount,
    pressResetUserPassword,
    pressUpdateUserProfile,
    pressChangeUserPassword,
    pressDeleteUserAccount,
    pressChangeEncryptPassword,
    pressRestoreEncryptKey,
    pressRegistEncryptPassword,
    pressBackupEncryptPassword,
    pressResetEncryptKey,
    pressDeleteAllProjects,
    pressClose,
  } = useContext(AccountContext);

  const [displayName, setDisplayName] = useState(user.displayName ? user.displayName : '');
  const [photoURL, setPhotoURL] = useState(user.photoURL ? user.photoURL : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');

  const styles = StyleSheet.create({
    container: {
      backgroundColor: COLOR.WHITE,
      flex: 1,
      justifyContent: 'flex-end',
    },
    message: {
      alignSelf: 'flex-end',
      justifyContent: 'space-between',
    },
    messageText: {
      color: COLOR.RED,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 60,
      width: 250,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalFrameView: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY1,
      borderRadius: 8,
      borderWidth: 1,
      //elevation: 5,
      margin: 0,
      paddingHorizontal: 35,
      paddingVertical: 25,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    modalOKCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      padding: 10,
      width: 80,
    },
    modalTextInput: {
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.BLUE,
      borderRadius: 5,
      borderWidth: 1,
      height: 40,
      marginVertical: 5,
      paddingHorizontal: 5,
      width: 250,
    },
    modalTitle: {
      color: COLOR.BLACK,
      fontSize: 20,
      marginBottom: 15,
      textAlign: 'center',
    },
    resetText: {
      alignSelf: 'flex-end',
      justifyContent: 'space-between',
      marginVertical: 5,
    },
    underline: {
      color: COLOR.BLUE,
      textDecorationLine: 'underline',
    },
  });

  useEffect(() => {
    setPassword('');
    setOldPassword('');
  }, [accountFormState]);

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={{
          alignSelf: 'flex-end',
          margin: 10,
          elevation: 5,
          zIndex: 5,
        }}
      >
        <Button name="window-close" backgroundColor={COLOR.GRAY1} onPress={pressClose} />
      </View>

      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <Image style={{ width: 60, height: 60 }} source={require('../../assets/icon.png')} />
          <Text style={styles.modalTitle}>{'EcorisMap'}</Text>
          <Text style={styles.modalTitle}>
            {accountFormState === 'loginUserAccount'
              ? `${t('Account.title.login')}`
              : accountFormState === 'resetUserPassword'
              ? `${t('Account.title.resetUserPassword')}`
              : accountFormState === 'updateUserProfile'
              ? `${t('Account.title.updateUserProfile')}`
              : accountFormState === 'changeUserPassword'
              ? `${t('Account.title.changeUserPassword')}`
              : accountFormState === 'registEncryptPassword'
              ? `${t('Account.title.registEncryptPassword')}`
              : accountFormState === 'backupEncryptPassword'
              ? `${t('Account.title.backupEncryptPassword')}`
              : accountFormState === 'restoreEncryptKey'
              ? `${t('Account.title.restoreEncryptKey')}`
              : accountFormState === 'resetEncryptKey'
              ? `${t('Account.title.resetEncryptKey')}`
              : accountFormState === 'changeEncryptPassword'
              ? `${t('Account.title.changeEncryptPassword')}`
              : accountFormState === 'deleteUserAccount'
              ? `${t('Account.title.deleteUserAccount')}`
              : accountFormState === 'deleteAllProjects'
              ? `${t('Account.title.deleteAllProjects')}`
              : `${t('Account.title.createUserAccount')}`}
          </Text>

          {(accountFormState === 'signupUserAccount' ||
            accountFormState === 'loginUserAccount' ||
            accountFormState === 'resetUserPassword') && (
            <TextInput
              style={[styles.modalTextInput, { borderColor: message === '' ? COLOR.BLUE : COLOR.RED }]}
              placeholder="email"
              placeholderTextColor={COLOR.GRAY3}
              autoComplete={'email'}
              value={email}
              onChangeText={(text) => setEmail(text)}
            />
          )}
          {(accountFormState === 'changeUserPassword' || accountFormState === 'changeEncryptPassword') && (
            <TextInput
              style={[styles.modalTextInput, { borderColor: message === '' ? COLOR.BLUE : COLOR.RED }]}
              secureTextEntry={true}
              autoComplete={'password'}
              placeholder={t('Account.placeholder.changePassword')}
              placeholderTextColor={COLOR.GRAY3}
              value={oldPassword}
              onChangeText={(text) => setOldPassword(text)}
            />
          )}
          {(accountFormState === 'loginUserAccount' ||
            accountFormState === 'signupUserAccount' ||
            accountFormState === 'changeUserPassword' ||
            accountFormState === 'deleteUserAccount' ||
            accountFormState === 'changeEncryptPassword' ||
            accountFormState === 'registEncryptPassword' ||
            accountFormState === 'backupEncryptPassword' ||
            accountFormState === 'restoreEncryptKey' ||
            accountFormState === 'resetEncryptKey' ||
            accountFormState === 'deleteAllProjects') && (
            <TextInput
              style={[styles.modalTextInput, { borderColor: message === '' ? COLOR.BLUE : COLOR.RED }]}
              secureTextEntry={true}
              autoComplete={'password'}
              placeholder={
                accountFormState === 'changeUserPassword'
                  ? t('Account.placeholder.newPassword')
                  : accountFormState === 'loginUserAccount' ||
                    accountFormState === 'signupUserAccount' ||
                    accountFormState === 'deleteUserAccount' ||
                    accountFormState === 'resetEncryptKey' ||
                    accountFormState === 'deleteAllProjects'
                  ? t('Account.placeholder.password')
                  : t('Account.placeholder.pin')
              }
              placeholderTextColor={COLOR.GRAY3}
              value={password}
              onChangeText={(text) => setPassword(text)}
            />
          )}

          {accountFormState === 'updateUserProfile' && (
            <TextInput
              style={[styles.modalTextInput, { borderColor: message === '' ? COLOR.BLUE : COLOR.RED }]}
              placeholder={t('Account.placeholder.displayName')}
              placeholderTextColor={COLOR.GRAY3}
              autoComplete={'name'}
              value={displayName}
              onChangeText={(text) => setDisplayName(text)}
            />
          )}
          {accountFormState === 'updateUserProfile' && (
            <TextInput
              style={[styles.modalTextInput, { borderColor: message === '' ? COLOR.BLUE : COLOR.RED }]}
              placeholder={t('Account.placeholder.iconURL')}
              placeholderTextColor={COLOR.GRAY3}
              value={photoURL}
              onChangeText={(text) => setPhotoURL(text)}
            />
          )}
          {message !== '' && (
            <View style={styles.message}>
              <Text style={styles.messageText}>{message}</Text>
            </View>
          )}
          {(accountFormState === 'loginUserAccount' || accountFormState === 'restoreEncryptKey') && (
            <Pressable
              style={styles.resetText}
              onPress={accountFormState === 'loginUserAccount' ? changeResetPasswordForm : changeResetEncryptForm}
            >
              <Text style={{ fontSize: 12, color: COLOR.BLUE }}>{`${t('Account.text.forgetPassword')}`}</Text>
            </Pressable>
          )}
          <Loading visible={isLoading} text="" />

          <View style={styles.modalButtonContainer}>
            {accountFormState === 'loginUserAccount' ? (
              <Pressable style={styles.resetText} onPress={changeSignUpForm}>
                <Text style={styles.underline}>{`${t('Account.text.createAccount')}`}</Text>
              </Pressable>
            ) : (
              <Text />
            )}
            <Pressable
              style={[styles.modalOKCancelButton, { backgroundColor: COLOR.BLUE }]}
              onPress={() =>
                accountFormState === 'loginUserAccount'
                  ? pressLoginUserAccount(email, password)
                  : accountFormState === 'changeUserPassword'
                  ? pressChangeUserPassword(oldPassword, password)
                  : accountFormState === 'resetUserPassword'
                  ? pressResetUserPassword(email)
                  : accountFormState === 'updateUserProfile'
                  ? pressUpdateUserProfile(displayName, photoURL)
                  : accountFormState === 'deleteUserAccount'
                  ? pressDeleteUserAccount(password)
                  : accountFormState === 'registEncryptPassword'
                  ? pressRegistEncryptPassword(password)
                  : accountFormState === 'changeEncryptPassword'
                  ? pressChangeEncryptPassword(oldPassword, password)
                  : accountFormState === 'backupEncryptPassword'
                  ? pressBackupEncryptPassword(password)
                  : accountFormState === 'restoreEncryptKey'
                  ? pressRestoreEncryptKey(password)
                  : accountFormState === 'resetEncryptKey'
                  ? pressResetEncryptKey(password)
                  : accountFormState === 'deleteAllProjects'
                  ? pressDeleteAllProjects(password)
                  : pressSignupUserAccount(email, password)
              }
            >
              <Text style={{ color: COLOR.WHITE }}>{`${t('Account.text.next')}`}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
