import React, { useCallback, useMemo, useState } from 'react';
import Settings from '../components/pages/Settings';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { DEFAULT_MAP_LIST_URL, PHOTO_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system/legacy';
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
import { usePermission } from '../hooks/usePermission';
import { SettingsModalGPS } from '../components/organisms/SettingsModalGPS';
import { SettingsModalMapListURL } from '../components/organisms/SettingsModalMapListURL';
import { SettingsModalProximityAlert } from '../components/organisms/SettingsModalProximityAlert';
import { editSettingsAction } from '../modules/settings';
import { GpsAccuracyType, ProximityAlertSettingsType } from '../types';
import { selectNonDeletedDataSet } from '../modules/selectors';
import dayjs from '../i18n/dayjs';

export default function SettingsContainers() {
  const { navigate, navigateToHome } = useBottomSheetNavigation();
  const dispatch = useDispatch();
  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const maps = useSelector((state: RootState) => state.tileMaps);
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const proximityAlert = useSelector((state: RootState) => state.settings.proximityAlert ?? {
    enabled: false,
    targetLayerIds: [],
    distanceThreshold: 10,
  });
  const { clearEcorisMap, generateEcorisMapData, openEcorisMapFile, createExportSettings } = useEcorisMapFile();
  const { mapListURL, saveMapListURL, clearTileCache } = useMaps();

  const [isMapListURLOpen, setIsMapListURLOpen] = useState(false);
  const [isGPSSettingsOpen, setIsGPSSettingsOpen] = useState(false);
  const [isProximityAlertSettingsOpen, setIsProximityAlertSettingsOpen] = useState(false);

  // ポイントレイヤーのみ抽出
  const pointLayers = useMemo(() => layers.filter((l) => l.type === 'POINT'), [layers]);
  const { isRunningProject } = usePermission();
  const [isLoading, setIsLoading] = useState(false);

  const pressPDFSettingsOpen = useCallback(async () => {
    navigateToHome?.({
      previous: 'Settings',
      mode: 'exportPDF',
    });
  }, [navigateToHome]);

  const pressFileSave = useCallback(async () => {
    // if (isRunningProject) {
    //   //ToDo バックアップできた方がいいかも？もしくは裏で自動
    //   await AlertAsync(t('hooks.message.cannotInRunningProject'));
    //   return;
    // }
    
    // 写真を常に含める（確認なし）
    const includePhoto = true;
    
    setIsLoading(true);
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const fileName = `ecorismap_${time}`;
    const data = { dataSet, layers, settings: createExportSettings(), maps };
    const exportData = await generateEcorisMapData(data, { includePhoto, fromProject: false });
    const isOK = await exportGeoFile(exportData, fileName, 'zip');
    setIsLoading(false);
    if (!isOK) {
      await AlertAsync(t('hooks.message.failSaveFile'));
    } else {
      await AlertAsync(t('hooks.message.successSaveFile'));
    }
  }, [createExportSettings, dataSet, generateEcorisMapData, layers, maps]);;

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
      if (!(ext?.toLowerCase() === 'zip' || ext?.toLowerCase() === 'ecorismap')) {
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
        navigateToHome?.({
          jumpTo: region,
          previous: 'Settings',
          mode: 'openEcorisMap',
        });
      }
    }
  }, [isRunningProject, navigateToHome, openEcorisMapFile]);

  const pressClearData = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.fileNew'));
    if (ret) {
      const { isOK, message } = await clearEcorisMap();

      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigateToHome?.({ previous: 'Settings', mode: 'clearEcorisMap' });
      }
    }
  }, [clearEcorisMap, navigateToHome]);

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

  const pressClearCache = useCallback(async () => {
    const ret = await ConfirmAsync(t('Settings.confirm.clearCache'));
    if (ret) {
      setIsLoading(true);
      try {
        // 地図キャッシュをクリア
        await clearTileCache();
        
        // 写真キャッシュをクリア（モバイルのみ）
        if (Platform.OS !== 'web') {
          const { uri } = await FileSystem.getInfoAsync(PHOTO_FOLDER);
          if (uri) {
            await FileSystem.deleteAsync(uri);
          }
        }
        
        await AlertAsync(t('Settings.alert.clearCache'));
      } catch (error) {
        console.error('Error clearing cache:', error);
        await AlertAsync(t('Settings.alert.clearCacheError'));
      } finally {
        setIsLoading(false);
      }
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

  const pressProximityAlertSettingsOpen = useCallback(() => {
    setIsProximityAlertSettingsOpen(true);
  }, []);

  const pressProximityAlertSettingsOK = useCallback(
    (value: ProximityAlertSettingsType) => {
      dispatch(editSettingsAction({ proximityAlert: value }));
      setIsProximityAlertSettingsOpen(false);
    },
    [dispatch]
  );

  const pressProximityAlertSettingsCancel = useCallback(() => {
    setIsProximityAlertSettingsOpen(false);
  }, []);

  const pressGotoManual = useCallback(() => {
    const url = t('site.manual');
    Linking.openURL(url);
  }, []);

  const pressOSSLicense = useCallback(() => {
    navigate('Licenses', {
      previous: 'Settings',
    });
  }, [navigate]);

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
        pressClearCache,
        pressGotoManual,
        pressOSSLicense,
        pressVersion,
        pressPDFSettingsOpen,
        pressGPSSettingsOpen,
        pressProximityAlertSettingsOpen,
      }}
    >
      <Settings />
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
      <SettingsModalProximityAlert
        visible={isProximityAlertSettingsOpen}
        proximityAlert={proximityAlert}
        pointLayers={pointLayers}
        pressOK={pressProximityAlertSettingsOK}
        pressCancel={pressProximityAlertSettingsCancel}
      />
    </SettingsContext.Provider>
  );
}
