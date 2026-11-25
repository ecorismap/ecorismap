import React, { useContext } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { SETTINGS_BTN, VERSION } from '../../constants/AppConstants';
import { SettingsContext } from '../../contexts/Settings';
import { t } from '../../i18n/config';
import { TextButton } from '../molecules/TextButton';
import { ScrollView } from 'react-native-gesture-handler';
import { Loading } from '../molecules/Loading';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function Settings() {
  const {
    isLoading,
    //pressMapListURLOpen,
    pressFileOpen,
    pressFileSave,
    pressClearData,
    pressBackupRestoreOpen,
    pressClearCache,
    pressGotoManual,
    pressOSSLicense,
    pressVersion,
    pressPDFSettingsOpen,
    pressGPSSettingsOpen,
    pressProximityAlertSettingsOpen,
    pressLanguageSettingsOpen,
  } = useContext(SettingsContext);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
  });

  return (
    <View style={styles.container}>
      <BottomSheetHeader title={t('Settings.navigation.title')} />
      <Loading visible={isLoading} text="" />
      <ScrollView>
        {/* データ管理 */}
        <TextButton testID="settings-file-open" name={SETTINGS_BTN.FILE_OPEN} text={t('Settings.file_open.text')} onPress={pressFileOpen} />
        <TextButton testID="settings-file-save" name={SETTINGS_BTN.FILE_SAVE} text={t('Settings.file_save.text')} onPress={pressFileSave} />
        <TextButton testID="settings-pdf" name={SETTINGS_BTN.PDF_SAVE} text={t('Settings.pdf_save.text')} onPress={pressPDFSettingsOpen} />
        <TextButton testID="settings-clear-data" name={SETTINGS_BTN.FILE_NEW} text={t('Settings.file_new.text')} onPress={pressClearData} />
        {Platform.OS !== 'web' && (
          <TextButton
            testID="settings-backup-restore"
            name={SETTINGS_BTN.BACKUP_RESTORE}
            text={t('Settings.backup_restore.text')}
            onPress={pressBackupRestoreOpen}
          />
        )}

        {/* アプリ設定 */}
        {/* Webの測位はブラウザ任せで精度の設定が効かず、外部GNSSも無いので出さない（設定監査 S-L6） */}
        {Platform.OS !== 'web' && (
          <TextButton
            testID="settings-gps"
            name={SETTINGS_BTN.GPS_SETTINGS}
            text={t('Settings.gps_settings.text')}
            onPress={pressGPSSettingsOpen}
          />
        )}
        {Platform.OS !== 'web' && (
          <TextButton
            testID="settings-proximity-alert"
            name={SETTINGS_BTN.PROXIMITY_ALERT}
            text={t('Settings.proximity_alert.text')}
            onPress={pressProximityAlertSettingsOpen}
          />
        )}
        <TextButton testID="settings-clear-cache" name={SETTINGS_BTN.CACHE_DELETE} text={t('Settings.cachedelete.text')} onPress={pressClearCache} />
        <TextButton
          testID="settings-language"
          name={SETTINGS_BTN.LANGUAGE}
          text={t('Settings.language.text')}
          onPress={pressLanguageSettingsOpen}
        />

        {/* 情報・ヘルプ */}
        <TextButton
          testID="settings-manual"
          name={SETTINGS_BTN.MANUAL}
          text={t('Settings.manual.text')}
          isExternalLink
          onPress={pressGotoManual}
        />
        <TextButton testID="settings-oss-license" name={SETTINGS_BTN.OSSLICENSE} text={t('Settings.OSSLicense.txt')} onPress={pressOSSLicense} />

        <TextButton testID="settings-version" name={SETTINGS_BTN.VERSION} text={VERSION} isExternalLink onPress={pressVersion} />
      </ScrollView>
    </View>
  );
}
