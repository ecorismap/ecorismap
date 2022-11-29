import React, { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';
import Settings from '../components/pages/Settings';
import { Props_Settings } from '../routes';
import { persistor } from '../store';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DEFAULT_MAP_LIST_URL, PHOTO_FOLDER, TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { Linking, Platform } from 'react-native';
import { t } from '../i18n/config';
import { useMaps } from '../hooks/useMaps';
import { clearCacheData } from '../utils/File';
import { useLayers } from '../hooks/useLayers';

export default function SettingsContainers({ navigation }: Props_Settings) {
  const { createNewEcorisMap, saveEcorisMapFile, loadEcorisMapFile } = useLayers();
  const { mapListURL, saveMapListURL } = useMaps();
  const [isMapListURLOpen, setIsMapListURLOpen] = useState(false);
  const [isFileSaveOpen, setIsFileSaveOpen] = useState(false);

  const pressFileNew = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.fileNew'));
    if (ret) {
      const { isOK, message } = await createNewEcorisMap();
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Home');
      }
    }
  }, [createNewEcorisMap, navigation]);

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
      const { isOK, message } = await loadEcorisMapFile();
      if (!isOK && message !== '') {
        await AlertAsync(message);
      } else if (isOK) {
        await AlertAsync(t('Settings.alert.loadEcorisMapFile'));
      }
    }
  }, [loadEcorisMapFile]);

  const pressResetAll = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.clearLocalStorage'));
    if (ret) {
      await clearCacheData();
      persistor.purge();
      await Updates.reloadAsync();
    }
  }, []);

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

  const pressClearPhotoCache = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const ret = await ConfirmAsync(t('Settings.confirm.clearPhotoCache'));
    if (ret) {
      const { uri } = await FileSystem.getInfoAsync(PHOTO_FOLDER);
      if (uri) {
        // console.log(uri);
        await FileSystem.deleteAsync(uri);
      }
      await AlertAsync(t('Settings.alert.clearPhotoCache'));
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
    <Settings
      mapListURL={mapListURL}
      isMapListURLOpen={isMapListURLOpen}
      isFileSaveOpen={isFileSaveOpen}
      pressMapListURLOpen={pressMapListURLOpen}
      pressMapListURLOK={pressMapListURLOK}
      pressMapListURLCancel={pressMapListURLCancel}
      pressMapListURLReset={pressMapListURLReset}
      pressFileNew={pressFileNew}
      pressFileOpen={pressFileOpen}
      pressFileSave={pressFileSave}
      pressFileSaveOK={pressFileSaveOK}
      pressFileSaveCancel={pressFileSaveCancel}
      pressClearTileCache={pressClearTileCache}
      pressClearPhotoCache={pressClearPhotoCache}
      pressResetAll={pressResetAll}
      pressGotoManual={pressGotoManual}
      pressOSSLicense={pressOSSLicense}
      pressVersion={pressVersion}
    />
  );
}
