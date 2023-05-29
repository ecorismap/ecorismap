import React, { useCallback, useState } from 'react';
import Settings from '../components/pages/Settings';
import { Props_Settings } from '../routes';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DEFAULT_MAP_LIST_URL, PHOTO_FOLDER, TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { Linking, Platform } from 'react-native';
import { t } from '../i18n/config';
import { useMaps } from '../hooks/useMaps';
import { SettingsContext } from '../contexts/Settings';
import * as DocumentPicker from 'expo-document-picker';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';
import { getExt } from '../utils/General';
import { exportGeoFile } from '../utils/File';
import sanitize from 'sanitize-filename';
import { usePermission } from '../hooks/usePermission';

export default function SettingsContainers({ navigation }: Props_Settings) {
  const layers = useSelector((state: AppState) => state.layers);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const maps = useSelector((state: AppState) => state.tileMaps);
  const tracking = useSelector((state: AppState) => state.settings.tracking);
  const { clearEcorisMap, generateEcorisMapData, openEcorisMapFile, createExportSettings } = useEcorisMapFile();
  const { mapListURL, saveMapListURL } = useMaps();
  const [isMapListURLOpen, setIsMapListURLOpen] = useState(false);
  const [isFileSaveOpen, setIsFileSaveOpen] = useState(false);
  const { isRunningProject } = usePermission();

  const pressFileSave = useCallback(async () => {
    // if (isRunningProject) {
    //   //ToDo バックアップできた方がいいかも？もしくは裏で自動
    //   await AlertAsync(t('hooks.message.cannotInRunningProject'));
    //   return;
    // }
    if (tracking !== undefined) {
      await AlertAsync(t('hooks.message.cannotLoadDataInTrackking'));
      return;
    }
    setIsFileSaveOpen(true);
  }, [tracking]);

  const pressFileSaveCancel = useCallback(() => {
    setIsFileSaveOpen(false);
  }, []);

  const pressFileSaveOK = useCallback(
    async (fileName: string, includePhoto: boolean) => {
      if (sanitize(fileName) === '') {
        await AlertAsync(t('hooks.message.inputCorrectFilename'));
        return;
      }

      const data = { dataSet, layers, settings: createExportSettings(), maps };
      const exportData = await generateEcorisMapData(data, { includePhoto, fromProject: false, includeGISData: false });
      const isOK = await exportGeoFile(exportData, fileName, 'ecorismap');
      if (!isOK) {
        await AlertAsync(t('hooks.message.failSaveFile'));
      }

      setIsFileSaveOpen(false);
    },
    [createExportSettings, dataSet, generateEcorisMapData, layers, maps]
  );

  const pressFileOpen = useCallback(async () => {
    if (isRunningProject) {
      await AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    if (tracking !== undefined) {
      await AlertAsync(t('hooks.message.cannotLoadDataInTrackking'));
      return;
    }
    const ret = await ConfirmAsync(t('Settings.confirm.fileOpen'));
    if (ret) {
      const file = await DocumentPicker.getDocumentAsync({});
      if (file.type === 'cancel') {
        return;
      }
      const ext = getExt(file.name);
      if (!(ext?.toLowerCase() === 'ecorismap' || ext?.toLowerCase() === 'zip')) {
        await AlertAsync(t('hooks.message.wrongExtension'));
        return;
      }

      const { isOK, message } = await openEcorisMapFile(file.uri);
      if (!isOK && message !== '') {
        await AlertAsync(message);
      } else if (isOK) {
        await AlertAsync(t('Settings.alert.loadEcorisMapFile'));
      }
    }
  }, [isRunningProject, openEcorisMapFile, tracking]);

  const pressClearData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.fileNew'));
    if (ret) {
      if (tracking !== undefined) {
        return { isOK: false, message: t('hooks.message.cannotInTracking') };
      }
      const { isOK, message } = await clearEcorisMap();
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Home');
      }
    }
  }, [clearEcorisMap, navigation, tracking]);

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
        pressClearPhotoCache,
        pressGotoManual,
        pressOSSLicense,
        pressVersion,
      }}
    >
      <Settings />
    </SettingsContext.Provider>
  );
}
