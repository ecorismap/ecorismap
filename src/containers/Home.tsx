import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { AppState as RNAppState, AppStateStatus, GestureResponderEvent, Platform } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import { FeatureButtonType, DrawToolType } from '../types';
import Home from '../components/pages/Home';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useTiles } from '../hooks/useTiles';
import { useRecord } from '../hooks/useRecord';
import { Props_Home } from '../routes';
import { useMapView } from '../hooks/useMapView';
import { useLocation } from '../hooks/useLocation';
import { useSyncLocation } from '../hooks/useSyncLocation';
import { useAccount } from '../hooks/useAccount';
import { isInfoTool, isLineTool, isPointTool, isPolygonTool, isSelectionTool } from '../utils/General';
import { MapRef, ViewState } from 'react-map-gl';
import { useScreen } from '../hooks/useScreen';
import { useProject } from '../hooks/useProject';
import { validateStorageLicense } from '../utils/Project';
import { t } from '../i18n/config';
import { useTutrial } from '../hooks/useTutrial';
import { useWindow } from '../hooks/useWindow';
import { isHisyouTool } from '../plugins/hisyoutool/utils';
import { ModalHisyouToolSetting } from '../plugins/hisyoutool/ModalHisyouToolSetting';
import { PLUGIN } from '../constants/AppConstants';
import { useHisyouToolSetting } from '../plugins/hisyoutool/useHisyouToolSetting';
import { HomeModalTermsOfUse } from '../components/organisms/HomeModalTermsOfUse';
import { usePointTool } from '../hooks/usePointTool';
import { useDrawTool } from '../hooks/useDrawTool';
import { HomeContext } from '../contexts/Home';
import { useGeoFile } from '../hooks/useGeoFile';
import { usePermission } from '../hooks/usePermission';
import { getReceivedFiles, deleteReceivedFiles } from '../utils/File';
import { importDropedFile } from '../utils/File.web';

export default function HomeContainers({ navigation, route }: Props_Home) {
  const [restored] = useState(true);
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const mapType = useSelector((state: AppState) => state.settings.mapType);
  const isOffline = useSelector((state: AppState) => state.settings.isOffline);
  const isEditingRecord = useSelector((state: AppState) => state.settings.isEditingRecord);
  const memberLocations = useSelector((state: AppState) => state.settings.memberLocation);
  const projectName = useSelector((state: AppState) => state.settings.projectName);
  const user = useSelector((state: AppState) => state.user);
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const { screenState, openData, expandData, closeData } = useScreen();
  const { isRunningProject } = usePermission();
  const { importGeoFile } = useGeoFile();
  const { mapRegion } = useWindow();
  const { isTermsOfUseOpen, runTutrial, termsOfUseOK, termsOfUseCancel } = useTutrial();
  const { zoom, zoomDecimal, zoomIn, zoomOut, changeMapRegion } = useMapView(mapViewRef.current);

  //タイルのダウンロード関連
  const {
    isDownloading,
    downloadArea,
    savedArea,
    downloadProgress,
    savedTileSize,
    downloadTiles,
    stopDownloadTiles,
    clearTiles,
  } = useTiles(route.params?.tileMap);

  //位置データの操作、作成関連
  const { pointDataSet, lineDataSet, polygonDataSet, selectedRecord, unselectRecord, addRecordWithCheck } = useRecord();

  const {
    drawLine,
    editingLineXY,
    selectLine,
    isEditingDraw,
    isEditingObject,
    isSelectedDraw,
    currentDrawTool,
    currentPointTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    setDrawTool,
    setPointTool,
    setLineTool,
    setPolygonTool,
    setFeatureButton,
    pressSvgView,
    moveSvgView,
    releaseSvgView,
    releaseSvgInfoTool,
    savePoint,
    saveLine,
    savePolygon,
    deleteDraw,
    undoDraw,
    selectSingleFeature,
    showDrawLine,
    hideDrawLine,
    resetDrawTools,
    toggleTerrainForWeb,
  } = useDrawTool(mapViewRef.current);

  const { addCurrentPoint } = usePointTool();
  //現在位置、GPS関連
  const {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    magnetometer,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
  } = useLocation(mapViewRef.current);
  //現在位置の共有関連
  const { uploadLocation } = useSyncLocation(projectId);
  const {
    visibleHisyouToolSetting,
    hisyouLayerId,
    pressHisyouToolSettingOK,
    pressHisyouToolSettingCancel,
    showHisyouToolSetting,
  } = useHisyouToolSetting();

  //Account関連
  const { logout } = useAccount();
  //Project Buttons関連
  const {
    isSettingProject,
    isSynced,
    project,
    projectRegion,
    downloadData,
    uploadData,
    syncPosition,
    closeProject,
    saveProjectSetting,
  } = useProject();

  const [isShowingProjectButtons, setIsShowingProjectButtons] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const attribution = useMemo(
    () =>
      tileMaps
        .map((tileMap) => tileMap.visible && tileMap.url && tileMap.attribution)
        .filter((v) => v)
        .filter((x, i, self) => self.indexOf(x) === i)
        .join(', '),
    [tileMaps]
  );

  const isDownloadPage = useMemo(() => route.params?.tileMap !== undefined, [route.params?.tileMap]);

  /*************** onXXXXMapView *********************/

  const onRegionChangeMapView = useCallback(
    (region: Region | ViewState) => {
      //console.log('onRegionChangeMapView', region);
      changeMapRegion(region);
    },
    [changeMapRegion]
  );

  const onDragMapView = useCallback(async () => {
    if (gpsState === 'follow') {
      await toggleGPS('show');
    }
  }, [gpsState, toggleGPS]);

  const selectDrawTool = useCallback(
    async (value: DrawToolType) => {
      if (isPointTool(value) || isLineTool(value) || isPolygonTool(value)) {
        if (currentDrawTool === value) {
          if (isEditingDraw) {
            const ret = await ConfirmAsync(t('Home.confirm.discard'));
            if (!ret) return;
          }
          //ドローツールをオフ
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          //ドローツールをオン
          setDrawTool(value);
          if (isPointTool(value)) await runTutrial(`POINTTOOL_${value}`);
          if (isLineTool(value)) await runTutrial(`LINETOOL_${value}`);
          if (isPolygonTool(value)) await runTutrial(`POLYGONTOOL_${value}`);
        }
      } else if (isInfoTool(value)) {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
          toggleTerrainForWeb('NONE');
        } else {
          setDrawTool(value);
          toggleTerrainForWeb('LINE');
          await runTutrial('INFOTOOL');
        }
      } else if (isSelectionTool(value)) {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          setDrawTool(value);
          await runTutrial('SELECTIONTOOL');
        }
      } else if (isHisyouTool(value)) {
        if (value === 'SETTING') {
          showHisyouToolSetting();
        } else if (currentDrawTool === value) {
          if (isEditingDraw) return;
          setDrawTool('NONE');
        } else {
          setDrawTool(value);
        }
      } else {
        if (value === 'MOVE') {
          if (currentDrawTool === value) {
            if (isEditingDraw || isSelectedDraw) return;
            setDrawTool('NONE');
          } else {
            setDrawTool(value);
          }
        }
      }
    },
    [
      currentDrawTool,
      isEditingDraw,
      isSelectedDraw,
      resetDrawTools,
      runTutrial,
      setDrawTool,
      showHisyouToolSetting,
      toggleTerrainForWeb,
    ]
  );

  const onPressMapView = useCallback(async () => {
    if (currentDrawTool === 'ADD_LOCATION_POINT') {
      if (Platform.OS === 'web') {
        Alert.alert('', t('Home.alert.gpsWeb'));
        return;
      }
      if (gpsState === 'off' && trackingState === 'off') {
        Alert.alert('', t('Home.alert.gps'));
        return;
      }

      const { isOK, message, layer, record } = await addCurrentPoint();
      if (!isOK || layer === undefined || record === undefined) {
        Alert.alert('', message);
      } else {
        screenState === 'closed' ? expandData() : openData();
        setTimeout(function () {
          navigation.navigate('DataEdit', {
            previous: 'Data',
            targetData: record,
            targetLayer: layer,
            targetRecordSet: [],
            targetIndex: 0,
          });
        }, 1);
      }
      selectDrawTool(currentDrawTool);
    }
  }, [
    currentDrawTool,
    gpsState,
    trackingState,
    addCurrentPoint,
    selectDrawTool,
    screenState,
    expandData,
    openData,
    navigation,
  ]);

  const onDrop = useCallback(
    async (acceptedFiles: any) => {
      if (Platform.OS !== 'web') return;
      if (isRunningProject) {
        await AlertAsync(t('hooks.message.cannotInRunningProject'));
        return;
      }
      const files = await importDropedFile(acceptedFiles);
      if (files.length > 0) {
        for (const f of files) {
          const { isOK, message } = await importGeoFile(f.uri, f.name, f.size);
          if (!isOK) await AlertAsync(`${f.name}:${message}`);
        }
        await AlertAsync(t('hooks.message.receiveFile'));
      }
    },
    [importGeoFile, isRunningProject]
  );

  const onReleaseSvgView = useCallback(
    async (event: GestureResponderEvent) => {
      if (isInfoTool(currentDrawTool)) {
        const { hasDragged } = releaseSvgInfoTool(event);
        if (hasDragged) return;
        if (isEditingRecord) {
          await AlertAsync(t('Home.alert.discardChanges'));
          return;
        }

        const { layer, feature, recordSet, recordIndex } = selectSingleFeature(event);

        if (layer === undefined || feature === undefined || recordSet === undefined || recordIndex === undefined) {
          unselectRecord();
          return;
        }

        openData();
        navigation.navigate('DataEdit', {
          previous: 'Data',
          targetData: { ...feature },
          targetLayer: { ...layer },
          targetRecordSet: recordSet,
          targetIndex: recordIndex,
        });

        setTimeout(() => changeMapRegion(mapRegion, true), 300);
      } else {
        releaseSvgView(event);
      }
    },
    [
      currentDrawTool,
      releaseSvgInfoTool,
      isEditingRecord,
      selectSingleFeature,
      openData,
      navigation,
      unselectRecord,
      changeMapRegion,
      mapRegion,
      releaseSvgView,
    ]
  );
  /************** select button ************/

  const selectFeatureButton = useCallback(
    (value: FeatureButtonType) => {
      setDrawTool('NONE');
      toggleTerrainForWeb(value);
      setFeatureButton(value);
      resetDrawTools();
    },
    [resetDrawTools, setFeatureButton, setDrawTool, toggleTerrainForWeb]
  );

  /**************** press ******************/

  const pressUndoDraw = useCallback(async () => {
    undoDraw();
  }, [undoDraw]);

  const pressSaveDraw = useCallback(async () => {
    let result;
    if (featureButton === 'POINT') {
      result = savePoint();
    } else if (featureButton === 'LINE') {
      result = saveLine();
    } else if (featureButton === 'POLYGON') {
      result = savePolygon();
    }
    if (result === undefined) return;
    const { isOK, message, layer, recordSet } = result;
    if (!isOK) {
      Alert.alert('', message);
      return;
    }
    //console.log(isOK, message, layer, recordSet);
    setDrawTool('NONE');
    if (layer !== undefined && recordSet !== undefined && recordSet.length > 0) {
      openData();
      setTimeout(function () {
        navigation.navigate('DataEdit', {
          previous: 'Data',
          targetData: recordSet[0],
          targetLayer: layer,
          targetRecordSet: recordSet,
          targetIndex: 0,
        });
      }, 1);
    }
  }, [featureButton, navigation, openData, saveLine, savePoint, savePolygon, setDrawTool]);

  const pressDeleteDraw = useCallback(async () => {
    const ret = await ConfirmAsync(t('DataEdit.confirm.deleteData'));
    if (ret) {
      const { isOK, message } = deleteDraw();

      if (!isOK) {
        Alert.alert('', message);
        return;
      }
      closeData();
    }
  }, [closeData, deleteDraw]);

  const pressDownloadTiles = useCallback(async () => {
    downloadTiles();
  }, [downloadTiles]);
  const pressStopDownloadTiles = useCallback(() => {
    stopDownloadTiles();
  }, [stopDownloadTiles]);

  const pressCompass = useCallback(async () => {
    if (headingUp === false && gpsState === 'off' && trackingState === 'off') {
      // Alert.alert(t('Home.alert.compass'));
      // return;
      await toggleGPS('show');
    }
    await toggleHeadingUp(!headingUp);
  }, [gpsState, headingUp, toggleGPS, toggleHeadingUp, trackingState]);

  const pressTracking = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert('', t('Home.alert.trackWeb'));
      return;
    }
    //runTutrial('HOME_BTN_TRACK');
    if (trackingState === 'off') {
      const { isOK, message } = addRecordWithCheck('LINE', [], { isTrack: true });
      if (!isOK) {
        await AlertAsync(message);
        return;
      }
      await toggleTracking('on');
      await toggleGPS('follow');
      setFeatureButton('NONE');
    } else if (trackingState === 'on') {
      const ret = await ConfirmAsync(t('Home.confirm.track'));
      if (ret) {
        await toggleTracking('off');
        await toggleGPS('off');
      }
    }
  }, [addRecordWithCheck, setFeatureButton, toggleGPS, toggleTracking, trackingState]);

  const pressGPS = useCallback(async () => {
    //runTutrial('HOME_BTN_GPS');
    if (gpsState === 'off') {
      await toggleGPS('follow');
    } else if (gpsState === 'follow') {
      if (trackingState === 'on') {
        await AlertAsync(t('Home.alert.gpsWithTrack'));
        return;
      }
      await toggleGPS('off');
    } else if (gpsState === 'show') {
      await toggleGPS('follow');
    }
  }, [gpsState, toggleGPS, trackingState]);

  const pressDeleteTiles = useCallback(async () => {
    if (route.params?.tileMap !== undefined) {
      const ret = await ConfirmAsync(t('Home.confirm.deleteTiles'));
      if (ret) clearTiles(route.params.tileMap);
    }
  }, [clearTiles, route.params?.tileMap]);

  const pressLogout = useCallback(async () => {
    if (isSettingProject) {
      const ret = await ConfirmAsync(t('Home.confirm.discardLogout'));
      if (!ret) return;
    } else {
      const ret = await ConfirmAsync(t('Home.confirm.logout'));
      if (!ret) return;
    }

    if (Platform.OS === 'web') {
      // const isCleanupLocalKey = await ConfirmAsync(
      //   '暗号化キーも削除しますか？他人のデバイスの場合、削除することをお勧めします。'
      // );
      const isCleanupLocalKey = true;
      const { isOK, message } = await logout(isCleanupLocalKey);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Account', {});
      }
    } else {
      const { isOK, message } = await logout();
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.navigate('Home');
      }
    }
  }, [isSettingProject, logout, navigation]);

  const pressZoomIn = useCallback(() => {
    hideDrawLine();
    zoomIn();
    showDrawLine;
  }, [hideDrawLine, showDrawLine, zoomIn]);

  const pressZoomOut = useCallback(() => {
    hideDrawLine();
    zoomOut();
    showDrawLine;
  }, [hideDrawLine, showDrawLine, zoomOut]);

  /******************* project buttons ************************** */

  const pressProjectLabel = useCallback(() => {
    setIsShowingProjectButtons(!isShowingProjectButtons);
  }, [isShowingProjectButtons]);

  const pressJumpProject = useCallback(() => {
    navigation.navigate('Home', {
      jumpTo: projectRegion,
    });
  }, [navigation, projectRegion]);

  const pressDownloadData = useCallback(async () => {
    //写真はひとまずダウンロードしない。（プロジェクトの一括か個別で十分）
    const shouldPhotoDownload = false;
    // if (Platform.OS !== 'web') {
    //   //Webだと1枚ずつダウンロードになってしまうからダウンロードしない。
    //   const ret = await ConfirmAsync('写真もダウンロードしますか？');
    //   if (ret) shouldPhotoDownload = true;
    // }
    setIsLoading(true);
    const { isOK, message } = await downloadData(shouldPhotoDownload);
    setIsLoading(false);
    if (!isOK) {
      await AlertAsync(message);
    } else {
      await AlertAsync(t('Home.alert.download'));
    }
  }, [downloadData]);

  const pressUploadData = useCallback(async () => {
    //写真もアップロードするか聞く？

    // const ret = await ConfirmAsync('写真もアップロードしますか？');
    // if (!ret) shouldPhotoUpload = false;
    if (project === undefined) return;
    const { isOK: hasUploadLicense, message: licenseMessage } = validateStorageLicense(
      project.license,
      project.storage.count
    );
    if (!hasUploadLicense) {
      if (Platform.OS === 'web') {
        Alert.alert('', licenseMessage + t('Home.alert.uploadLicenseWeb'));
      } else {
        Alert.alert('', t('Home.alert.uploadLicense'));
      }
    }

    setIsLoading(true);
    const { isOK, message } = await uploadData(hasUploadLicense);
    setIsLoading(false);
    if (!isOK) {
      await AlertAsync(message);
      return;
    } else {
      await AlertAsync(t('Home.alert.upload'));
    }
  }, [project, uploadData]);

  const pressSyncPosition = useCallback(() => {
    if (isSynced === false) {
      Alert.alert('', t('Home.alert.sync'));
    }
    syncPosition(!isSynced);
  }, [isSynced, syncPosition]);

  const pressCloseProject = useCallback(async () => {
    const ret = await ConfirmAsync(t('Home.confirm.closeProject'));
    if (ret) {
      const { isOK, message } = closeProject();
      if (!isOK) {
        await AlertAsync(message);
      } else {
        setIsShowingProjectButtons(false);
      }
    }
  }, [closeProject]);

  const pressSaveProjectSetting = useCallback(async () => {
    const ret = await ConfirmAsync(t('Home.confirm.saveProject'));
    if (!ret) return;
    setIsLoading(true);
    const { isOK, message } = await saveProjectSetting();
    setIsLoading(false);
    if (!isOK) {
      await AlertAsync(message);
    } else {
      await AlertAsync(t('Home.alert.saveProject'));
      closeProject();
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: project!, isNew: false });
    }
  }, [closeProject, navigation, project, saveProjectSetting]);

  const pressDiscardProjectSetting = useCallback(async () => {
    const ret = await ConfirmAsync(t('Home.confirm.discardProject'));
    if (ret) {
      closeProject();
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: project!, isNew: false });
    }
  }, [closeProject, navigation, project]);
  /****************** goto ****************************/

  const gotoProjects = useCallback(async () => {
    closeData();
    setTimeout(() => navigation.navigate('Projects'), 1);
  }, [closeData, navigation]);

  const gotoAccount = useCallback(async () => {
    closeData();
    setTimeout(
      () =>
        navigation.navigate('AccountSettings', {
          previous: 'Home',
        }),
      1
    );
  }, [closeData, navigation]);

  const gotoLogin = useCallback(() => {
    navigation.navigate('Account', {
      accountFormState: 'loginUserAccount',
    });
  }, [navigation]);

  const gotoLayers = useCallback(async () => {
    if (isEditingRecord) {
      AlertAsync(t('Home.alert.discardChanges'));
      return;
    }
    expandData();
    navigation.navigate('Layers');
  }, [isEditingRecord, expandData, navigation]);

  const gotoMaps = useCallback(async () => {
    if (isEditingRecord) {
      AlertAsync(t('Home.alert.discardChanges'));
      return;
    }
    expandData();
    navigation.setParams({ tileMap: undefined });
    navigation.navigate('Maps');
  }, [expandData, isEditingRecord, navigation]);

  const gotoSettings = useCallback(async () => {
    closeData();
    setTimeout(
      () =>
        navigation.navigate('Settings', {
          previous: 'Home',
        }),
      1
    );
  }, [closeData, navigation]);

  const gotoBack = useCallback(() => navigation.navigate('Maps'), [navigation]);

  useEffect(() => {
    //coordsは深いオブジェクトのため値を変更しても変更したとみなされない。
    //console.log('jump', mapViewRef.current);
    if (route.params?.jumpTo != null) {
      //console.log(route.params.jumpTo);
      changeMapRegion({ ...route.params.jumpTo, zoom }, true);
      navigation.setParams({ jumpTo: undefined });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.jumpTo]);

  useEffect(() => {
    //Web版は自分の位置は共有しない。取得はする。
    if (Platform.OS !== 'web') {
      uploadLocation(currentLocation);
    }
  }, [currentLocation, uploadLocation]);

  useEffect(() => {
    return closeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    //起動時に読み込む場合
    (async () => await importExternalFiles())();

    //バックグラウンド時に読み込む場合
    const subscription = RNAppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') await importExternalFiles();
    });
    return () => {
      subscription.remove();
    };

    async function importExternalFiles() {
      const files = await getReceivedFiles();
      if (files === undefined || files.length === 0) return;
      const { message } = await importGeoFile(files[0].uri, files[0].name, files[0].size);
      if (message !== '') await AlertAsync(message);
      await deleteReceivedFiles(files);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <HomeContext.Provider
      value={{
        pointDataSet,
        lineDataSet,
        polygonDataSet,
        isEditingDraw,
        isEditingObject,
        isSelectedDraw,
        drawLine: drawLine.current,
        editingLine: editingLineXY.current,
        selectLine: selectLine.current,
        isDownloadPage,
        memberLocations,
        mapViewRef,
        mapType,
        tileMaps,
        savedTileSize,
        isDownloading,
        downloadArea,
        savedArea,
        downloadProgress,
        isOffline,
        restored,
        attribution,
        gpsState,
        trackingState,
        currentLocation,
        magnetometer,
        headingUp,
        zoom,
        zoomDecimal,
        featureButton,
        currentDrawTool,
        currentPointTool,
        currentLineTool,
        currentPolygonTool,
        selectedRecord,
        screenState,
        isLoading,
        isTermsOfUseOpen,
        projectName,
        user,
        isSynced,
        isShowingProjectButtons,
        isSettingProject,
        onRegionChangeMapView,
        onPressMapView,
        onDragMapView,
        onDrop,
        onPressSvgView: pressSvgView,
        onMoveSvgView: moveSvgView,
        onReleaseSvgView,
        selectFeatureButton,
        selectDrawTool,
        setPointTool,
        setLineTool,
        setPolygonTool,
        pressZoomIn,
        pressZoomOut,
        pressCompass,
        pressGPS,
        pressTracking,
        pressDownloadTiles,
        pressStopDownloadTiles,
        pressDeleteTiles,
        pressUndoDraw,
        pressSaveDraw,
        pressDeleteDraw,
        pressLogout,
        pressProjectLabel,
        pressJumpProject,
        pressDownloadData,
        pressSyncPosition,
        pressCloseProject,
        pressUploadData,
        pressSaveProjectSetting,
        pressDiscardProjectSetting,
        gotoMaps,
        gotoSettings,
        gotoLayers,
        gotoBack,
        gotoAccount,
        gotoLogin,
        gotoProjects,
        termsOfUseOK,
        termsOfUseCancel,
      }}
    >
      <Home />
      {Platform.OS !== 'web' && <HomeModalTermsOfUse />}
      {PLUGIN.HISYOUTOOL && (
        <ModalHisyouToolSetting
          visible={visibleHisyouToolSetting}
          hisyouLayerId={hisyouLayerId}
          pressOK={pressHisyouToolSettingOK}
          pressCancel={pressHisyouToolSettingCancel}
        />
      )}
    </HomeContext.Provider>
  );
}
