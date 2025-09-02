import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { FUNC_LOGIN, SETTINGS_BTN, VERSION, COLOR } from '../../constants/AppConstants';
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
    pressExportDebugLog,
    pressClearDebugLog,
  } = useContext(SettingsContext);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
  });

  const navigation = useNavigation();

  const customHeader = useCallback(
    () => (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 63, backgroundColor: COLOR.MAIN }}>
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
        <TextButton name={SETTINGS_BTN.PDF_SAVE} text={t('Settings.pdf_save.text')} onPress={pressPDFSettingsOpen} />
        <TextButton name={SETTINGS_BTN.FILE_SAVE} text={t('Settings.file_save.text')} onPress={pressFileSave} />
        <TextButton name={SETTINGS_BTN.FILE_OPEN} text={t('Settings.file_open.text')} onPress={pressFileOpen} />
        <TextButton name={SETTINGS_BTN.FILE_NEW} text={t('Settings.file_new.text')} onPress={pressClearData} />
        <TextButton
          name={SETTINGS_BTN.GPS_SETTINGS}
          text={t('Settings.gps_settings.text')}
          onPress={pressGPSSettingsOpen}
        />
        {/* <TextButton
          name={SETTINGS_BTN.MAP_LIST_URL}
          text={t('Settings.maplisturl.text')}
          info={t('Settings.maplisturl.info')}
          onPress={pressMapListURLOpen}
        /> */}

        <TextButton
          name={SETTINGS_BTN.MAP_CACHE_DELETE}
          text={t('Settings.mapcachedelete.text')}
          onPress={pressClearTileCache}
        />

        {FUNC_LOGIN && Platform.OS !== 'web' && (
          <TextButton
            name={SETTINGS_BTN.PHOTO_CACHE_DELETE}
            text={t('Settings.photocachedelete.text')}
            onPress={pressClearPhotoCache}
          />
        )}

        <TextButton name={SETTINGS_BTN.OSSLICENSE} text={t('Settings.OSSLicense.txt')} onPress={pressOSSLicense} />
        <TextButton name={SETTINGS_BTN.MANUAL} text={t('Settings.manual.text')} onPress={pressGotoManual} />
        
        {/* デバッグログ関連 */}
        <TextButton 
          name="EXPORT_DEBUG_LOG" 
          text="Export Debug Log" 
          onPress={pressExportDebugLog} 
        />
        <TextButton 
          name="CLEAR_DEBUG_LOG" 
          text="Clear Debug Log" 
          onPress={pressClearDebugLog} 
        />
        
        <TextButton name={SETTINGS_BTN.VERSION} text={VERSION} onPress={pressVersion} />
      </ScrollView>
    </View>
  );
}
