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
import { isInfoTool, isLineTool, isPointTool, isPolygonTool, isSelectionTool } from '../utils/General';
import { MapRef, ViewState } from 'react-map-gl';
import { useDisplay } from '../hooks/useDisplay';
import { t } from '../i18n/config';
import { useTutrial } from '../hooks/useTutrial';
import { useLayers } from '../hooks/useLayers';
import { useWindow } from '../hooks/useWindow';
import { isHisyouTool } from '../plugins/hisyoutool/utils';
import { ModalHisyouToolSetting } from '../plugins/hisyoutool/ModalHisyouToolSetting';
import { PLUGIN } from '../constants/AppConstants';
import { useHisyouToolSetting } from '../plugins/hisyoutool/useHisyouToolSetting';
import { HomeModalTermsOfUse } from '../components/organisms/HomeModalTermsOfUse';
import { usePointTool } from '../hooks/usePointTool';
import { useDrawTool } from '../hooks/useDrawTool';
import { HomeContext } from '../contexts/Home';
import { isPointRecordType } from '../utils/Data';

export default function HomeContainers({ navigation, route }: Props_Home) {
  const [restored] = useState(true);
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const mapType = useSelector((state: AppState) => state.settings.mapType);
  const isOffline = useSelector((state: AppState) => state.settings.isOffline);
  const isEditingRecord = useSelector((state: AppState) => state.settings.isEditingRecord);
  const memberLocations = useSelector((state: AppState) => state.settings.memberLocation);
  const { isDataOpened, openData, expandData, closeData } = useDisplay();
  const { editable, getReceivedFile, importDropedFile } = useLayers();
  const { mapRegion, isLandscape } = useWindow();
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
    isDrag,
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

  const {
    visibleHisyouToolSetting,
    hisyouLayerId,
    pressHisyouToolSettingOK,
    pressHisyouToolSettingCancel,
    showHisyouToolSetting,
  } = useHisyouToolSetting();

  const [isLoading] = useState(false);

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
        isDataOpened === 'closed' ? expandData() : openData();
        setTimeout(function () {
          navigation.navigate('DataEdit', {
            previous: 'Home',
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
    isDataOpened,
    expandData,
    openData,
    navigation,
  ]);

  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (!editable) {
        await AlertAsync(t('hooks.message.lockProject'));
        return;
      }
      const ret = await importDropedFile(acceptedFiles);
      if (ret.length > 0) {
        await AlertAsync(t('hooks.message.receiveFile'));
      }
      //console.log(ret);
    },
    [editable, importDropedFile]
  );

  const onReleaseSvgView = useCallback(
    async (event: GestureResponderEvent) => {
      if (isInfoTool(currentDrawTool)) {
        if (isDrag) {
          //INFOでドラッグした場合は移動のみ実行
          releaseSvgView(event);
        }
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
        //if (Platform.OS !== 'web') {
        //webの場合は、タイミングの関係？で選択の色付けがうまくいかないので、無効にする。
        isPointRecordType(feature);
        const region = isPointRecordType(feature)
          ? { ...mapRegion, longitude: feature.coords.longitude, latitude: feature.coords.latitude }
          : {
              ...mapRegion,
              longitude: feature.centroid?.longitude ?? feature.coords[0].longitude,
              latitude: feature.centroid?.latitude ?? feature.coords[0].latitude,
            };

        setTimeout(() => changeMapRegion(region, true), 300);
        // }
      } else {
        releaseSvgView(event);
      }
    },
    [
      currentDrawTool,
      isDrag,
      isEditingRecord,
      selectSingleFeature,
      openData,
      navigation,
      releaseSvgView,
      unselectRecord,
      mapRegion,
      changeMapRegion,
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
          previous: 'Home',
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

  /****************** goto ****************************/

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
    return closeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    //外部ファイルの読み込み
    const onChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        //console.log('!!!!', 'active');
        await getReceivedFile();
      }
    };
    //起動時に読み込む場合
    (async () => await getReceivedFile())();
    //バックグラウンド時に読み込む場合
    RNAppState.addEventListener('change', onChange);
    return () => {
      RNAppState.removeEventListener('change', onChange);
    };
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
        isDataOpened,
        isLoading,
        isTermsOfUseOpen,
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
        gotoMaps,
        gotoSettings,
        gotoLayers,
        gotoBack,
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
