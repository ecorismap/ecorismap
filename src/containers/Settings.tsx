import React, { useCallback, useMemo, useState } from 'react';
import Settings from '../components/pages/Settings';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { AlertAsync, ConfirmAsync, waitForModalTransition } from '../components/molecules/AlertAsync';
import { DEFAULT_MAP_LIST_URL, PHOTO_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system/legacy';
import { Linking, Platform } from 'react-native';
import { t } from '../i18n/config';
import { useMaps } from '../hooks/useMaps';
import { SettingsContext } from '../contexts/Settings';
import * as DocumentPicker from 'expo-document-picker';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { RootState } from '../store';
import { saveProjectBackup } from '../utils/projectBackup';
import { useProjectBackup } from '../hooks/useProjectBackup';
import { SettingsModalBackupSelect } from '../components/organisms/SettingsModalBackupSelect';
import { useEcorisMapFile } from '../hooks/useEcorismapFile';
import { getExt } from '../utils/General';
import { exportGeoFile } from '../utils/File';
import { usePermission } from '../hooks/usePermission';
import { SettingsModalMapListURL } from '../components/organisms/SettingsModalMapListURL';
import { SettingsModalProximityAlert } from '../components/organisms/SettingsModalProximityAlert';
import { SettingsModalStorageSelect, StorageSelectChoice } from '../components/organisms/SettingsModalStorageSelect';
import { SettingsModalLanguageSelect } from '../components/organisms/SettingsModalLanguageSelect';
import { getStoredLanguage, setStoredLanguage } from '../utils/appLanguage';
import { editSettingsAction } from '../modules/settings';
import { AppLanguageType, ProximityAlertSettingsType } from '../types';
import { selectNonDeletedDataSet } from '../modules/selectors';
import dayjs from '../i18n/dayjs';
import { replaceDataWithTrackingGuard } from '../utils/trackingLeaveGuard';

const alertRestoreFailed = async (reason: 'differentUser' | undefined) => {
  await AlertAsync(
    reason === 'differentUser' ? t('Settings.alert.restoreBackupDifferentUser') : t('Settings.alert.restoreBackupFailed')
  );
};

export default function SettingsContainers() {
  const { navigate, navigateToHome } = useBottomSheetNavigation();
  const dispatch = useDispatch();
  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const maps = useSelector((state: RootState) => state.tileMaps);
  const proximityAlert = useSelector((state: RootState) => state.settings.proximityAlert ?? {
    enabled: false,
    targetLayerIds: [],
    distanceThreshold: 10,
  });
  const { clearEcorisMap, generateEcorisMapData, openEcorisMapFile, createExportSettings } = useEcorisMapFile();
  const { mapListURL, saveMapListURL, clearTileCache } = useMaps();
  const store = useStore<RootState>();
  const { backupList, refreshBackupList, canRestoreBackup, restoreBackup, deleteBackup, clearAllBackups } =
    useProjectBackup();

  const [isMapListURLOpen, setIsMapListURLOpen] = useState(false);
  const [isProximityAlertSettingsOpen, setIsProximityAlertSettingsOpen] = useState(false);
  const [isLanguageSettingsOpen, setIsLanguageSettingsOpen] = useState(false);
  const [isBackupSelectOpen, setIsBackupSelectOpen] = useState(false);
  const [storageSelectMode, setStorageSelectMode] = useState<'save' | 'open' | undefined>(undefined);

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

  const saveFileToLocal = useCallback(async (destination: 'save' | 'share') => {
    // if (isRunningProject) {
    //   //ToDo バックアップできた方がいいかも？もしくは裏で自動
    //   await AlertAsync(t('hooks.message.cannotInRunningProject'));
    //   return;
    // }

    // 写真を常に含める（確認なし）
    const includePhoto = true;

    setIsLoading(true);
    // 書き出しデータの生成・ZIP作成が例外を投げても（大きすぎるデータの文字列長・メモリの上限など）、
    // ローディングを消して失敗を伝える。捕まえないとローディングが出たまま何も表示されない
    let result: Awaited<ReturnType<typeof exportGeoFile>> | 'error';
    try {
      const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const fileName = `ecorismap_${time}`;
      const data = { dataSet, layers, settings: createExportSettings(), maps };
      const exportData = await generateEcorisMapData(data, { includePhoto, fromProject: false });
      result = await exportGeoFile(exportData, fileName, 'zip', destination);
    } catch (e) {
      console.error('saveFileToLocal failed', e);
      result = 'error';
    } finally {
      setIsLoading(false);
    }
    if (result === 'error') {
      await AlertAsync(t('hooks.message.failSaveFile'));
    } else if (result === 'saved') {
      await AlertAsync(t('hooks.message.successSaveFile'));
    }
  }, [createExportSettings, dataSet, generateEcorisMapData, layers, maps]);

  const openFileFromLocal = useCallback(async () => {
    // 記録中なら、読み込む前に止めて保存させる（軌跡監査 T-M8）。止めずに読み込むと、ここまでの軌跡が
    // 読み込んだ別のデータの軌跡レイヤへ保存される。ファイルの選択までを確認の側に入れ、ピッカーで
    // 取りやめたり拡張子が違ったりしたときは記録を止めない
    await replaceDataWithTrackingGuard(
      'openFile',
      async () => {
        const ret = await ConfirmAsync(t('Settings.confirm.fileOpen'));
        if (!ret) return undefined;
        //確認ダイアログのdismiss完了前だとピッカーの表示に失敗する
        await waitForModalTransition();
        const file = await DocumentPicker.getDocumentAsync({});
        if (file.assets === null) return undefined;

        const ext = getExt(file.assets[0].name);
        if (!(ext?.toLowerCase() === 'zip' || ext?.toLowerCase() === 'ecorismap')) {
          await AlertAsync(t('hooks.message.wrongExtension'));
          return undefined;
        }
        return file.assets[0].uri;
      },
      async (uri) => {
        setIsLoading(true);
        let opened: Awaited<ReturnType<typeof openEcorisMapFile>>;
        try {
          opened = await openEcorisMapFile(uri);
        } catch (e) {
          console.error('openFileFromLocal failed', e);
          opened = { isOK: false, message: t('hooks.message.failGetData') };
        } finally {
          setIsLoading(false);
        }
        const { isOK, message, region } = opened;
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
    );
  }, [navigateToHome, openEcorisMapFile]);

  const pressFileSave = useCallback(() => {
    setStorageSelectMode('save');
  }, []);

  const pressFileOpen = useCallback(async () => {
    if (isRunningProject) {
      await AlertAsync(t('hooks.message.cannotInRunningProject'));
      return;
    }
    setStorageSelectMode('open');
  }, [isRunningProject]);

  const pressStorageSelect = useCallback(
    async (choice: StorageSelectChoice) => {
      const mode = storageSelectMode;
      setStorageSelectMode(undefined);
      await waitForModalTransition();
      if (choice === 'drive') {
        navigate('GoogleDriveProjects', { previous: 'Settings', mode });
      } else if (mode === 'save') {
        // device=デバイスへ保存（Android:Download/Web:ダウンロード）、share=共有シート（iOSの"ファイル"に保存もこちら）
        await saveFileToLocal(choice === 'share' ? 'share' : 'save');
      } else if (mode === 'open') {
        await openFileFromLocal();
      }
    },
    [navigate, openFileFromLocal, saveFileToLocal, storageSelectMode]
  );

  const pressStorageSelectCancel = useCallback(() => {
    setStorageSelectMode(undefined);
  }, []);

  const pressClearData = useCallback(async () => {
    // 記録中なら、クリアの前に止めて保存させる（軌跡監査 T-M8）。新規は projectId を外すので、止めずに進めると
    // ここまでの軌跡が名義のない端末内データへ保存される。通常利用中のプロジェクトではアップロードしてから進む
    await replaceDataWithTrackingGuard(
      'clearData',
      async () => ((await ConfirmAsync(t('Settings.confirm.fileNew'))) ? true : undefined),
      async () => {
        //データ全消去の直前に自動バックアップ（止めて保存した軌跡もここに入る）
        const state = store.getState();
        saveProjectBackup(
          {
            settings: state.settings,
            layers: state.layers,
            tileMaps: state.tileMaps,
            dataSet: state.dataSet,
            user: state.user,
            projects: state.projects,
            dataSync: state.dataSync,
          },
          'fileNew'
        );
        const { isOK, message } = await clearEcorisMap();

        if (!isOK) {
          await AlertAsync(message);
        } else {
          navigateToHome?.({ previous: 'Settings', mode: 'clearEcorisMap' });
        }
      }
    );
  }, [clearEcorisMap, navigateToHome, store]);

  const pressBackupRestoreOpen = useCallback(() => {
    refreshBackupList();
    setIsBackupSelectOpen(true);
  }, [refreshBackupList]);

  //iOSはRN Modalを兄弟で2枚同時に表示できないため、確認ダイアログの前に選択モーダルを閉じる。
  //dismiss完了前に出すと同様に表示に失敗するのでワンテンポ待つ
  const confirmWithBackupSelectClosed = useCallback(async (message: string) => {
    setIsBackupSelectOpen(false);
    await waitForModalTransition();
    return await ConfirmAsync(message);
  }, []);

  const pressBackupSelect = useCallback(
    async (id: string) => {
      //iOSはRN Modalを兄弟で2枚同時に表示できないため、軌跡と復元の確認の前に選択モーダルを閉じる
      setIsBackupSelectOpen(false);
      await waitForModalTransition();
      // 復元できないもの（読めない・別ユーザーのもの）は、軌跡の確認より前に断る。記録の確認で「止めて保存」を
      // 選ばせてから断ると、復元はされないのに記録だけが止まる
      const restorable = canRestoreBackup(id);
      if (!restorable.isOK) {
        await alertRestoreFailed(restorable.reason);
        setIsBackupSelectOpen(true);
        return;
      }
      // 記録中なら、復元の前に止めて保存させる（軌跡監査 T-M8）。復元は settings（projectId を含む）・user まで
      // 置き換えるので、止めずに進めると、ここまでの軌跡が復元先のプロジェクトの軌跡レイヤに入り、そこへアップロードされる
      const proceeded = await replaceDataWithTrackingGuard(
        'restoreBackup',
        async () => ((await ConfirmAsync(t('Settings.confirm.restoreBackup'))) ? true : undefined),
        async () => {
          // 確認の間に消えた・ログインが変わった場合の防御として、restoreBackup の中でも確かめる
          const { isOK, region, reason } = restoreBackup(id);
          if (!isOK) {
            await alertRestoreFailed(reason);
            return;
          }
          await AlertAsync(t('Settings.alert.restoreBackupDone'));
          navigateToHome?.({
            jumpTo: region,
            previous: 'Settings',
            mode: 'openEcorisMap',
          });
        }
      );
      //取りやめたとき（軌跡の保存・アップロードの失敗を含む）は一覧へ戻す
      if (!proceeded) setIsBackupSelectOpen(true);
    },
    [canRestoreBackup, navigateToHome, restoreBackup]
  );

  const pressBackupSelectCancel = useCallback(() => {
    setIsBackupSelectOpen(false);
  }, []);

  const pressBackupDelete = useCallback(
    async (id: string) => {
      const ret = await confirmWithBackupSelectClosed(t('Settings.confirm.deleteBackup'));
      if (ret) deleteBackup(id);
      //一覧の操作を続けられるように、確認後は選択モーダルへ戻す
      setIsBackupSelectOpen(true);
    },
    [confirmWithBackupSelectClosed, deleteBackup]
  );

  const pressBackupClearAll = useCallback(async () => {
    const ret = await confirmWithBackupSelectClosed(t('Settings.confirm.clearAllBackups'));
    if (ret) clearAllBackups();
    setIsBackupSelectOpen(true);
  }, [clearAllBackups, confirmWithBackupSelectClosed]);

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
    navigate('GpsSettings', { previous: 'Settings' });
  }, [navigate]);

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

  const pressLanguageSettingsOpen = useCallback(() => {
    setIsLanguageSettingsOpen(true);
  }, []);

  const pressLanguageSelect = useCallback(async (language: AppLanguageType | null) => {
    setIsLanguageSettingsOpen(false);
    if (language === getStoredLanguage()) return;
    setStoredLanguage(language);
    if (Platform.OS === 'web') {
      //リロードで新しい言語のリソースを読み込み直す
      window.location.reload();
    } else {
      await waitForModalTransition();
      await AlertAsync(t('Settings.alert.languageChanged'));
    }
  }, []);

  const pressLanguageSelectCancel = useCallback(() => {
    setIsLanguageSettingsOpen(false);
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
        pressBackupRestoreOpen,
        pressClearTileCache,
        pressClearPhotoCache,
        pressClearCache,
        pressGotoManual,
        pressOSSLicense,
        pressVersion,
        pressPDFSettingsOpen,
        pressGPSSettingsOpen,
        pressProximityAlertSettingsOpen,
        pressLanguageSettingsOpen,
      }}
    >
      <Settings />
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
      <SettingsModalStorageSelect
        visible={storageSelectMode !== undefined}
        mode={storageSelectMode ?? 'save'}
        onSelect={pressStorageSelect}
        onCancel={pressStorageSelectCancel}
      />
      <SettingsModalLanguageSelect
        visible={isLanguageSettingsOpen}
        currentLanguage={getStoredLanguage()}
        pressSelect={pressLanguageSelect}
        pressCancel={pressLanguageSelectCancel}
      />
      <SettingsModalBackupSelect
        visible={isBackupSelectOpen}
        backupList={backupList}
        pressSelect={pressBackupSelect}
        pressCancel={pressBackupSelectCancel}
        pressDelete={pressBackupDelete}
        pressClearAll={pressBackupClearAll}
      />
    </SettingsContext.Provider>
  );
}
