import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SETTINGS_BTN, VERSION, COLOR } from '../../constants/AppConstants';
import { SettingsContext } from '../../contexts/Settings';
import { t } from '../../i18n/config';
import { TextButton } from '../molecules/TextButton';
import { ScrollView } from 'react-native-gesture-handler';
import { Loading } from '../molecules/Loading';
import { useNavigation } from '@react-navigation/native';

export default function Settings() {
  const {
    isLoading,
    //pressMapListURLOpen,
    pressFileOpen,
    pressFileSave,
    pressClearData,
    pressClearCache,
    pressGotoManual,
    pressOSSLicense,
    pressVersion,
    pressPDFSettingsOpen,
    pressGPSSettingsOpen,
  } = useContext(SettingsContext);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
  });

  const navigation = useNavigation();

  const customHeader = useCallback(
    () => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          height: 63,
          backgroundColor: COLOR.MAIN,
        }}
      >
        <Text style={{ fontSize: 16 }}>{t('Settings.navigation.title')}</Text>
      </View>
    ),
    []
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      <Loading visible={isLoading} text="" />
      <ScrollView>
        {/* データ管理 */}
        <TextButton name={SETTINGS_BTN.FILE_OPEN} text={t('Settings.file_open.text')} onPress={pressFileOpen} />
        <TextButton name={SETTINGS_BTN.FILE_SAVE} text={t('Settings.file_save.text')} onPress={pressFileSave} />
        <TextButton name={SETTINGS_BTN.PDF_SAVE} text={t('Settings.pdf_save.text')} onPress={pressPDFSettingsOpen} />
        <TextButton name={SETTINGS_BTN.FILE_NEW} text={t('Settings.file_new.text')} onPress={pressClearData} />

        {/* アプリ設定 */}
        <TextButton
          name={SETTINGS_BTN.GPS_SETTINGS}
          text={t('Settings.gps_settings.text')}
          onPress={pressGPSSettingsOpen}
        />
        <TextButton name={SETTINGS_BTN.CACHE_DELETE} text={t('Settings.cachedelete.text')} onPress={pressClearCache} />

        {/* 情報・ヘルプ */}
        <TextButton name={SETTINGS_BTN.MANUAL} text={t('Settings.manual.text')} onPress={pressGotoManual} />
        <TextButton name={SETTINGS_BTN.OSSLICENSE} text={t('Settings.OSSLicense.txt')} onPress={pressOSSLicense} />

        <TextButton name={SETTINGS_BTN.VERSION} text={VERSION} onPress={pressVersion} />
      </ScrollView>
    </View>
  );
}
