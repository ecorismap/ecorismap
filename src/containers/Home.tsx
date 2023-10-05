import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  AppState as RNAppState,
  AppStateStatus,
  GestureResponderEvent,
  Platform,
  PanResponderInstance,
  PanResponder,
} from 'react-native';
import MapView, { MapPressEvent, Region } from 'react-native-maps';
import { FeatureButtonType, DrawToolType, MapMemoToolType, LayerType, RecordType } from '../types';
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
import { MapLayerMouseEvent, MapRef, ViewState } from 'react-map-gl';
import { useProject } from '../hooks/useProject';
import { validateStorageLicense } from '../utils/Project';
import { getExt, isInfoTool, isLineTool, isMapMemoDrawTool, isPointTool, isPolygonTool } from '../utils/General';
import { t } from '../i18n/config';
import { useTutrial } from '../hooks/useTutrial';
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
import * as e3kit from '../lib/virgilsecurity/e3kit';
import { useMapMemo } from '../hooks/useMapMemo';
import { useVectorTile } from '../hooks/useVectorTile';
import { useWindow } from '../hooks/useWindow';
import { latLonToXY } from '../utils/Coords';
import { Position } from '@turf/turf';
import BottomSheet from '@gorhom/bottom-sheet';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';

export default function HomeContainers({ navigation, route }: Props_Home) {
  const [restored] = useState(true);
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isPencilTouch = useRef(false);
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const mapType = useSelector((state: AppState) => state.settings.mapType);
  const isOffline = useSelector((state: AppState) => state.settings.isOffline);
  const isEditingRecord = useSelector((state: AppState) => state.settings.isEditingRecord);
  const memberLocations = useSelector((state: AppState) => state.settings.memberLocation);
  const projectName = useSelector((state: AppState) => state.settings.projectName);
  const user = useSelector((state: AppState) => state.user);
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const tracking = useSelector((state: AppState) => state.settings.tracking);

  const routeName = getFocusedRouteNameFromRoute(route);

  const { isRunningProject } = usePermission();
  const { importGeoFile } = useGeoFile();
  const { isTermsOfUseOpen, runTutrial, termsOfUseOK, termsOfUseCancel } = useTutrial();
  const { zoom, zoomDecimal, zoomIn, zoomOut, changeMapRegion } = useMapView(mapViewRef.current);

  const [isPinch, setIsPinch] = useState(false);
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
  const {
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    selectedRecord,
    unselectRecord,
    addRecordWithCheck,
    checkRecordEditable,
    calculateStorageSize,
    setIsEditingRecord,
  } = useRecord();

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
    isDrawLineVisible,
    setDrawTool,
    setPointTool,
    setLineTool,
    setPolygonTool,
    setFeatureButton,
    pressSvgView,
    moveSvgView,
    releaseSvgView,
    savePoint,
    saveLine,
    savePolygon,
    deleteDraw,
    undoDraw,
    selectSingleFeature,
    showDrawLine,
    hideDrawLine,
    resetDrawTools,
    toggleWebTerrainActive,
  } = useDrawTool(mapViewRef.current);

  const {
    visibleMapMemoColor,
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    penWidth,
    mapMemoEditingLine,
    editableMapMemo,
    isPencilModeActive,
    setMapMemoTool,
    setPen,
    setEraser,
    setVisibleMapMemoColor,
    selectPenColor,
    onPanResponderGrantMapMemo,
    onPanResponderMoveMapMemo,
    onPanResponderReleaseMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    clearMapMemoHistory,
    changeColorTypeToIndividual,
    clearMapMemoEditingLine,
    setPencilModeActive,
  } = useMapMemo(mapViewRef.current);

  const { addCurrentPoint, resetPointPosition, updatePointPosition } = usePointTool();
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
    clearProject,
    saveProjectSetting,
  } = useProject();

  const [isShowingProjectButtons, setIsShowingProjectButtons] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { vectorTileInfo, getVectorTileInfo, openVectorTileInfo, closeVectorTileInfo } = useVectorTile();
  const { mapSize, mapRegion } = useWindow();

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

  const onCloseBottomSheet = useCallback(async () => {
    if (isEditingRecord && routeName === 'DataEdit') {
      const ret = await ConfirmAsync(t('DataEdit.confirm.gotoBack'));
      if (ret) {
        setIsEditingRecord(false);
        //ToDo 写真の削除処理はどうする？
      } else {
        bottomSheetRef.current?.snapToIndex(2);
      }
    }
  }, [isEditingRecord, routeName, setIsEditingRecord]);

  const onRegionChangeMapView = useCallback(
    (region: Region | ViewState) => {
      //console.log('onRegionChangeMapView', region);
      changeMapRegion(region);
      !isDrawLineVisible && showDrawLine();
      closeVectorTileInfo();
    },
    [changeMapRegion, closeVectorTileInfo, isDrawLineVisible, showDrawLine]
  );

  const getInfoOfVectorTile = useCallback(
    async (event: MapPressEvent | MapLayerMouseEvent) => {
      let latlon: number[];
      let properties: { [key: string]: any }[];
      let position: Position;

      if (Platform.OS === 'web') {
        const e = event as MapLayerMouseEvent;
        const map = (mapViewRef.current as MapRef).getMap();
        const features = map.queryRenderedFeatures([e.point.x, e.point.y]);
        position = [e.point.x, e.point.y];
        //@ts-ignore
        properties = features ? features.map((f) => f.properties) : [];
      } else {
        const e = event as MapPressEvent;
        latlon = [e.nativeEvent.coordinate.longitude, e.nativeEvent.coordinate.latitude];
        properties = await getVectorTileInfo(latlon, zoom);
        position = latLonToXY(latlon, mapRegion, mapSize, mapViewRef.current);
      }
      if (properties === undefined) {
        closeVectorTileInfo();
      } else {
        //console.log(properties, position);
        openVectorTileInfo(properties, position);
      }
    },
    [closeVectorTileInfo, getVectorTileInfo, mapRegion, mapSize, openVectorTileInfo, zoom]
  );

  const onPressMapView = useCallback(
    async (event: MapPressEvent | MapLayerMouseEvent) => {
      if (isMapMemoDrawTool(currentMapMemoTool)) return;
      if (isInfoTool(currentDrawTool)) return;
      await getInfoOfVectorTile(event);
    },
    [currentDrawTool, currentMapMemoTool, getInfoOfVectorTile]
  );

  const onDragMapView = useCallback(async () => {
    if (gpsState === 'follow') {
      await toggleGPS('show');
    }
  }, [gpsState, toggleGPS]);

  const togglePencilMode = useCallback(() => {
    runTutrial('PENCILMODE');
    setPencilModeActive(!isPencilModeActive);
  }, [isPencilModeActive, runTutrial, setPencilModeActive]);

  const selectMapMemoTool = useCallback(
    (value: MapMemoToolType) => {
      if (currentMapMemoTool === value) {
        setMapMemoTool('NONE');
      } else {
        setDrawTool('NONE');
        setMapMemoTool(value);
        if (value.includes('PEN')) {
          const ret = changeColorTypeToIndividual();
          if (ret) Alert.alert('', t('Home.alert.individualColor'));
        }
      }
    },
    [changeColorTypeToIndividual, currentMapMemoTool, setDrawTool, setMapMemoTool]
  );

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
          toggleWebTerrainActive(true);
        } else {
          setDrawTool(value);
          setMapMemoTool('NONE');
          toggleWebTerrainActive(false);
          if (Platform.OS !== 'web') toggleHeadingUp(false);
          await runTutrial('INFOTOOL');
        }
      } else if (value === 'SELECT') {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          setDrawTool(value);
          await runTutrial('SELECTIONTOOL');
        }
      } else if (value === 'DELETE_POINT') {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          setDrawTool(value);
        }
      } else if (value === 'MOVE_POINT') {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          setDrawTool(value);
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
      setMapMemoTool,
      showHisyouToolSetting,
      toggleHeadingUp,
      toggleWebTerrainActive,
    ]
  );

  const onDrop = useCallback(
    async (acceptedFiles: any) => {
      if (Platform.OS !== 'web') return;
      if (isRunningProject) {
        await AlertAsync(t('hooks.message.cannotInRunningProject'));
        return;
      }
      const files = await importDropedFile(acceptedFiles);
      if (files.length > 0) {
        let allOK = true;
        for (const file of files) {
          const ext = getExt(file.name)?.toLowerCase();
          if (
            !(ext === 'gpx' || ext === 'geojson' || ext === 'kml' || ext === 'kmz' || ext === 'zip' || ext === 'csv')
          ) {
            await AlertAsync(t('hooks.message.wrongExtension'));
            allOK = false;
            continue;
          }
          if (file.size === undefined) {
            await AlertAsync(t('hooks.message.cannotGetFileSize'));
            allOK = false;
            continue;
          }
          if (file.size / 1024 > 1000) {
            await AlertAsync(t('hooks.message.cannotImportData'));
            allOK = false;
            continue;
          }
          const { isOK, message } = await importGeoFile(file.uri, file.name);
          if (!isOK) {
            await AlertAsync(`${file.name}:${message}`);
            allOK = false;
          }
        }
        if (allOK) await AlertAsync(t('hooks.message.receiveFile'));
      }
    },
    [importGeoFile, isRunningProject]
  );

  /************** select button ************/

  const selectFeatureButton = useCallback(
    (value: FeatureButtonType) => {
      setDrawTool('NONE');
      setMapMemoTool('NONE');
      toggleWebTerrainActive(value === 'NONE');
      setFeatureButton(value);
      resetDrawTools();
      clearMapMemoHistory();
      toggleWebTerrainActive(false);
      if (Platform.OS !== 'web') toggleHeadingUp(false);
    },
    [
      setDrawTool,
      setMapMemoTool,
      toggleWebTerrainActive,
      setFeatureButton,
      resetDrawTools,
      clearMapMemoHistory,
      toggleHeadingUp,
    ]
  );

  /**************** press ******************/

  const pressUndoDraw = useCallback(async () => {
    undoDraw();
  }, [undoDraw]);

  const pressSaveDraw = useCallback(() => {
    let result;
    if (featureButton === 'LINE') {
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
      bottomSheetRef.current?.snapToIndex(2);
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: recordSet[0],
        targetLayer: layer,
        targetRecordSet: recordSet,
        targetIndex: 0,
      });
    }
  }, [featureButton, navigation, saveLine, savePolygon, setDrawTool]);

  const pressDeleteDraw = useCallback(async () => {
    if (drawLine.current.length === 0) return;
    const ret = await ConfirmAsync(t('DataEdit.confirm.deleteData'));
    if (ret) {
      const { isOK, message } = deleteDraw();

      if (!isOK) {
        await AlertAsync(message);
        return;
      }
      bottomSheetRef.current?.close();
    }
  }, [deleteDraw, drawLine]);

  const onReleaseSvgView = useCallback(
    async (e: GestureResponderEvent) => {
      releaseSvgView(e);
      if (featureButton !== 'POINT') return;
      if (currentDrawTool === 'DELETE_POINT') {
        //ポイントはすぐに削除する
        await pressDeleteDraw();
      }
      if (currentDrawTool === 'PLOT_POINT') {
        //ポイントはすぐに保存する
        const result = savePoint();
        if (result === undefined) return;
        const { isOK, message, layer, recordSet } = result;
        if (!isOK) {
          await AlertAsync(message);
          return;
        }
        setDrawTool('NONE');
        if (layer !== undefined && recordSet !== undefined && recordSet.length > 0) {
          bottomSheetRef.current?.snapToIndex(2);
          navigation.navigate('DataEdit', {
            previous: 'Data',
            targetData: recordSet[0],
            targetLayer: layer,
            targetRecordSet: recordSet,
            targetIndex: 0,
          });
        }
      }
    },
    [currentDrawTool, featureButton, navigation, pressDeleteDraw, releaseSvgView, savePoint, setDrawTool]
  );

  const onDragEndPoint = useCallback(
    async (e: any, layer: LayerType, feature: RecordType) => {
      const coordinate =
        Platform.OS === 'web' ? { longitude: e.lngLat.lng, latitude: e.lngLat.lat } : e.nativeEvent.coordinate;
      const ret = await ConfirmAsync(t('Home.confirm.drag'));
      if (!ret) {
        resetPointPosition(layer, feature);
        return;
      }
      const { isOK, message } = checkRecordEditable(layer, feature);
      if (!isOK) {
        resetPointPosition(layer, feature);
        await AlertAsync(message);
        return;
      }
      updatePointPosition(layer, feature, coordinate);
    },
    [checkRecordEditable, resetPointPosition, updatePointPosition]
  );

  const pressDownloadTiles = useCallback(async () => {
    downloadTiles();
  }, [downloadTiles]);
  const pressStopDownloadTiles = useCallback(() => {
    stopDownloadTiles();
  }, [stopDownloadTiles]);

  const pressCompass = useCallback(async () => {
    if (isInfoTool(currentDrawTool)) return;
    if (featureButton !== 'NONE') return;
    if (headingUp === false && gpsState === 'off' && trackingState === 'off') await toggleGPS('show');
    toggleHeadingUp(!headingUp);
  }, [currentDrawTool, featureButton, gpsState, headingUp, toggleGPS, toggleHeadingUp, trackingState]);

  const pressTracking = useCallback(async () => {
    if (Platform.OS === 'web') {
      await AlertAsync(t('Home.alert.trackWeb'));
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
      if (ret) await clearTiles(route.params.tileMap);
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
    if (tracking !== undefined) {
      await AlertAsync(t('hooks.message.finishTrackking'));
      return;
    }
    if (Platform.OS === 'web') {
      await e3kit.cleanupEncryptKey();
      await logout();
      clearProject();
      navigation.navigate('Account', {});
    } else {
      await e3kit.cleanupEncryptKey();
      await logout();
      clearProject();
      navigation.navigate('Home');
    }
  }, [clearProject, isSettingProject, logout, navigation, tracking]);

  const pressZoomIn = useCallback(() => {
    hideDrawLine();
    zoomIn();
  }, [hideDrawLine, zoomIn]);

  const pressZoomOut = useCallback(() => {
    hideDrawLine();
    zoomOut();
  }, [hideDrawLine, zoomOut]);

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
    try {
      //写真はひとまずダウンロードしない。（プロジェクトの一括か個別で十分）
      const shouldPhotoDownload = false;
      setIsLoading(true);
      await downloadData(shouldPhotoDownload);
      setIsLoading(false);
      await AlertAsync(t('Home.alert.download'));
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [downloadData]);

  const pressUploadData = useCallback(async () => {
    try {
      const storageLicenseResult = validateStorageLicense(project);
      if (!storageLicenseResult.isOK) {
        if (Platform.OS === 'web') {
          await AlertAsync(storageLicenseResult.message + t('Home.alert.uploadLicenseWeb'));
        } else {
          await AlertAsync(t('Home.alert.uploadLicense'));
        }
      }
      setIsLoading(true);
      await uploadData(storageLicenseResult.isOK);
      setIsLoading(false);
      await AlertAsync(t('Home.alert.upload'));
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
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
      if (tracking !== undefined) {
        await AlertAsync(t('hooks.message.finishTrackking'));
        return;
      }
      clearProject();
      setIsShowingProjectButtons(false);
    }
  }, [clearProject, tracking]);

  const pressSaveProjectSetting = useCallback(async () => {
    try {
      const ret = await ConfirmAsync(t('Home.confirm.saveProject'));
      if (!ret) return;
      const storageLicenseResult = validateStorageLicense(project);
      if (!storageLicenseResult.isOK) {
        if (Platform.OS === 'web') {
          await AlertAsync(storageLicenseResult.message + t('Home.alert.uploadLicenseWeb'));
        } else {
          await AlertAsync(t('Home.alert.uploadLicense'));
        }
      }
      setIsLoading(true);
      await saveProjectSetting(storageLicenseResult.isOK);
      setIsLoading(false);
      await AlertAsync(t('Home.alert.saveProject'));
      clearProject();
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: project!, isNew: false });
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [clearProject, navigation, project, saveProjectSetting]);

  const pressDiscardProjectSetting = useCallback(async () => {
    const ret = await ConfirmAsync(t('Home.confirm.discardProject'));
    if (ret) {
      clearProject();
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: project!, isNew: false });
    }
  }, [clearProject, navigation, project]);
  /****************** goto ****************************/

  const gotoProjects = useCallback(async () => {
    navigation.navigate('Projects');
  }, [navigation]);

  const gotoAccount = useCallback(async () => {
    navigation.navigate('AccountSettings', {
      previous: 'Home',
    });
  }, [navigation]);

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
    bottomSheetRef.current?.snapToIndex(2);
    navigation.navigate('Layers');
  }, [isEditingRecord, navigation]);

  const gotoMaps = useCallback(async () => {
    if (isEditingRecord) {
      AlertAsync(t('Home.alert.discardChanges'));
      return;
    }

    bottomSheetRef.current?.snapToIndex(2);
    navigation.setParams({ tileMap: undefined });
    navigation.navigate('Maps');
  }, [isEditingRecord, navigation]);

  const gotoSettings = useCallback(async () => {
    bottomSheetRef.current?.snapToIndex(2);
    navigation.navigate('Settings', {
      previous: 'Home',
    });
  }, [navigation]);

  const gotoBack = useCallback(() => navigation.navigate('Maps'), [navigation]);

  useEffect(() => {
    //coordsは深いオブジェクトのため値を変更しても変更したとみなされない。

    // console.log('jump', route.params?.jumpTo);
    // console.log('previous', route.params?.previous);
    // console.log('tileMap', route.params?.tileMap);

    if (route.params?.jumpTo != null) {
      //console.log(route.params.jumpTo);
      changeMapRegion({ ...route.params.jumpTo, zoom }, true);
    }
    if (route.params?.previous === 'Settings') {
      bottomSheetRef.current?.close();
    } else if (route.params?.previous === 'DataEdit') {
      bottomSheetRef.current?.snapToIndex(1);
    } else if (route.params?.previous === 'Maps') {
      if (route.params?.tileMap) {
        //closeできないバグ？のため仕方なく0にしている
        bottomSheetRef.current?.snapToIndex(0);
      } else {
        bottomSheetRef.current?.snapToIndex(2);
      }
    }
    //navigation.setParams({ jumpTo: undefined, previous: undefined, tileMap: undefined });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.jumpTo]);

  useEffect(() => {
    //Web版は自分の位置は共有しない。取得はする。
    if (Platform.OS !== 'web') {
      uploadLocation(currentLocation);
    }
  }, [currentLocation, uploadLocation]);

  useEffect(() => {
    return bottomSheetRef.current?.close();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    //起動時に読み込む場合

    //編集中にアプリを落とした場合に再起動時に編集を破棄する
    setIsEditingRecord(false);

    (async () => {
      await importExternalFiles();
      const size = await calculateStorageSize();
      //console.log('size', size, 'MB');
      if (size > 15) {
        await AlertAsync(`${Math.floor(size)}MB > 15MB \n ${t('Home.alert.storage')}`);
      }
    })();

    //バックグラウンド時に読み込む場合
    const subscription = RNAppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        await importExternalFiles();
        const size = await calculateStorageSize();
        //console.log('size', size, 'MB');
        if (size > 15) {
          await AlertAsync(`${Math.floor(size)}MB > 15MB \n ${t('Home.alert.storage')}`);
        }
      }
    });
    return () => {
      subscription.remove();
    };

    async function importExternalFiles() {
      const files = await getReceivedFiles();
      if (files === undefined) return;
      const file = files.find((f) => {
        const ext = getExt(f.name)?.toLowerCase();
        if (
          ext === 'gpx' ||
          ext === 'geojson' ||
          ext === 'kml' ||
          ext === 'kmz' ||
          ext === 'zip' ||
          ext === 'csv' ||
          ext === 'json'
        )
          return true;
      });
      if (file === undefined) return;
      if (file.size === undefined) {
        await AlertAsync(t('hooks.message.cannotGetFileSize'));
        return;
      }
      if (file.size / 1024 > 1000) {
        await AlertAsync(t('hooks.message.cannotImportData'));
        return;
      }
      const { message } = await importGeoFile(file.uri, file.name);
      if (message !== '') await AlertAsync(message);
      await deleteReceivedFiles(files);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLocationPoint = useCallback(async () => {
    if (Platform.OS === 'web') {
      await AlertAsync(t('Home.alert.gpsWeb'));
      return;
    }
    if (gpsState === 'off' && trackingState === 'off') {
      await AlertAsync(t('Home.alert.gps'));
      return;
    }

    const { isOK, message, layer, record } = await addCurrentPoint();
    if (!isOK || layer === undefined || record === undefined) {
      await AlertAsync(message);
    } else {
      bottomSheetRef.current?.snapToIndex(2);

      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: record,
        targetLayer: layer,
        targetRecordSet: [],
        targetIndex: 0,
      });
    }
    selectDrawTool(currentDrawTool);
  }, [addCurrentPoint, currentDrawTool, gpsState, navigation, selectDrawTool, trackingState]);

  const getInfoOfFeature = useCallback(
    async (event: GestureResponderEvent) => {
      if (isEditingRecord) {
        await AlertAsync(t('Home.alert.discardChanges'));
        return;
      }

      const { layer, feature, recordSet, recordIndex } = selectSingleFeature(event);

      if (layer === undefined || feature === undefined || recordSet === undefined || recordIndex === undefined) {
        unselectRecord();
        return;
      }
      bottomSheetRef.current?.snapToIndex(1);
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: { ...feature },
        targetLayer: { ...layer },
        targetRecordSet: recordSet,
        targetIndex: recordIndex,
      });
    },
    [isEditingRecord, navigation, selectSingleFeature, unselectRecord]
  );

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: async (e: GestureResponderEvent) => {
          //@ts-ignore
          isPencilTouch.current = !!e.nativeEvent.altitudeAngle;
          if (currentDrawTool === 'MOVE') {
            hideDrawLine();
          } else if (currentDrawTool === 'ADD_LOCATION_POINT') {
            await addLocationPoint();
          } else if (isInfoTool(currentDrawTool)) {
            await getInfoOfFeature(e);
          } else if (currentDrawTool !== 'NONE') {
            pressSvgView(e);
          } else if (currentMapMemoTool !== 'NONE') {
            if (!isPencilTouch.current && isPencilModeActive) return;
            onPanResponderGrantMapMemo(e);
          } else {
            unselectRecord();
          }
        },
        onPanResponderMove: (e: GestureResponderEvent, gesture) => {
          //@ts-ignore

          if (currentDrawTool === 'MOVE') {
          } else if (isPinch) {
          } else if (gesture.numberActiveTouches === 2) {
            clearMapMemoEditingLine();
            hideDrawLine();
            setIsPinch(true);
          } else if (isMapMemoDrawTool(currentMapMemoTool) && isPencilModeActive && !isPencilTouch.current) {
            //指による移動
          } else if (isMapMemoDrawTool(currentMapMemoTool)) {
            onPanResponderMoveMapMemo(e);
          } else if (currentDrawTool !== 'NONE') {
            moveSvgView(e);
          }
        },
        onPanResponderRelease: async (e: GestureResponderEvent) => {
          if (currentDrawTool === 'MOVE') {
            showDrawLine();
          } else if (isPinch) {
            showDrawLine();
            setIsPinch(false);
          } else if (currentMapMemoTool !== 'NONE') {
            onPanResponderReleaseMapMemo();
          } else if (currentDrawTool !== 'NONE') {
            onReleaseSvgView(e);
          }
          isPencilTouch.current = false;
        },
      }),
    [
      addLocationPoint,
      clearMapMemoEditingLine,
      currentDrawTool,
      currentMapMemoTool,
      getInfoOfFeature,
      hideDrawLine,
      isPencilModeActive,
      isPinch,
      moveSvgView,
      onPanResponderGrantMapMemo,
      onPanResponderMoveMapMemo,
      onPanResponderReleaseMapMemo,
      onReleaseSvgView,
      pressSvgView,
      showDrawLine,
      unselectRecord,
    ]
  );

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
        isLoading,
        isTermsOfUseOpen,
        projectName,
        user,
        isSynced,
        isShowingProjectButtons,
        isSettingProject,
        currentMapMemoTool,
        visibleMapMemoColor,
        currentPen,
        currentEraser,
        penColor,
        penWidth,
        mapMemoEditingLine: mapMemoEditingLine.current,
        editableMapMemo,
        vectorTileInfo,
        isPencilModeActive,
        isPencilTouch: isPencilTouch.current,
        onRegionChangeMapView,
        onPressMapView,
        onDragEndPoint,
        onDragMapView,
        onDrop,
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
        selectMapMemoTool,
        setPen,
        setEraser,
        setVisibleMapMemoColor,
        selectPenColor,
        pressUndoMapMemo,
        pressRedoMapMemo,
        panResponder,
        isDrawLineVisible,
        isPinch,
        closeVectorTileInfo,
        bottomSheetRef,
        onCloseBottomSheet,
        togglePencilMode,
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
