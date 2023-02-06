import React, { useContext } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { SETTINGS_BTN, VERSION } from '../../constants/AppConstants';
import { SettingsContext } from '../../contexts/Settings';
import { t } from '../../i18n/config';
import { TextButton } from '../molecules/TextButton';
import { SettingsModalFileSave } from '../organisms/SettingsModalFileSave';
import { SettingsModalMapListURL } from '../organisms/SettingsModalMapListURL';

export default function Settings() {
  const {
    mapListURL,
    isMapListURLOpen,
    isFileSaveOpen,
    pressMapListURLOpen,
    pressMapListURLOK,
    pressMapListURLCancel,
    pressMapListURLReset,
    pressFileOpen,
    pressFileSave,
    pressFileSaveOK,
    pressFileSaveCancel,
    pressClearData,
    pressClearTileCache,
    pressResetAll,
    pressGotoManual,
    pressOSSLicense,
    pressVersion,
  } = useContext(SettingsContext);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView>
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
          name={SETTINGS_BTN.MAP_LIST_URL}
          text={t('Settings.maplisturl.text')}
          info={t('Settings.maplisturl.info')}
          onPress={pressMapListURLOpen}
        />
        {Platform.OS !== 'web' && (
          <TextButton
            name={SETTINGS_BTN.MAP_CACHE_DELETE}
            text={t('Settings.mapcachedelete.text')}
            info={t('Settings.mapcachedelete.info')}
            onPress={pressClearTileCache}
          />
        )}

        {Platform.OS !== 'web' && (
          <TextButton
            name={SETTINGS_BTN.APRI_CLEAR}
            text={t('Settings.apriclear.text')}
            info={t('Settings.apriclear.info')}
            onPress={pressResetAll}
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
      <SettingsModalMapListURL
        visible={isMapListURLOpen}
        mapListURL={mapListURL}
        pressOK={pressMapListURLOK}
        pressCancel={pressMapListURLCancel}
        pressReset={pressMapListURLReset}
      />
      <SettingsModalFileSave visible={isFileSaveOpen} pressOK={pressFileSaveOK} pressCancel={pressFileSaveCancel} />
    </View>
  );
}
