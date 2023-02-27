import React, { useCallback, useState } from 'react';
import Settings from '../components/pages/Settings';
import { Props_Settings } from '../routes';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DEFAULT_MAP_LIST_URL, TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { Linking, Platform } from 'react-native';
import { t } from '../i18n/config';
import { useMaps } from '../hooks/useMaps';
import { SettingsContext } from '../contexts/Settings';
import * as DocumentPicker from 'expo-document-picker';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';

export default function SettingsContainers({ navigation }: Props_Settings) {
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const { createNewEcorisMap, saveEcorisMapFile, loadEcorisMapFile } = useEcorisMapFile();
  const { mapListURL, saveMapListURL } = useMaps();
  const [isMapListURLOpen, setIsMapListURLOpen] = useState(false);
  const [isFileSaveOpen, setIsFileSaveOpen] = useState(false);

  const pressFileSave = useCallback(async () => {
    setIsFileSaveOpen(true);
  }, []);

  const pressFileSaveCancel = useCallback(() => {
    setIsFileSaveOpen(false);
  }, []);

  const pressFileSaveOK = useCallback(
    async (fileName: string, includePhoto: boolean) => {
      const { isOK, message } = await saveEcorisMapFile(fileName, includePhoto);
      if (!isOK) {
        await AlertAsync(message);
      }
      setIsFileSaveOpen(false);
    },
    [saveEcorisMapFile]
  );

  const pressFileOpen = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.fileOpen'));
    if (ret) {
      if (tracking !== undefined) {
        await AlertAsync(t('hooks.message.cannotLoadDataInTrackking'));
        return;
      }
      const file = await DocumentPicker.getDocumentAsync({});
      if (file.type === 'cancel') {
        return;
      }
      const { isOK, message } = await loadEcorisMapFile(file.uri, file.name, file.size);
      if (!isOK && message !== '') {
        await AlertAsync(message);
      } else if (isOK) {
        await AlertAsync(t('Settings.alert.loadEcorisMapFile'));
      }
    }
  }, [loadEcorisMapFile, tracking]);

  const pressClearData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.fileNew'));
    if (ret) {
      if (tracking !== undefined) {
        return { isOK: false, message: t('hooks.message.cannotInTracking') };
      }
      const { isOK, message } = await createNewEcorisMap();
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Home');
      }
    }
  }, [createNewEcorisMap, navigation, tracking]);

  // const pressResetAll = useCallback(async () => {
  //   const ret = await ConfirmAsync(t('Settings.confirm.clearLocalStorage'));
  //   if (ret) {
  //     await clearCacheData();
  //     persistor.purge();
  //     await Updates.reloadAsync();
  //   }
  // }, []);

  const pressClearTileCache = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const ret = await ConfirmAsync(t('Settings.confirm.clearTileCache'));
    if (ret) {
      const { uri } = await FileSystem.getInfoAsync(TILE_FOLDER);
      if (uri) {
        await FileSystem.deleteAsync(uri);
      }
      await AlertAsync(t('Settings.alert.clearTileCache'));
    }
  }, []);

  const pressMapListURLOK = useCallback(
    (url: string) => {
      saveMapListURL(url);
      setIsMapListURLOpen(false);
    },
    [saveMapListURL]
  );

  const pressMapListURLCancel = useCallback(() => {
    setIsMapListURLOpen(false);
  }, []);

  const pressMapListURLReset = useCallback(() => {
    saveMapListURL(DEFAULT_MAP_LIST_URL);
    setIsMapListURLOpen(false);
  }, [saveMapListURL]);

  const pressMapListURLOpen = useCallback(() => {
    setIsMapListURLOpen(true);
  }, []);

  const pressGotoManual = useCallback(() => {
    const url = t('site.manual');
    Linking.openURL(url);
  }, []);

  const pressOSSLicense = useCallback(() => {
    navigation.navigate('Licenses', {
      previous: 'Settings',
    });
  }, [navigation]);

  const pressVersion = useCallback(() => {
    const url = t('site.changelog');
    Linking.openURL(url);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
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
        pressGotoManual,
        pressOSSLicense,
        pressVersion,
      }}
    >
      <Settings />
    </SettingsContext.Provider>
  );
}
