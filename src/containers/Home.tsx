import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { AppState as RNAppState, AppStateStatus, GestureResponderEvent, Platform } from 'react-native';
import { Region, MapEvent } from 'react-native-maps';
import { FeatureButtonType, LayerType, LineToolType, PointToolType, RecordType } from '../types';
import Home from '../components/pages/Home';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { useSelector } from 'react-redux';
import { HomeProps } from '../components/pages/Home';
import { AppState } from '../modules';
import { useTiles } from '../hooks/useTiles';
import { useFeature } from '../hooks/useFeature';
import { Props_Home } from '../routes';
import { useZoom } from '../hooks/useZoom';
import { useLocation } from '../hooks/useLocation';
import { isDrawTool, isSelectionTool } from '../utils/General';
import { ViewState } from 'react-map-gl';
import { useDisplay } from '../hooks/useDisplay';
import { t } from '../i18n/config';
import { useTutrial } from '../hooks/useTutrial';
import { useLayers } from '../hooks/useLayers';
import { useWindow } from '../hooks/useWindow';
import { isHisyouTool } from '../plugins/hisyoutool/utils';

export default function HomeContainers({ navigation, route }: Props_Home) {
  const tileMaps = useSelector((state: AppState) => state.tileMaps);

  const mapType = useSelector((state: AppState) => state.settings.mapType);
  const isOffline = useSelector((state: AppState) => state.settings.isOffline);
  const isEditingRecord = useSelector((state: AppState) => state.settings.isEditingRecord);
  const memberLocations = useSelector((state: AppState) => state.settings.memberLocation);
  const [restored] = useState(true);
  const { isDataOpened, openData, expandData, closeData } = useDisplay();
  const { editable, getReceivedFile, importDropedFile } = useLayers();
  const { mapViewRef, mapRegion, isLandscape, changeMapRegion } = useWindow();
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
    layers,
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    isEditingLine,
    pointTool,
    currentLineTool,
    polygonTool,
    featureButton,
    selectedRecord,
    drawLine,
    modifiedLine,
    selectLine,
    drawToolsSettings,
    addCurrentPoint,
    addPressPoint,
    addTrack,
    deselectFeature,
    setPointTool,
    setLineTool,
    setFeatureButton,
    dragEndPoint,
    toggleTerrainForWeb,
    saveLine,
    deleteLine,
    undoEditLine,
    pressSvgView,
    onMoveSvgView,
    onReleaseSvgView,
    selectSingleFeature,
  } = useFeature(mapViewRef.current);

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

  const { isTermsOfUseOpen, runTutrial, termsOfUseOK, termsOfUseCancel } = useTutrial();

  //Zoom関連
  const { zoom, zoomDecimal, zoomIn, zoomOut } = useZoom(mapViewRef.current);

  //Project Buttons関連

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
  const draggablePoint = useMemo(() => pointTool === 'MOVE', [pointTool]);

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

  const onPressMapView = useCallback(
    async (e: MapEvent<{}>) => {
      if (pointTool === 'ADD_LOCATION') {
        if (Platform.OS === 'web') {
          Alert.alert('', t('Home.alert.gpsWeb'));
          return;
        }
        if (gpsState === 'off' && trackingState === 'off') {
          Alert.alert('', t('Home.alert.gps'));
          return;
        }
        setPointTool('NONE');
        const { isOK, message, layer, data } = await addCurrentPoint();
        if (!isOK || layer === undefined || data === undefined) {
          Alert.alert('', message);
        } else {
          expandData();
          setTimeout(function () {
            navigation.navigate('DataEdit', {
              previous: 'Home',
              targetData: data,
              targetLayer: layer,
            });
          }, 1);
        }
      } else if (pointTool === 'ADD') {
        setPointTool('NONE');
        const { isOK, message, layer, data } = addPressPoint(e);
        if (!isOK || layer === undefined || data === undefined) {
          Alert.alert('', message);
          return;
        }
        expandData();
        setTimeout(function () {
          navigation.navigate('DataEdit', {
            previous: 'Home',
            targetData: data,
            targetLayer: layer,
          });
        }, 1);
      } else if (pointTool === 'NONE') {
        deselectFeature();
      }
    },
    [
      addCurrentPoint,
      addPressPoint,
      expandData,
      gpsState,
      navigation,
      pointTool,
      setPointTool,
      deselectFeature,
      trackingState,
    ]
  );

  const onDragEndPoint = useCallback(
    (e: MapEvent<{}>, layer: LayerType, feature: RecordType) => {
      const coordinate = e.nativeEvent.coordinate;
      ConfirmAsync(t('Home.confirm.drag')).then((shouldUpdate) => {
        const { isOK, message } = dragEndPoint(layer, feature, coordinate, shouldUpdate);
        if (!isOK) {
          Alert.alert('', message);
        }
      });
    },
    [dragEndPoint]
  );

  const onPressPoint = useCallback(
    (layer: LayerType, feature: RecordType) => {
      if (pointTool === 'NONE' && currentLineTool === 'NONE' && polygonTool === 'NONE') {
        if (isEditingRecord) {
          AlertAsync(t('Home.alert.discardChanges'));
          return;
        }
        openData();

        navigation.navigate('DataEdit', {
          previous: 'Data',
          targetData: { ...feature },
          targetLayer: { ...layer },
        });
        const region = isLandscape
          ? { ...mapRegion, longitudeDelta: mapRegion.longitudeDelta / 2 }
          : { ...mapRegion, latitudeDelta: mapRegion.latitudeDelta / 2 };
        setTimeout(() => changeMapRegion(region, true), 300);
      }
    },
    [
      changeMapRegion,
      currentLineTool,
      isEditingRecord,
      isLandscape,
      mapRegion,
      navigation,
      openData,
      pointTool,
      polygonTool,
    ]
  );

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

  const onPressSvgView = useCallback(
    async (event: GestureResponderEvent) => {
      if (currentLineTool === 'INFO') {
        const { layer, feature } = selectSingleFeature(event);
        if (layer === undefined || feature === undefined) {
          deselectFeature();
          return;
        }
        if (isEditingRecord) {
          await AlertAsync(t('Home.alert.discardChanges'));
          return;
        }

        openData();
        navigation.navigate('DataEdit', {
          previous: 'Data',
          targetData: { ...feature },
          targetLayer: { ...layer },
        });
        const region = isLandscape
          ? { ...mapRegion, longitudeDelta: mapRegion.longitudeDelta / 2 }
          : { ...mapRegion, latitudeDelta: mapRegion.latitudeDelta / 2 };
        setTimeout(() => changeMapRegion(region, true), 300);
      } else {
        pressSvgView(event);
      }
    },
    [
      changeMapRegion,
      currentLineTool,
      deselectFeature,
      isEditingRecord,
      isLandscape,
      mapRegion,
      navigation,
      openData,
      pressSvgView,
      selectSingleFeature,
    ]
  );

  /************** select button ************/
  const selectLineTool = useCallback(
    (value: LineToolType) => {
      if (isDrawTool(value)) {
        if (currentLineTool === value) {
          if (isEditingLine) return;
          //ドローツールをオフ
          setLineTool('NONE');
        } else {
          //ドローツールをオン
          setLineTool(value);
        }
      } else if (isSelectionTool(value)) {
        if (currentLineTool === value) {
          drawLine.current = [];
          setLineTool('NONE');
        } else {
          setLineTool(value);
        }
      } else if (isHisyouTool(value)) {
        if (currentLineTool === value) {
          setLineTool('NONE');
        } else {
          setLineTool(value);
        }
      } else {
        if (value === 'MOVE') {
          if (currentLineTool === value) {
            setLineTool('NONE');
          } else {
            setLineTool(value);
          }
        }
      }
    },
    [currentLineTool, drawLine, isEditingLine, setLineTool]
  );

  const selectPointTool = useCallback(
    async (value: PointToolType) => {
      if (value === pointTool) {
        setPointTool('NONE');
      } else {
        await runTutrial(`POINTTOOL_${value}`);
        setPointTool(value);
      }
    },
    [pointTool, runTutrial, setPointTool]
  );

  const selectFeatureButton = useCallback(
    (value: FeatureButtonType) => {
      setPointTool('NONE');
      setLineTool('NONE');
      toggleTerrainForWeb(value);
      setFeatureButton(value);
    },
    [setFeatureButton, setLineTool, setPointTool, toggleTerrainForWeb]
  );

  /**************** press ******************/

  const pressUndoEditLine = useCallback(async () => {
    undoEditLine();
  }, [undoEditLine]);

  const pressSaveEditLine = useCallback(async () => {
    const { isOK, message, layer, data } = saveLine();
    if (!isOK) {
      Alert.alert('', message);
      return;
    }
    setLineTool('NONE');
    if (layer !== undefined && data !== undefined) {
      openData();
      setTimeout(function () {
        navigation.navigate('DataEdit', {
          previous: 'Home',
          targetData: data,
          targetLayer: layer,
        });
      }, 1);
    }
  }, [navigation, openData, saveLine, setLineTool]);

  const pressDeleteLine = useCallback(() => {
    deleteLine();
  }, [deleteLine]);

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
      const { isOK, message } = addTrack();
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
  }, [addTrack, setFeatureButton, toggleGPS, toggleTracking, trackingState]);

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
    zoomIn();
  }, [zoomIn]);

  const pressZoomOut = useCallback(() => {
    zoomOut();
  }, [zoomOut]);

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
      changeMapRegion(route.params.jumpTo, true);
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

  const props: HomeProps = {
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    isEditingLine,
    drawLine: drawLine.current,
    modifiedLine: modifiedLine.current,
    selectLine: selectLine.current,
    layers,
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
    pointTool,
    currentLineTool,
    selectedRecord,
    draggablePoint,
    drawToolsSettings,
    isTermsOfUseOpen,
    isDataOpened,
    isLoading,
    onRegionChangeMapView,
    onPressMapView,
    onDragMapView,
    onDragEndPoint,
    onPressPoint,
    onDrop,
    onPressSvgView,
    onMoveSvgView,
    onReleaseSvgView,
    selectFeatureButton,
    selectPointTool,
    selectLineTool,
    pressZoomIn,
    pressZoomOut,
    pressCompass,
    pressGPS,
    pressTracking,
    pressDownloadTiles,
    pressStopDownloadTiles,
    pressDeleteTiles,
    pressUndoEditLine,
    pressSaveEditLine,
    pressDeleteLine,
    pressTermsOfUseOK: termsOfUseOK,
    pressTermsOfUseCancel: termsOfUseCancel,
    gotoMaps,
    gotoSettings,
    gotoLayers,
    gotoBack,
  };

  return <Home {...props} />;
}
