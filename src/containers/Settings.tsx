import React, { useCallback, useState } from 'react';
import Settings from '../components/pages/Settings';
import { Props_Settings } from '../routes';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DEFAULT_MAP_LIST_URL, PHOTO_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { Linking, Platform } from 'react-native';
import { t } from '../i18n/config';
import { useMaps } from '../hooks/useMaps';
import { SettingsContext } from '../contexts/Settings';
import * as DocumentPicker from 'expo-document-picker';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';
import { getExt } from '../utils/General';
import { exportGeoFile } from '../utils/File';
import sanitize from 'sanitize-filename';
import { usePermission } from '../hooks/usePermission';
import { SettingsModalFileSave } from '../components/organisms/SettingsModalFileSave';
import { SettingsModalGPS } from '../components/organisms/SettingsModalGPS';
import { SettingsModalMapListURL } from '../components/organisms/SettingsModalMapListURL';
import { editSettingsAction } from '../modules/settings';
import { GpsAccuracyType } from '../types';

export default function SettingsContainers({ navigation }: Props_Settings) {
  const dispatch = useDispatch();
  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector((state: RootState) => state.dataSet);
  const maps = useSelector((state: RootState) => state.tileMaps);
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const { clearEcorisMap, generateEcorisMapData, openEcorisMapFile, createExportSettings } = useEcorisMapFile();
  const { mapListURL, saveMapListURL, clearTileCache } = useMaps();

  const [isMapListURLOpen, setIsMapListURLOpen] = useState(false);
  const [isGPSSettingsOpen, setIsGPSSettingsOpen] = useState(false);
  const [isFileSaveOpen, setIsFileSaveOpen] = useState(false);
  const { isRunningProject } = usePermission();
  const [isLoading, setIsLoading] = useState(false);

  const pressPDFSettingsOpen = useCallback(async () => {
    navigation.navigate('Home', {
      previous: 'Settings',
      mode: 'exportPDF',
    });
  }, [navigation]);

  const pressFileSave = useCallback(async () => {
    // if (isRunningProject) {
    //   //ToDo バックアップできた方がいいかも？もしくは裏で自動
    //   await AlertAsync(t('hooks.message.cannotInRunningProject'));
    //   return;
    // }
    setIsFileSaveOpen(true);
  }, []);

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
        await AlertAsync(t('Settings.alert.loadEcorisMapFile'));
        navigation.navigate('Home', {
          jumpTo: region,
          previous: 'Settings',
          mode: 'openEcorisMap',
        });
      }
    }
  }, [isRunningProject, navigation, openEcorisMapFile]);

  const pressClearData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.fileNew'));
    if (ret) {
      const { isOK, message } = await clearEcorisMap();

      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Home', { previous: 'Settings', mode: 'clearEcorisMap' });
      }
    }
  }, [clearEcorisMap, navigation]);

  // const pressResetAll = useCallback(async () => {
  //   const ret = await ConfirmAsync(t('Settings.confirm.clearLocalStorage'));
  //   if (ret) {
  //     await clearCacheData();
  //     persistor.purge();
  //     await Updates.reloadAsync();
  //   }
  // }, []);

  const pressClearTileCache = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.clearTileCache'));
    if (ret) {
      await clearTileCache();
      await AlertAsync(t('Settings.alert.clearTileCache'));
    }
  }, [clearTileCache]);

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

  const pressGPSSettingsOpen = useCallback(() => {
    setIsGPSSettingsOpen(true);
  }, []);

  const pressGPSSettingsOK = useCallback(
    (value: GpsAccuracyType) => {
      dispatch(editSettingsAction({ gpsAccuracy: value }));
      setIsGPSSettingsOpen(false);
    },
    [dispatch]
  );

  const pressGPSSettingsCancel = useCallback(() => {
    setIsGPSSettingsOpen(false);
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

  const pressVersion = useCallback(async () => {
    const url = t('site.changelog');
    Linking.openURL(url);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        isLoading,
        pressMapListURLOpen,
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
      }}
    >
      <Settings />
      <SettingsModalFileSave visible={isFileSaveOpen} pressOK={pressFileSaveOK} pressCancel={pressFileSaveCancel} />
      <SettingsModalGPS
        visible={isGPSSettingsOpen}
        gpsAccuracy={gpsAccuracy}
        pressOK={pressGPSSettingsOK}
        pressCancel={pressGPSSettingsCancel}
      />
      <SettingsModalMapListURL
        visible={isMapListURLOpen}
        mapListURL={mapListURL}
        pressOK={pressMapListURLOK}
        pressCancel={pressMapListURLCancel}
        pressReset={pressMapListURLReset}
      />
    </SettingsContext.Provider>
  );
}
