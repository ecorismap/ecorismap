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
import { FeatureButtonType, DrawToolType, MapMemoToolType, LayerType, RecordType, RegionType } from '../types';
import Home from '../components/pages/Home';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { shallowEqual, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { useTiles } from '../hooks/useTiles';
import { useRecord } from '../hooks/useRecord';
import { Props_Home } from '../routes';
import { useMapView } from '../hooks/useMapView';
import { useLocation } from '../hooks/useLocation';
import { getExt, isInfoTool, isLineTool, isMapMemoDrawTool, isPointTool, isPolygonTool } from '../utils/General';
import { MapLayerMouseEvent, MapRef, ViewState } from 'react-map-gl';
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
import { getReceivedFiles, deleteReceivedFiles, customShareAsync, exportFile } from '../utils/File';
import { importDropedFile } from '../utils/File.web';
import { useMapMemo } from '../hooks/useMapMemo';
import { useVectorTile } from '../hooks/useVectorTile';
import { useWindow } from '../hooks/useWindow';
import { latLonToXY } from '../utils/Coords';
import { Position } from '@turf/turf';
import BottomSheet from '@gorhom/bottom-sheet';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { usePDF } from '../hooks/usePDF';
import { HomeModalPDFSettings } from '../components/organisms/HomeModalPDFSettings';
import dayjs from 'dayjs';
export default function HomeContainers({ navigation, route }: Props_Home) {
  const [restored] = useState(true);
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isPencilTouch = useRef<boolean | undefined>(undefined);
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const mapType = useSelector((state: AppState) => state.settings.mapType, shallowEqual);
  const isOffline = useSelector((state: AppState) => state.settings.isOffline, shallowEqual);
  const isEditingRecord = useSelector((state: AppState) => state.settings.isEditingRecord, shallowEqual);
  const memberLocations = useSelector((state: AppState) => state.settings.memberLocation, shallowEqual);
  const layers = useSelector((state: AppState) => state.layers);
  const dataSet = useSelector((state: AppState) => state.dataSet);
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
    activePointLayer,
    activeLineLayer,
    activePolygonLayer,
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
    isUndoable,
    isRedoable,
    mapMemoLines,
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

  const {
    visibleHisyouToolSetting,
    hisyouLayerId,
    pressHisyouToolSettingOK,
    pressHisyouToolSettingCancel,
    showHisyouToolSetting,
  } = useHisyouToolSetting();

  const {
    isPDFSettingsVisible,
    pdfArea,
    pdfOrientation,
    pdfPaperSize,
    pdfScale,
    pdfOrientations,
    pdfPaperSizes,
    pdfScales,
    pdfTileMapZoomLevel,
    pdfTileMapZoomLevels,
    outputVRT,
    outputDataPDF,
    setPdfOrientation,
    setPdfPaperSize,
    setPdfScale,
    generatePDF,
    generateVRT,
    generateDataPDF,
    setIsPDFSettingsVisible,
    setPdfTileMapZoomLevel,
    setOutputVRT,
    setOutputDataPDF,
  } = usePDF();
  const { vectorTileInfo, getVectorTileInfo, openVectorTileInfo, closeVectorTileInfo } = useVectorTile();
  const { mapSize, mapRegion, isLandscape } = useWindow();

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
  const isExportPDFPage = useMemo(() => route.params?.mode === 'exportPDF', [route.params?.mode]);

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
        if (value.includes('PEN')) {
          if (!editableMapMemo) {
            Alert.alert('', t('Home.alert.cannotEdit'));
            return;
          }
          const ret = changeColorTypeToIndividual();
          if (ret) Alert.alert('', t('Home.alert.individualColor'));
        }
        setDrawTool('NONE');
        setMapMemoTool(value);
      }
    },
    [changeColorTypeToIndividual, currentMapMemoTool, editableMapMemo, setDrawTool, setMapMemoTool]
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

          if (isPointTool(value)) {
            if (activePointLayer === undefined) {
              await AlertAsync(t('Home.alert.cannotEdit'));
              return;
            }
            await runTutrial(`POINTTOOL_${value}`);
          } else if (isLineTool(value)) {
            if (activeLineLayer === undefined) {
              await AlertAsync(t('Home.alert.cannotEdit'));
              return;
            }
            await runTutrial(`LINETOOL_${value}`);
          } else if (isPolygonTool(value)) {
            if (activePolygonLayer === undefined) {
              await AlertAsync(t('Home.alert.cannotEdit'));
              return;
            }
            await runTutrial(`POLYGONTOOL_${value}`);
          }

          setDrawTool(value);
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
          if (featureButton === 'LINE' && activeLineLayer === undefined) {
            await AlertAsync(t('Home.alert.cannotEdit'));
            return;
          } else if (featureButton === 'POLYGON' && activePolygonLayer === undefined) {
            await AlertAsync(t('Home.alert.cannotEdit'));
            return;
          }
          setDrawTool(value);
          await runTutrial('SELECTIONTOOL');
        }
      } else if (value === 'DELETE_POINT') {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          if (activePointLayer === undefined) {
            await AlertAsync(t('Home.alert.cannotEdit'));
            return;
          }
          setDrawTool(value);
        }
      } else if (value === 'MOVE_POINT') {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          if (activePointLayer === undefined) {
            await AlertAsync(t('Home.alert.cannotEdit'));
            return;
          }
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
      activeLineLayer,
      activePointLayer,
      activePolygonLayer,
      currentDrawTool,
      featureButton,
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

  const pressZoomIn = useCallback(() => {
    hideDrawLine();
    zoomIn();
  }, [hideDrawLine, zoomIn]);

  const pressZoomOut = useCallback(() => {
    hideDrawLine();
    zoomOut();
  }, [hideDrawLine, zoomOut]);

  /****************** goto ****************************/

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

  const gotoHome = useCallback(() => {
    navigation.navigate('Home', { previous: 'Home', mode: undefined });
  }, [navigation]);

  const ajustMapRegion = useCallback(
    //画面がportraitの場合、画面の高さの1/4の緯度だけ下にずらす。landscapeの場合は、経度の1/4だけ右にずらす。
    (region: RegionType) => {
      if (isLandscape) {
        return { ...region, longitude: region.longitude + mapRegion.longitudeDelta / 4 };
      } else {
        return { ...region, latitude: region.latitude - mapRegion.latitudeDelta / 4 };
      }
    },
    [isLandscape, mapRegion.latitudeDelta, mapRegion.longitudeDelta]
  );

  const pressExportPDF = useCallback(async () => {
    //console.log('pressExportPDF');
    let mapUri: string | Window | null;
    let dataUri: string | Window | null;
    let vrt: string;
    try {
      const fileName = `ecorismap_map_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
      if (outputVRT) {
        vrt = generateVRT(fileName);
        await exportFile(vrt, fileName.replace('.pdf', '.vrt'));
      }
      // 作成した PDF を共有
      if (Platform.OS === 'web') {
        if (outputDataPDF) {
          setIsLoading(true);
          dataUri = await generateDataPDF({ dataSet, layers });
          setIsLoading(false);
          (dataUri as Window).document.title = fileName.replace('_map_', '_data_');
          (dataUri as Window).print();
          (dataUri as Window).close();
        }
        setIsLoading(true);
        mapUri = await generatePDF({ dataSet, layers });
        setIsLoading(false);
        setTimeout(async () => {
          (mapUri as Window).document.title = fileName;
          (mapUri as Window).print();
          (mapUri as Window).close();
        }, 5000);
      } else {
        if (outputDataPDF) {
          setIsLoading(true);
          mapUri = await generatePDF({ dataSet, layers });
          dataUri = await generateDataPDF({ dataSet, layers });
          setIsLoading(false);
          setTimeout(async () => {
            await customShareAsync(mapUri as string, { mimeType: 'application/pdf' }, fileName);
            await customShareAsync(
              dataUri as string,
              { mimeType: 'application/pdf' },
              fileName.replace('_map_', '_data_')
            );
          }, 2000);
        } else {
          setIsLoading(true);
          mapUri = await generatePDF({ dataSet, layers });
          setIsLoading(false);
          setTimeout(async () => {
            await customShareAsync(mapUri as string, { mimeType: 'application/pdf' }, fileName);
          }, 2000);
        }
      }
    } catch (e) {
      setIsLoading(false);
      console.log('###', e);
    } finally {
      setIsLoading(false);
    }
  }, [dataSet, generateDataPDF, generatePDF, generateVRT, layers, outputDataPDF, outputVRT]);

  const pressPDFSettingsOpen = useCallback(() => {
    setIsPDFSettingsVisible(true);
  }, [setIsPDFSettingsVisible]);

  useEffect(() => {
    //coordsは深いオブジェクトのため値を変更しても変更したとみなされない。

    // console.log('jump', route.params?.jumpTo);
    // console.log('previous', route.params?.previous);
    // console.log('tileMap', route.params?.tileMap);
    //console.log('mode', route.params?.mode);

    if (route.params?.jumpTo != null) {
      //console.log(route.params.jumpTo);
      const region = ajustMapRegion(route.params.jumpTo);
      changeMapRegion({ ...region, zoom }, true);
    }
    if (route.params?.previous === 'Settings') {
      setTimeout(() => bottomSheetRef.current?.close(), 300);
      toggleWebTerrainActive(false);
      if (Platform.OS !== 'web') toggleHeadingUp(false);
    } else if (route.params?.previous === 'DataEdit') {
      if (isLandscape) {
        bottomSheetRef.current?.snapToIndex(2);
      } else {
        bottomSheetRef.current?.snapToIndex(1);
      }
    } else if (route.params?.previous === 'Maps') {
      if (route.params?.tileMap) {
        setTimeout(() => bottomSheetRef.current?.close(), 300);
        toggleWebTerrainActive(false);
        if (Platform.OS !== 'web') toggleHeadingUp(false);
      } else {
        bottomSheetRef.current?.snapToIndex(2);
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.jumpTo, route.params?.previous, route.params?.tileMap]);

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
      if (isLandscape) {
        bottomSheetRef.current?.snapToIndex(2);
      } else {
        bottomSheetRef.current?.snapToIndex(1);
      }
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: { ...feature },
        targetLayer: { ...layer },
      });
    },
    [isEditingRecord, isLandscape, navigation, selectSingleFeature, unselectRecord]
  );

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: async (e: GestureResponderEvent) => {
          //console.log('#######################');
          //@ts-ignore
          isPencilTouch.current = !!e.nativeEvent.altitudeAngle;
          if (currentDrawTool === 'MOVE') {
            hideDrawLine();
          } else if (currentDrawTool === 'ADD_LOCATION_POINT') {
            await addLocationPoint();
          } else if (isInfoTool(currentDrawTool)) {
            await getInfoOfFeature(e);
          } else if (currentDrawTool !== 'NONE') {
            if (isPencilTouch.current === false && isPencilModeActive) {
              hideDrawLine();
              setIsPinch(true);
              return;
            }
            pressSvgView(e);
          } else if (featureButton === 'MEMO') {
            if (isMapMemoDrawTool(currentMapMemoTool) && isPencilTouch.current === false && isPencilModeActive) {
              setIsPinch(true);
              return;
            }
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
            setIsPinch(true);
          } else if (isMapMemoDrawTool(currentMapMemoTool)) {
            onPanResponderMoveMapMemo(e);
          } else if (currentDrawTool !== 'NONE') {
            moveSvgView(e);
          }
        },
        onPanResponderRelease: async (e: GestureResponderEvent) => {
          isPencilTouch.current = undefined;
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
        },
      }),
    [
      addLocationPoint,
      currentDrawTool,
      currentMapMemoTool,
      featureButton,
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
        isExportPDFPage,
        memberLocations,
        mapViewRef,
        mapType,
        tileMaps,
        savedTileSize,
        isDownloading,
        downloadArea,
        pdfArea,
        pdfOrientation,
        pdfPaperSize,
        pdfScale,
        pdfTileMapZoomLevel,
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
        currentMapMemoTool,
        visibleMapMemoColor,
        currentPen,
        currentEraser,
        penColor,
        penWidth,
        mapMemoEditingLine: mapMemoEditingLine.current,
        vectorTileInfo,
        isPencilModeActive,
        isPencilTouch: isPencilTouch.current,
        isUndoable,
        isRedoable,
        mapMemoLines,
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
        pressExportPDF,
        pressStopDownloadTiles,
        pressDeleteTiles,
        pressUndoDraw,
        pressSaveDraw,
        pressDeleteDraw,
        gotoMaps,
        gotoSettings,
        gotoLayers,
        gotoHome,
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
        pressPDFSettingsOpen,
      }}
    >
      <Home />
      {Platform.OS !== 'web' && <HomeModalTermsOfUse />}
      <HomeModalPDFSettings
        visible={isPDFSettingsVisible}
        pdfOrientation={pdfOrientation}
        pdfPaperSize={pdfPaperSize}
        pdfScale={pdfScale}
        pdfOrientations={pdfOrientations}
        pdfPaperSizes={pdfPaperSizes}
        pdfScales={pdfScales}
        pdfTileMapZoomLevel={pdfTileMapZoomLevel}
        pdfTileMapZoomLevels={pdfTileMapZoomLevels}
        outputVRT={outputVRT}
        outputDataPDF={outputDataPDF}
        setPdfOrientation={setPdfOrientation}
        setPdfPaperSize={setPdfPaperSize}
        setPdfScale={setPdfScale}
        setPdfTileMapZoomLevel={setPdfTileMapZoomLevel}
        setOutputVRT={setOutputVRT}
        setOutputDataPDF={setOutputDataPDF}
        pressOK={() => setIsPDFSettingsVisible(false)}
      />
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
