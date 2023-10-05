import React, { useCallback, useState } from 'react';
import Settings from '../components/pages/Settings';
import { Props_Settings } from '../routes';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DEFAULT_MAP_LIST_URL } from '../constants/AppConstants';
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
  const { clearTileCache } = useMaps();
  const { mapListURL, saveMapListURL } = useMaps();
  const [isMapListURLOpen, setIsMapListURLOpen] = useState(false);
  const [isFileSaveOpen, setIsFileSaveOpen] = useState(false);
  const { isRunningProject } = usePermission();
  const [isLoading, setIsLoading] = useState(false);

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
      const exportData = await generateEcorisMapData(data, { includePhoto, fromProject: false, includeGISData: true });
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
      if (file.assets === null) return;

      const ext = getExt(file.assets[0].name);
      if (!(ext?.toLowerCase() === 'ecorismap' || ext?.toLowerCase() === 'zip')) {
        await AlertAsync(t('hooks.message.wrongExtension'));
        return;
      }
      setIsLoading(true);
      const { isOK, message, region } = await openEcorisMapFile(file.assets[0].uri);
      setIsLoading(false);
      if (!isOK && message !== '') {
        await AlertAsync(message);
      } else if (isOK) {
        //await AlertAsync(t('Settings.alert.loadEcorisMapFile'));
        navigation.navigate('Home', {
          jumpTo: region,
          previous: 'Settings',
        });
      }
    }
  }, [isRunningProject, navigation, openEcorisMapFile, tracking]);

  const pressClearData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.fileNew'));
    if (ret) {
      if (tracking !== undefined) {
        return { isOK: false, message: t('hooks.message.cannotInTracking') };
      }
      setIsLoading(true);
      const { isOK, message } = await clearEcorisMap();
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Home', { previous: 'Settings' });
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
      await clearTileCache();
      await AlertAsync(t('Settings.alert.clearTileCache'));
    }
  }, [clearTileCache]);

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
        isLoading,
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
