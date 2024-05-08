import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { FUNC_LOGIN, SETTINGS_BTN, VERSION } from '../../constants/AppConstants';
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
    pressClearTileCache,
    pressClearPhotoCache,
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

  const headerLeftButton = useCallback(() => <></>, []);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => headerLeftButton(),
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <Loading visible={isLoading} text="" />
      <ScrollView>
        <TextButton
          name={SETTINGS_BTN.PDF_SAVE}
          text={t('Settings.pdf_save.text')}
          info={t('Settings.pdf_save.info')}
          onPress={pressPDFSettingsOpen}
        />
        <TextButton
          name={SETTINGS_BTN.FILE_SAVE}
          text={t('Settings.file_save.text')}
          info={t('Settings.file_save.info')}
          onPress={pressFileSave}
        />
        <TextButton
          name={SETTINGS_BTN.FILE_OPEN}
          text={t('Settings.file_open.text')}
          info={t('Settings.file_open.info')}
          onPress={pressFileOpen}
        />
        <TextButton
          name={SETTINGS_BTN.FILE_NEW}
          text={t('Settings.file_new.text')}
          info={t('Settings.file_new.info')}
          onPress={pressClearData}
        />
        <TextButton
          name={SETTINGS_BTN.GPS_SETTINGS}
          text={t('Settings.gps_settings.text')}
          info={t('Settings.gps_settings.info')}
          onPress={pressGPSSettingsOpen}
        />
        {/* <TextButton
          name={SETTINGS_BTN.MAP_LIST_URL}
          text={t('Settings.maplisturl.text')}
          info={t('Settings.maplisturl.info')}
          onPress={pressMapListURLOpen}
        /> */}
        {Platform.OS !== 'web' && (
          <TextButton
            name={SETTINGS_BTN.MAP_CACHE_DELETE}
            text={t('Settings.mapcachedelete.text')}
            info={t('Settings.mapcachedelete.info')}
            onPress={pressClearTileCache}
          />
        )}

        {FUNC_LOGIN && Platform.OS !== 'web' && (
          <TextButton
            name={SETTINGS_BTN.PHOTO_CACHE_DELETE}
            text={t('Settings.photocachedelete.text')}
            info={t('Settings.photocachedelete.info')}
            onPress={pressClearPhotoCache}
          />
        )}

        <TextButton
          name={SETTINGS_BTN.OSSLICENSE}
          text={t('Settings.OSSLicense.txt')}
          info={t('Settings.OSSLicense.info')}
          onPress={pressOSSLicense}
        />
        <TextButton
          name={SETTINGS_BTN.MANUAL}
          text={t('Settings.manual.text')}
          info={t('Settings.manual.info')}
          onPress={pressGotoManual}
        />
        <TextButton
          name={SETTINGS_BTN.VERSION}
          text={VERSION}
          info={t('Settings.version.info')}
          onPress={pressVersion}
        />
      </ScrollView>
    </View>
  );
}
