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
import { FeatureButtonType, DrawToolType, MapMemoToolType, LayerType, RecordType, InfoToolType } from '../types';
import Home from '../components/pages/Home';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { shallowEqual, useSelector } from 'react-redux';
import { RootState } from '../store';
import { useTiles } from '../hooks/useTiles';
import { useRecord } from '../hooks/useRecord';
import { Props_Home } from '../routes';
import { useMapView } from '../hooks/useMapView';
import { useLocation } from '../hooks/useLocation';
import { useSyncLocation } from '../hooks/useSyncLocation';
import { useAccount } from '../hooks/useAccount';
import { MapLayerMouseEvent, MapRef, ViewState } from 'react-map-gl/maplibre';
import { useProject } from '../hooks/useProject';
import { validateStorageLicense } from '../utils/Project';
import {
  getExt,
  isFreehandTool,
  isLineTool,
  isMapMemoDrawTool,
  isPlotTool,
  isPointTool,
  isPolygonTool,
} from '../utils/General';
import { t } from '../i18n/config';
import { useTutrial } from '../hooks/useTutrial';
import { HomeModalTermsOfUse } from '../components/organisms/HomeModalTermsOfUse';
import { usePointTool } from '../hooks/usePointTool';
import { useDrawTool } from '../hooks/useDrawTool';
import { MapViewContext } from '../contexts/MapView';
import { DrawingToolsContext } from '../contexts/DrawingTools';
import { PDFExportContext } from '../contexts/PDFExport';
import { LocationTrackingContext } from '../contexts/LocationTracking';
import { ProjectContext } from '../contexts/Project';
import { SVGDrawingContext } from '../contexts/SVGDrawing';
import { TileManagementContext } from '../contexts/TileManagement';
import { MapMemoContext } from '../contexts/MapMemo';
import { DataSelectionContext } from '../contexts/DataSelection';
import { InfoToolContext } from '../contexts/InfoTool';
import { AppStateContext } from '../contexts/AppState';
import { useGeoFile } from '../hooks/useGeoFile';
import * as e3kit from '../lib/virgilsecurity/e3kit';
import { getReceivedFiles, deleteReceivedFiles, exportFileFromData, exportFileFromUri } from '../utils/File';
import { getDropedFile } from '../utils/File.web';
import { useMapMemo } from '../hooks/useMapMemo';
import { useVectorTile } from '../hooks/useVectorTile';
import { useWindow } from '../hooks/useWindow';
import { latLonToXY, xyArrayToLatLonObjects } from '../utils/Coords';
import BottomSheet from '@gorhom/bottom-sheet';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';

import { usePDF } from '../hooks/usePDF';
import { HomeModalPDFSettings } from '../components/organisms/HomeModalPDFSettings';
import dayjs from 'dayjs';
import { HomeModalStampPicker } from '../components/organisms/HomeModalStampPicker';
import { HomeModalPenPicker } from '../components/organisms/HomeModalPenPicker';
import { HomeModalBrushPicker } from '../components/organisms/HomeModalBrushPicker';
import { HomeModalEraserPicker } from '../components/organisms/HomeModalEraserPicker';
import { HomeModalInfoPicker } from '../components/organisms/HomeModalInfoPicker';
import { Position } from 'geojson';
import { useMaps } from '../hooks/useMaps';
import { useRepository } from '../hooks/useRepository';
import { ConflictResolverModal } from '../components/organisms/HomeModalConflictResolver';
import { selectNonDeletedDataSet } from '../modules/selectors';
import { useLayers } from '../hooks/useLayers';

export default function HomeContainers({ navigation, route }: Props_Home) {
  const [restored] = useState(true);
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const user = useSelector((state: RootState) => state.user);
  const projectName = useSelector((state: RootState) => state.settings.projectName, shallowEqual);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const mapType = useSelector((state: RootState) => state.settings.mapType, shallowEqual);
  const isOffline = useSelector((state: RootState) => state.settings.isOffline, shallowEqual);
  const isEditingRecord = useSelector((state: RootState) => state.settings.isEditingRecord, shallowEqual);
  const memberLocations = useSelector((state: RootState) => state.settings.memberLocation, shallowEqual);

  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const fullDataSet = useSelector((state: RootState) => state.dataSet);

  const routeName = getFocusedRouteNameFromRoute(route);

  const { importGeoFile } = useGeoFile();
  const { runTutrial } = useTutrial();
  const { zoom, zoomDecimal, zoomIn, zoomOut, changeMapRegion } = useMapView(mapViewRef.current);
  const { isConnected } = useNetInfo();

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
    selectRecord,
    unselectRecord,
    checkRecordEditable,
    calculateStorageSize,
    setIsEditingRecord,
  } = useRecord();
  const { changeActiveLayer } = useLayers();
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
    visibleInfoPicker,
    isInfoToolActive,
    currentInfoTool,
    isPencilTouch,
    isPinch,
    isTerrainActive,
    isModalInfoToolHidden,
    setDrawTool,
    setPointTool,
    setLineTool,
    setPolygonTool,
    setFeatureButton,
    saveLine,
    savePolygon,
    deleteDraw,
    undoDraw,
    finishEditObject,
    selectSingleFeature,
    showDrawLine,
    hideDrawLine,
    resetDrawTools,
    toggleTerrain,
    setVisibleInfoPicker,
    setCurrentInfoTool,
    setIsPinch,
    handleReleaseDeletePoint,
    handleReleaseSelect,
    handleGrantPlot,
    handleMovePlot,
    handleReleasePlotPoint,
    handleReleasePlotLinePolygon,
    handleGrantFreehand,
    handleMoveFreehand,
    handleReleaseFreehand,
    handleGrantSplitLine,
    getPXY,
    savePoint,
    selectObjectByFeature,
    checkSplitLine,
    setIsModalInfoToolHidden,
    setInfoToolActive,
  } = useDrawTool(mapViewRef.current);

  const {
    visibleMapMemoColor,
    visibleMapMemoPen,
    visibleMapMemoStamp,
    visibleMapMemoBrush,
    visibleMapMemoEraser,
    currentMapMemoTool,
    currentPenWidth,
    penColor,
    penWidth,
    mapMemoEditingLine,
    editableMapMemo,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    mapMemoLines,
    snapWithLine,
    arrowStyle,
    isStraightStyle,
    isModalMapMemoToolHidden,
    isEditingLine,
    editingLineId,
    setMapMemoTool,
    setPenWidth,
    setVisibleMapMemoColor,
    setVisibleMapMemoPen,
    setVisibleMapMemoStamp,
    setVisibleMapMemoBrush,
    setVisibleMapMemoEraser,
    setArrowStyle,
    selectPenColor,
    handleGrantMapMemo,
    handleMoveMapMemo,
    handleReleaseMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    clearMapMemoHistory,
    clearMapMemoEditingLine,
    changeColorTypeToIndividual,
    setPencilModeActive,
    setSnapWithLine,
    setIsStraightStyle,
    setIsModalMapMemoToolHidden,
  } = useMapMemo(mapViewRef.current);
  const { importPdfFile, importPmtilesFile, updatePmtilesURL } = useMaps();
  const { addCurrentPoint, resetPointPosition, updatePointPosition, getCurrentPoint } = usePointTool();
  //現在位置、GPS関連
  const {
    currentLocation,
    gpsState,
    trackingState,
    headingUp,
    azimuth,
    trackLog,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
    checkUnsavedTrackLog,
    saveTrackLog,
    confirmLocationPermission,
    // 擬似GPS関連を追加
    useMockGps,
    toggleMockGps,
    mockGpsProgress,
  } = useLocation(mapViewRef);
  //現在位置の共有関連
  const { uploadLocation } = useSyncLocation(projectId);

  //Account関連
  const { logout } = useAccount();
  //Project Buttons関連
  const {
    isSettingProject,
    isOwnerAdmin,
    isSynced,
    project,
    projectRegion,
    uploadData,
    syncPosition,
    clearProject,
    saveProjectSetting,
  } = useProject();

  const [isShowingProjectButtons, setIsShowingProjectButtons] = useState(false);

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

  const {
    conflictState,
    handleSelect,
    handleBulkSelect,
    fetchPublicData,
    fetchPrivateData,
    fetchTemplateData,
    createMergedDataSet,
  } = useRepository();

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

  const downloadMode = useMemo(() => route.params?.tileMap !== undefined, [route.params?.tileMap]);
  const downloadTileMapName = useMemo(() => route.params?.tileMap?.name || '', [route.params?.tileMap]);
  const exportPDFMode = useMemo(() => route.params?.mode === 'exportPDF', [route.params?.mode]);

  /******************************* */
  const downloadData = useCallback(
    async ({ isAdmin = false, shouldPhotoDownload = false }) => {
      if (project === undefined) throw new Error(t('hooks.message.unknownError'));
      if (isAdmin) {
        //自分以外のPUBLICとPRIVATEデータをサーバーから取得する
        const [publicRes, privateRes, templateRes] = await Promise.all([
          fetchPublicData(project, shouldPhotoDownload, 'others'),
          fetchPrivateData(project, shouldPhotoDownload, 'others'),
          fetchTemplateData(project, shouldPhotoDownload),
        ]);
        if (!publicRes.isOK || !privateRes.isOK || !templateRes.isOK) {
          throw new Error(publicRes.message || privateRes.message || templateRes.message);
        }
        //自分のPRIVATEデータをローカルから取得する。（編集されている可能性のため）
        const privateLayerIds = layers.filter((layer) => layer.permission === 'PRIVATE').map((layer) => layer.id);
        const ownPrivateData = fullDataSet.filter((d) => privateLayerIds.includes(d.layerId) && d.userId === user.uid);

        //自分のPUBLICデータをローカルから取得する。（編集されている可能性のため）
        const publicLayerIds = layers.filter((layer) => layer.permission === 'PUBLIC').map((layer) => layer.id);
        const ownPublicData = fullDataSet.filter((d) => publicLayerIds.includes(d.layerId) && d.userId === user.uid);
        const mergedDataResult = await createMergedDataSet({
          privateData: [...privateRes.data, ...ownPrivateData],
          publicData: [...publicRes.data, ...ownPublicData],
          templateData: templateRes.data,
        });
        if (!mergedDataResult.isOK) throw new Error(mergedDataResult.message);
      } else {
        //自分以外のPUBLICデータをサーバーから取得する
        const [publicRes, templateRes] = await Promise.all([
          fetchPublicData(project, shouldPhotoDownload, 'others'),
          fetchTemplateData(project, shouldPhotoDownload),
        ]);
        if (!publicRes.isOK || !templateRes.isOK) {
          throw new Error(publicRes.message || templateRes.message);
        }
        //自分のPUBLICデータをローカルから取得する。（編集されている可能性のため）
        const publicLayerIds = layers.filter((layer) => layer.permission === 'PUBLIC').map((layer) => layer.id);
        const ownPublicData = fullDataSet.filter((d) => publicLayerIds.includes(d.layerId) && d.userId === user.uid);

        const mergedDataResult = await createMergedDataSet({
          privateData: [],
          publicData: [...publicRes.data, ...ownPublicData],
          templateData: templateRes.data,
        });
        if (!mergedDataResult.isOK) throw new Error(mergedDataResult.message);
      }
    },
    [createMergedDataSet, fetchPrivateData, fetchPublicData, fetchTemplateData, fullDataSet, layers, project, user.uid]
  );

  /*************** onXXXXMapView *********************/

  const onCloseBottomSheet = useCallback(async () => {
    if (routeName === 'DataEdit') {
      if (isEditingRecord) {
        const ret = await ConfirmAsync(t('DataEdit.confirm.gotoBack'));
        if (ret) {
          setIsEditingRecord(false);
          unselectRecord();
          //ToDo 写真の削除処理はどうする？
        } else {
          bottomSheetRef.current?.snapToIndex(2);
          return;
        }
      } else {
        if (route.params?.mode !== 'editPosition') unselectRecord();
      }
    }
    bottomSheetRef.current?.close();
  }, [isEditingRecord, route.params?.mode, routeName, setIsEditingRecord, unselectRecord]);

  const onRegionChangeMapView = useCallback(
    (region: Region | ViewState) => {
      changeMapRegion(region);
      !isDrawLineVisible && showDrawLine();
      closeVectorTileInfo();
    },
    [changeMapRegion, closeVectorTileInfo, isDrawLineVisible, showDrawLine]
  );

  // const getGeologyInfo = useCallback(async (latlon: Position) => {
  //   const url = `https://gbank.gsj.jp/seamless/v2/api/1.0/legend.json?point=${latlon[1]},${latlon[0]}`;
  //   const response = await fetch(url);
  //   if (response.ok) {
  //     const json = await response.json();
  //     if (json.symbol !== null) {
  //       return {
  //         記号: json.symbol,
  //         大区分: json.group_ja,
  //         形成時代: json.formationAge_ja,
  //         岩相: json.lithology_ja,
  //         出典: '「20万分の1日本シームレス地質図V2（©産総研地質調査総合センター）」',
  //       };
  //     }
  //   }
  // }, []);

  const getVectorTileInfoForWeb = useCallback((xy: Position) => {
    const map_ = (mapViewRef.current as MapRef).getMap();
    //@ts-ignore
    const features = map_.queryRenderedFeatures(xy);
    const vectorTileFeatures = features.filter((feature) => {
      const layer = map_.getLayer(feature.layer.id);
      //@ts-ignore
      return layer && layer.source && map_.getSource(layer.source).type === 'vector';
    });
    const properties = vectorTileFeatures
      ? vectorTileFeatures.map((f) => f.properties).filter((v) => v !== undefined)
      : [];
    return properties;
  }, []);

  const getInfoOfMap = useCallback(
    async (latlon: Position, xy: Position) => {
      let properties: { [key: string]: any }[];

      //vectorTileの情報を取得
      if (Platform.OS === 'web') {
        properties = getVectorTileInfoForWeb(xy);
      } else {
        properties = await getVectorTileInfo(latlon, zoom);
      }
      // Todo 設定で地質図の表示を選択できるようにする
      // //地質図の情報を取得
      // const geologyInfo = await getGeologyInfo(latlon);
      // if (geologyInfo) {
      //   properties = [...properties, geologyInfo];
      // }

      if (properties === undefined) {
        closeVectorTileInfo();
      } else {
        //console.log(properties, position);
        openVectorTileInfo(properties, xy);
      }
    },
    [closeVectorTileInfo, getVectorTileInfo, getVectorTileInfoForWeb, openVectorTileInfo, zoom]
  );

  const onPressMapView = useCallback(
    async (event: MapPressEvent | MapLayerMouseEvent) => {
      if (isInfoToolActive || featureButton !== 'NONE') return;
      let latlon: Position;
      let xy: Position;
      if (Platform.OS === 'web') {
        const e = event as MapLayerMouseEvent;
        xy = [e.point.x, e.point.y];
        latlon = [e.lngLat.lng, e.lngLat.lat];
      } else {
        const e = event as MapPressEvent;
        latlon = [e.nativeEvent.coordinate.longitude, e.nativeEvent.coordinate.latitude];
        xy = latLonToXY(latlon, mapRegion, mapSize, mapViewRef.current);
      }
      await getInfoOfMap(latlon, xy);
    },
    [featureButton, getInfoOfMap, isInfoToolActive, mapRegion, mapSize]
  );

  const onDragMapView = useCallback(async () => {
    //console.log('onDragMapView');
    if (gpsState === 'follow') {
      await toggleGPS('show');
    }
  }, [gpsState, toggleGPS]);

  const togglePencilMode = useCallback(() => {
    runTutrial('PENCILMODE');
    setPencilModeActive(!isPencilModeActive);
  }, [isPencilModeActive, runTutrial, setPencilModeActive]);

  const selectMapMemoTool = useCallback(
    (value: MapMemoToolType | undefined) => {
      setInfoToolActive(false);
      if (value === undefined) {
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
    [changeColorTypeToIndividual, editableMapMemo, setDrawTool, setInfoToolActive, setMapMemoTool]
  );

  const selectInfoTool = useCallback(
    async (value: InfoToolType | undefined) => {
      if (value === undefined) {
        setInfoToolActive(false);
        toggleTerrain(true);
      } else {
        setInfoToolActive(true);
        setCurrentInfoTool(value);
        toggleTerrain(false);
        if (Platform.OS !== 'web') await toggleHeadingUp(false);
      }
      resetDrawTools();
      setDrawTool('NONE');
      setMapMemoTool('NONE');
    },
    [resetDrawTools, setCurrentInfoTool, setDrawTool, setInfoToolActive, setMapMemoTool, toggleHeadingUp, toggleTerrain]
  );

  /************** select button ************/

  const selectFeatureButton = useCallback(
    (value: FeatureButtonType) => {
      setDrawTool('NONE');
      setMapMemoTool('NONE');
      toggleTerrain(value === 'NONE');
      setFeatureButton(value);
      resetDrawTools();
      clearMapMemoHistory();
      if (Platform.OS !== 'web') toggleHeadingUp(false);
    },
    [setDrawTool, setMapMemoTool, toggleTerrain, setFeatureButton, resetDrawTools, clearMapMemoHistory, toggleHeadingUp]
  );

  const finishEditPosition = useCallback(() => {
    bottomSheetRef.current?.snapToIndex(2);
    setTimeout(() => {
      //onPressMapViewでInfoToolがアクティブになるのを防ぐためSetTimeoutで遅延させる
      selectFeatureButton('NONE');
    }, 500);

    navigation.setParams({ mode: undefined });
  }, [navigation, selectFeatureButton]);

  const addLocationPoint = useCallback(async () => {
    if (Platform.OS === 'web') {
      await AlertAsync(t('Home.alert.gpsWeb'));
      return;
    }
    if (gpsState === 'off' && trackingState === 'off') {
      await AlertAsync(t('Home.alert.gps'));
      return;
    }

    // 確認アラートを表示
    const ret = await ConfirmAsync(t('Home.confirm.addLocationPoint'));
    if (!ret) {
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
  }, [addCurrentPoint, gpsState, navigation, trackingState]);

  const addLocationPointInEditPosition = useCallback(
    async (layer: LayerType, record: RecordType) => {
      if (Platform.OS === 'web') {
        await AlertAsync(t('Home.alert.gpsWeb'));
        return;
      }

      // 確認アラートを表示
      const ret = await ConfirmAsync(t('Home.confirm.addLocationPoint'));
      if (!ret) {
        return;
      }

      const point = await getCurrentPoint();
      if (point === undefined) return;
      updatePointPosition(layer, record, point);
      finishEditPosition();
    },
    [finishEditPosition, getCurrentPoint, updatePointPosition]
  );

  const handleAddLocationPoint = useCallback(async () => {
    if (route.params?.mode === 'editPosition') {
      const { layer, record } = route.params;
      if (layer === undefined || record === undefined) return;
      await addLocationPointInEditPosition(layer, record);
    } else {
      await addLocationPoint();
    }
  }, [addLocationPoint, addLocationPointInEditPosition, route.params]);

  const selectDrawTool = useCallback(
    async (value: DrawToolType) => {
      setInfoToolActive(false);
      if (isPointTool(value) || isLineTool(value) || isPolygonTool(value)) {
        if (currentDrawTool === value) {
          if (isEditingDraw) {
            const ret = await ConfirmAsync(t('Home.confirm.discard'));
            if (!ret) return;
          }
          //ドローツールをオフ
          resetDrawTools();
          setDrawTool('NONE');
          if (route.params?.mode === 'editPosition') finishEditPosition();
        } else {
          //ドローツールをオン

          if (isPointTool(value)) {
            if (activePointLayer === undefined) {
              await AlertAsync(t('Home.alert.cannotEdit'));
              return;
            }

            // ADD_LOCATION_POINTの場合は即座に確認アラートを表示してポイントを追加
            if (value === 'ADD_LOCATION_POINT') {
              await handleAddLocationPoint();
              return; // ツールを有効にしない
            }
            //await runTutrial(`POINTTOOL_${value}`);
          } else if (isLineTool(value)) {
            if (activeLineLayer === undefined) {
              await AlertAsync(t('Home.alert.cannotEdit'));
              return;
            }
            //await runTutrial(`LINETOOL_${value}`);
          } else if (isPolygonTool(value)) {
            if (activePolygonLayer === undefined) {
              await AlertAsync(t('Home.alert.cannotEdit'));
              return;
            }
            //await runTutrial(`POLYGONTOOL_${value}`);
          }

          setDrawTool(value);
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
          //await runTutrial('SELECTIONTOOL');
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
      } else {
        if (value === 'MOVE') {
          if (currentDrawTool === value) {
            if (isEditingDraw || isSelectedDraw) return;
            // MOVEツールを非アクティブにする場合、元の編集ツールに戻す
            if (isEditingObject) {
              if (featureButton === 'LINE') {
                setDrawTool(currentLineTool);
              } else if (featureButton === 'POLYGON') {
                setDrawTool(currentPolygonTool);
              } else {
                setDrawTool('NONE');
              }
            } else {
              setDrawTool('NONE');
            }
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
      currentLineTool,
      currentPolygonTool,
      featureButton,
      finishEditPosition,
      handleAddLocationPoint,
      isEditingDraw,
      isEditingObject,
      isSelectedDraw,
      resetDrawTools,
      route.params?.mode,
      setDrawTool,
      setInfoToolActive,
    ]
  );

  /**************** press ******************/

  const pressUndoDraw = useCallback(async () => {
    const finished = undoDraw();
    if (route.params?.mode === 'editPosition') {
      if (finished) finishEditPosition();
    }
  }, [finishEditPosition, route.params?.mode, undoDraw]);

  const pressSaveDraw = useCallback(async () => {
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
    // console.log('🔍 pressSaveDraw - layer:', layer?.name, 'type:', layer?.type, 'id:', layer?.id);
    setDrawTool('NONE');
    if (route.params?.mode === 'editPosition') {
      navigation.setParams({ mode: undefined });
    }
    if (layer !== undefined && recordSet !== undefined && recordSet.length > 0) {
      bottomSheetRef.current?.snapToIndex(2);
      navigation.navigate('DataEdit', {
        previous: 'Data',
        targetData: recordSet[0],
        targetLayer: layer,
      });
    }
  }, [featureButton, navigation, route.params?.mode, saveLine, savePolygon, setDrawTool]);

  const pressDownloadTiles = useCallback(async () => {
    if (zoom < 11) {
      await AlertAsync(t('Home.alert.zoomLevel'));
      return;
    }
    downloadTiles(zoom);
  }, [downloadTiles, zoom]);

  const pressStopDownloadTiles = useCallback(() => {
    stopDownloadTiles();
  }, [stopDownloadTiles]);

  const pressCompass = useCallback(async () => {
    if (isInfoToolActive) return;
    if (featureButton !== 'NONE') return;
    if ((await confirmLocationPermission()) !== 'granted') return;
    await toggleGPS('show');
    await toggleHeadingUp(!headingUp);
  }, [confirmLocationPermission, featureButton, headingUp, isInfoToolActive, toggleGPS, toggleHeadingUp]);

  const pressTracking = useCallback(async () => {
    if (Platform.OS === 'web') {
      await AlertAsync(t('Home.alert.trackWeb'));
      return;
    }
    //runTutrial('HOME_BTN_TRACK');
    if (trackingState === 'off') {
      const result = await checkUnsavedTrackLog();
      if (!result.isOK) {
        await AlertAsync(result.message);
        return;
      }
      const ret = await ConfirmAsync(t('Home.confirm.track_start'));
      if (!ret) return;
      if ((await confirmLocationPermission()) !== 'granted') return;
      await toggleTracking('on');
      await toggleGPS('follow');
      setFeatureButton('NONE');
    } else if (trackingState === 'on') {
      const ret = await ConfirmAsync(t('Home.confirm.track'));
      if (ret) {
        const result = await saveTrackLog();
        if (!result.isOK) {
          await AlertAsync(result.message);
        }
        await toggleTracking('off');
        await toggleGPS('off');
      }
    }
  }, [
    checkUnsavedTrackLog,
    confirmLocationPermission,
    saveTrackLog,
    setFeatureButton,
    toggleGPS,
    toggleTracking,
    trackingState,
  ]);

  const pressGPS = useCallback(async () => {
    //runTutrial('HOME_BTN_GPS');
    if (gpsState === 'off') {
      if ((await confirmLocationPermission()) !== 'granted') return;
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
  }, [confirmLocationPermission, gpsState, toggleGPS, trackingState]);

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
    if (Platform.OS === 'web') {
      await e3kit.cleanupEncryptKey();
      await logout();
      navigation.navigate('Layers');
      clearProject();
      navigation.navigate('Account', {
        accountFormState: 'loginUserAccount',
      });
    } else {
      await e3kit.cleanupEncryptKey();
      await logout();
      navigation.navigate('Layers');
      clearProject();
      navigation.navigate('Home');
    }
  }, [clearProject, isSettingProject, logout, navigation]);

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
      previous: 'Home',
      mode: 'jumpTo',
    });
  }, [navigation, projectRegion]);

  const pressDownloadData = useCallback(async () => {
    try {
      const ret = await ConfirmAsync(t('Home.confirm.download'));
      if (!ret) return;
      if (!isConnected) {
        await AlertAsync(t('Home.alert.noInternet'));
        return;
      }
      let isAdmin = false;
      if (isOwnerAdmin) {
        const resp = await ConfirmAsync(t('Home.confirm.downloadAllUserData'));
        if (resp) isAdmin = true;
      }
      setIsLoading(true);
      //写真はひとまずダウンロードしない。（プロジェクトの一括か個別で十分）
      await downloadData({ isAdmin, shouldPhotoDownload: false });
      setIsLoading(false);
      await AlertAsync(t('Home.alert.download'));
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [downloadData, isConnected, isOwnerAdmin]);

  const pressUploadData = useCallback(async () => {
    try {
      const ret = await ConfirmAsync(t('Home.confirm.upload'));
      if (!ret) return;
      const storageLicenseResult = validateStorageLicense(project);
      if (!storageLicenseResult.isOK) {
        if (Platform.OS === 'web') {
          await AlertAsync(storageLicenseResult.message + t('Home.alert.uploadLicenseWeb'));
        } else {
          await AlertAsync(t('Home.alert.uploadLicense'));
        }
        return;
      }
      if (!isConnected) {
        await AlertAsync(t('Home.alert.noInternet'));
        return;
      }
      setIsLoading(true);
      const { isOK, message } = await uploadData(storageLicenseResult.isOK);
      setIsLoading(false);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        await AlertAsync(t('Home.alert.upload'));
      }
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [isConnected, project, uploadData]);

  const pressSyncPosition = useCallback(() => {
    if (isSynced === false) {
      Alert.alert('', t('Home.alert.sync'));
    }
    syncPosition(!isSynced);
  }, [isSynced, syncPosition]);

  const pressCloseProject = useCallback(async () => {
    const ret = await ConfirmAsync(t('Home.confirm.closeProject'));
    if (ret) {
      //Layersに戻らないとwebでエラー（白く）なる
      navigation.navigate('Layers');
      clearProject();
      setIsShowingProjectButtons(false);
    }
  }, [clearProject, navigation]);

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
      navigation.navigate('Layers');
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
      navigation.navigate('Layers');
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
    finishEditPosition();
    if (routeName === undefined || routeName === 'Settings' || routeName === 'Licenses' || routeName === 'Maps') {
      navigation.navigate('Layers');
    }
  }, [finishEditPosition, isEditingRecord, navigation, routeName]);

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

  const pressExportPDF = useCallback(async () => {
    //console.log('pressExportPDF');
    let mapUri: string | Window | null;
    let dataUri: string | Window | null;
    let vrt: string;
    try {
      const fileName = `ecorismap_map_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
      if (outputVRT) {
        vrt = generateVRT(fileName);
        await exportFileFromData(vrt, fileName.replace('.pdf', '.vrt'));
      }
      // 作成した PDF を共有
      if (Platform.OS === 'web') {
        mapUri = await generatePDF({ dataSet, layers });

        setTimeout(async () => {
          (mapUri as Window).document.title = fileName;
          (mapUri as Window).print();
          (mapUri as Window).close();
          if (outputDataPDF) {
            dataUri = await generateDataPDF({ dataSet, layers });

            setTimeout(async () => {
              (dataUri as Window).document.title = fileName.replace('_map_', '_data_');
              (dataUri as Window).print();
              (dataUri as Window).close();
            }, 1000);
          }
        }, 5000);
      } else {
        if (outputDataPDF) {
          setIsLoading(true);
          mapUri = await generatePDF({ dataSet, layers });
          dataUri = await generateDataPDF({ dataSet, layers });
          await exportFileFromUri(mapUri as string, fileName, { mimeType: 'application/pdf' });
          await exportFileFromUri(dataUri as string, fileName.replace('_map_', '_data_'), {
            mimeType: 'application/pdf',
          });
          setIsLoading(false);
          await AlertAsync(t('Home.alert.exportPDF'));
        } else {
          setIsLoading(true);
          mapUri = await generatePDF({ dataSet, layers });
          await exportFileFromUri(mapUri as string, fileName, { mimeType: 'application/pdf' });
          setIsLoading(false);
          await AlertAsync(t('Home.alert.exportPDF'));
        }
      }
    } catch (e) {
      // Error logged
      setIsLoading(false);
    } finally {
      setIsLoading(false);
    }
  }, [dataSet, generateDataPDF, generatePDF, generateVRT, layers, outputDataPDF, outputVRT]);

  const pressPDFSettingsOpen = useCallback(() => {
    setIsPDFSettingsVisible(true);
  }, [setIsPDFSettingsVisible]);

  const onDragEndPoint = useCallback(
    async (e: any, layer: LayerType, feature: RecordType) => {
      const coordinate =
        Platform.OS === 'web' ? { longitude: e.lngLat.lng, latitude: e.lngLat.lat } : e.nativeEvent.coordinate;
      const ret = await ConfirmAsync(t('Home.confirm.drag'));
      if (!ret) {
        resetPointPosition(layer, feature);
        return;
      }
      const checkResult = checkRecordEditable(layer);

      if (!checkResult.isOK) {
        if (checkResult.message === t('hooks.message.noEditMode')) {
          // 編集モードでない場合、確認ダイアログを表示
          const confirmResult = await ConfirmAsync(t('hooks.confirmEditModeMessage'));
          if (!confirmResult) return;
          // 編集モードにする
          changeActiveLayer(layer);
        } else {
          resetPointPosition(layer, feature);
          await AlertAsync(checkResult.message);
          return;
        }
      }
      updatePointPosition(layer, feature, coordinate);
      if (route.params?.mode === 'editPosition') {
        finishEditPosition();
      }
    },
    [
      changeActiveLayer,
      checkRecordEditable,
      finishEditPosition,
      resetPointPosition,
      route.params?.mode,
      updatePointPosition,
    ]
  );

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
      selectRecord(layer.id, { ...feature });

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
    [isEditingRecord, isLandscape, navigation, selectRecord, selectSingleFeature, unselectRecord]
  );

  const handlePanResponderGrant = useCallback(
    async (event: GestureResponderEvent) => {
      //@ts-ignore
      isPencilTouch.current = !!event.nativeEvent.altitudeAngle;
      if (!event.nativeEvent.touches.length) return;

      const pXY = getPXY(event);

      //if (route.params?.mode === 'editPosition') hideDrawLine();
      if (isPencilModeActive && isPencilTouch.current === false) {
        hideDrawLine();
        setIsPinch(true);
      } else if (isInfoToolActive) {
        await getInfoOfFeature(event);
      } else if (currentDrawTool === 'MOVE') {
        hideDrawLine();
      } else if (currentDrawTool === 'SPLIT_LINE') {
        const isOK = checkSplitLine(pXY);
        if (isOK) {
          const ret = await ConfirmAsync(t('DataEdit.confirm.splitLine'));
          if (ret) {
            handleGrantSplitLine(pXY);
            if (route.params?.mode === 'editPosition') finishEditPosition();
            setDrawTool('NONE');
          }
        }
      } else if (isPlotTool(currentDrawTool)) {
        handleGrantPlot(pXY);
      } else if (isFreehandTool(currentDrawTool)) {
        const finished = handleGrantFreehand(pXY);
        if (finished) {
          if (route.params?.mode === 'editPosition') {
            const result = currentDrawTool === 'FREEHAND_LINE' ? saveLine() : savePolygon();
            const { isOK, message } = result;
            if (!isOK) {
              await AlertAsync(message);
              return;
            }
            finishEditPosition();
          } else {
            const result = currentDrawTool === 'FREEHAND_LINE' ? saveLine() : savePolygon();
            const { isOK, message, layer, recordSet } = result;
            if (!isOK && message !== undefined) {
              await AlertAsync(message);
            } else {
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
          }
        }
      } else if (featureButton === 'MEMO') {
        if (isMapMemoDrawTool(currentMapMemoTool) && !isPencilTouch.current && isPencilModeActive) {
          setIsPinch(true);
        } else {
          handleGrantMapMemo(event);
        }
      }
    },
    [
      checkSplitLine,
      currentDrawTool,
      currentMapMemoTool,
      featureButton,
      finishEditPosition,
      getInfoOfFeature,
      getPXY,
      handleGrantFreehand,
      handleGrantMapMemo,
      handleGrantPlot,
      handleGrantSplitLine,
      hideDrawLine,
      isInfoToolActive,
      isPencilModeActive,
      isPencilTouch,
      navigation,
      route.params?.mode,
      saveLine,
      savePolygon,
      setDrawTool,
      setIsPinch,
    ]
  );
  const handlePanResponderMove = useCallback(
    //@ts-ignore
    (event: GestureResponderEvent, gesture) => {
      if (!event.nativeEvent.touches.length) return;
      const pXY = getPXY(event);

      if (currentDrawTool === 'MOVE' || isPinch) {
        return;
      }
      if (gesture.numberActiveTouches === 2) {
        hideDrawLine();
        clearMapMemoEditingLine();
        setIsPinch(true);
      } else if (isMapMemoDrawTool(currentMapMemoTool)) {
        handleMoveMapMemo(event);
      } else if (isPlotTool(currentDrawTool)) {
        handleMovePlot(pXY);
      } else if (isFreehandTool(currentDrawTool)) {
        handleMoveFreehand(pXY);
      }
    },
    [
      clearMapMemoEditingLine,
      currentDrawTool,
      currentMapMemoTool,
      getPXY,
      handleMoveFreehand,
      handleMoveMapMemo,
      handleMovePlot,
      hideDrawLine,
      isPinch,
      setIsPinch,
    ]
  );

  const pressDeletePosition = useCallback(async () => {
    if (route.params?.mode !== 'editPosition') return;
    const { layer, record } = route.params;
    if (layer === undefined || record === undefined) return;
    const ret = await ConfirmAsync(t('DataEdit.confirm.deletePosition'));
    if (!ret) return;
    updatePointPosition(layer, record, undefined);
    finishEditPosition();
  }, [finishEditPosition, route.params, updatePointPosition]);

  const pressDeleteDraw = useCallback(async () => {
    if (drawLine.current.length === 0) return;
    const ret = await ConfirmAsync(t('DataEdit.confirm.deleteData'));
    if (ret) {
      const { isOK, message, layer } = deleteDraw();

      if (!isOK || layer === undefined) {
        await AlertAsync(message);
        return;
      }
      bottomSheetRef.current?.close();
      navigation.navigate('Data', { targetLayer: layer });
    }
  }, [deleteDraw, drawLine, navigation]);

  const handlePanResponderRelease = useCallback(
    async (event: GestureResponderEvent) => {
      isPencilTouch.current = undefined;

      const pXY = getPXY(event);

      if (route.params?.mode === 'editPosition') showDrawLine();

      if (isPinch) {
        showDrawLine();
        setIsPinch(false);
      } else if (currentDrawTool === 'MOVE') {
        showDrawLine();
      } else if (currentDrawTool === 'SELECT') {
        handleReleaseSelect(pXY);
      } else if (currentDrawTool === 'DELETE_POINT') {
        const ret = await ConfirmAsync(t('DataEdit.confirm.deleteData'));
        if (!ret) return;
        handleReleaseDeletePoint(pXY);

        const { isOK, message, layer } = deleteDraw();
        if (!isOK || layer === undefined) {
          await AlertAsync(message);
          return;
        }

        bottomSheetRef.current?.close();
        navigation.navigate('Data', { targetLayer: layer });
      } else if (currentDrawTool === 'PLOT_POINT') {
        handleReleasePlotPoint();
        if (route.params?.mode === 'editPosition') {
          const point = xyArrayToLatLonObjects([pXY], mapRegion, mapSize, mapViewRef.current);
          const { layer, record } = route.params;
          if (layer === undefined || record === undefined || point === undefined) return;

          updatePointPosition(layer, record, point[0]);
          finishEditPosition();
        } else {
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
      } else if (currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON') {
        const finished = handleReleasePlotLinePolygon();
        if (finished) {
          if (route.params?.mode === 'editPosition') {
            const result = currentDrawTool === 'PLOT_LINE' ? saveLine() : savePolygon();
            const { isOK, message } = result;
            if (!isOK) {
              await AlertAsync(message);
              return;
            }
            finishEditPosition();
          } else {
            const result = currentDrawTool === 'PLOT_LINE' ? saveLine() : savePolygon();
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
        }
      } else if (isFreehandTool(currentDrawTool)) {
        handleReleaseFreehand();
      } else if (currentMapMemoTool !== 'NONE') {
        handleReleaseMapMemo(event);
      }
    },
    [
      currentDrawTool,
      currentMapMemoTool,
      deleteDraw,
      finishEditPosition,
      getPXY,
      handleReleaseDeletePoint,
      handleReleaseFreehand,
      handleReleaseMapMemo,
      handleReleasePlotLinePolygon,
      handleReleasePlotPoint,
      handleReleaseSelect,
      isPencilTouch,
      isPinch,
      mapRegion,
      mapSize,
      navigation,
      route.params,
      saveLine,
      savePoint,
      savePolygon,
      setDrawTool,
      setIsPinch,
      showDrawLine,
      updatePointPosition,
    ]
  );

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: handlePanResponderGrant,
        onPanResponderMove: handlePanResponderMove,
        onPanResponderRelease: handlePanResponderRelease,
      }),
    [handlePanResponderGrant, handlePanResponderMove, handlePanResponderRelease]
  );

  // editPosition用の遅延実行状態
  const [pendingEditPosition, setPendingEditPosition] = useState<{
    layer: LayerType;
    record: RecordType;
    featureType: FeatureButtonType;
  } | null>(null);

  // pendingEditPositionが設定されたら、mapRegion更新後に実行
  useEffect(() => {
    if (pendingEditPosition) {
      const { layer, record, featureType } = pendingEditPosition;
      // 少し遅延を入れて確実にmapRegionが更新されてから実行
      const timer = setTimeout(() => {
        if (featureType === 'POINT') {
          selectRecord(layer.id, record);
        } else if (featureType === 'LINE' || featureType === 'POLYGON') {
          // DataEditからの編集時は座標を再計算
          selectObjectByFeature(layer, record, true);
          setDrawTool(featureType === 'LINE' ? currentLineTool : currentPolygonTool);
        }
        setPendingEditPosition(null);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [
    pendingEditPosition,
    mapRegion,
    selectRecord,
    selectObjectByFeature,
    setDrawTool,
    currentLineTool,
    currentPolygonTool,
  ]);

  useEffect(() => {
    //coordsは深いオブジェクトのため値を変更しても変更したとみなされない。

    // console.log('jump', route.params?.jumpTo);
    //console.log('previous', route.params?.previous);
    // console.log('tileMap', route.params?.tileMap);
    //console.log('mode', route.params?.mode);

    if (route.params?.previous === 'Home') {
      //プロジェクトのホームにジャンプする場合
      changeMapRegion(route.params.jumpTo, true);
      setTimeout(() => bottomSheetRef.current?.close(), 500);
    } else if (route.params?.previous === 'Settings') {
      //ecorismapを読み込んだときにプロジェクトのホームにジャンプする場合
      changeMapRegion(route.params.jumpTo, true);
      setTimeout(() => bottomSheetRef.current?.close(), 500);
      //toggleTerrain(false);
      if (Platform.OS !== 'web') toggleHeadingUp(false);
    } else if (route.params?.previous === 'Projects') {
      setTimeout(() => bottomSheetRef.current?.close(), 300);
    } else if (route.params?.previous === 'AccountSettings') {
      setTimeout(() => bottomSheetRef.current?.close(), 300);
    } else if (route.params?.previous === 'ProjectEdit') {
      //プロジェクトを開くときにプロジェクトのホームにジャンプする場合
      changeMapRegion(route.params.jumpTo, true);
      setTimeout(() => bottomSheetRef.current?.close(), 300);
    } else if (route.params?.previous === 'DataEdit') {
      if (route.params?.mode === 'jumpTo') {
        //データの範囲にジャンプする場合
        changeMapRegion(route.params.jumpTo, true);
        if (isLandscape) {
          bottomSheetRef.current?.snapToIndex(0);
        } else {
          bottomSheetRef.current?.snapToIndex(0);
        }
      } else if (route.params?.mode === 'editPosition') {
        if (route.params?.layer === undefined || route.params?.record === undefined) return;

        const layer = route.params.layer;
        const record = route.params.record;
        const featureType = layer.type as FeatureButtonType;
        const jumpTo = route.params.jumpTo;

        // UI準備
        setTimeout(() => bottomSheetRef.current?.close(), 300);
        selectFeatureButton(featureType);
        setInfoToolActive(false);

        // まずマップを移動
        if (jumpTo) {
          changeMapRegion(jumpTo, true);
          // mapRegion更新後に編集モードを開始するため、pendingEditPositionを設定
          setPendingEditPosition({ layer, record, featureType });
        } else {
          // jumpToがない場合はすぐに編集モードを開始（座標再計算なし）
          if (featureType === 'POINT') {
            selectRecord(layer.id, record);
          } else if (featureType === 'LINE' || featureType === 'POLYGON') {
            selectObjectByFeature(layer, record, false);
            setDrawTool(featureType === 'LINE' ? currentLineTool : currentPolygonTool);
          }
        }
      }
    } else if (route.params?.previous === 'Maps') {
      if (route.params?.tileMap) {
        //ダウンロード画面を開いた場合
        setTimeout(() => bottomSheetRef.current?.close(), 500);
        toggleTerrain(false);
        if (Platform.OS !== 'web') toggleHeadingUp(false);
      } else if (route.params?.jumpTo) {
        //PDFの範囲にジャンプする場合
        setTimeout(() => bottomSheetRef.current?.close(), 300);
        toggleTerrain(false);
        if (Platform.OS !== 'web') toggleHeadingUp(false);
        changeMapRegion(route.params.jumpTo, true);
      } else {
        bottomSheetRef.current?.snapToIndex(2);
      }
    }
    //プロジェクトのホームにジャンプする時にjumpToをリセットしないと更新されないので必要
    navigation.setParams({ jumpTo: undefined, previous: undefined });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.jumpTo, route.params?.previous, route.params?.tileMap, route.params?.mode]);

  const onDrop = useCallback(
    async (acceptedFiles: any) => {
      if (Platform.OS !== 'web') return;
      const files = await getDropedFile(acceptedFiles);
      if (files.length > 0) {
        let allOK = true;
        for (const file of files) {
          const ext = getExt(file.name)?.toLowerCase();
          if (
            !(
              ext === 'gpx' ||
              ext === 'geojson' ||
              ext === 'kml' ||
              ext === 'kmz' ||
              ext === 'zip' ||
              ext === 'csv' ||
              ext === 'pdf' ||
              ext === 'pmtiles'
            )
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
          if (file.size / 1024 > (ext === 'pdf' || ext === 'pmtiles' ? 30000 : 5000)) {
            await AlertAsync(t('hooks.message.cannotImportData'));
            allOK = false;
            continue;
          }
          let result;

          if (ext === 'pdf') {
            setIsLoading(true);
            result = await importPdfFile(file.uri, file.name);
            setIsLoading(false);
            gotoMaps();
          } else if (ext === 'pmtiles') {
            setIsLoading(true);
            result = await importPmtilesFile(file.uri, file.name);
            setIsLoading(false);
            gotoMaps();
          } else {
            result = await importGeoFile(file.uri, file.name);
          }
          if (!result.isOK) {
            await AlertAsync(`${file.name}:${result.message}`);
            allOK = false;
          }
        }
        if (allOK) await AlertAsync(t('hooks.message.receiveFile'));
      } else {
        await AlertAsync(t('hooks.message.cannotGetFileSize'));
      }
    },
    [gotoMaps, importGeoFile, importPdfFile, importPmtilesFile]
  );

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
        if (ext === 'gpx' || ext === 'geojson' || ext === 'csv') return true;
      });
      if (file === undefined) return;
      if (file.size === undefined) {
        await AlertAsync(t('hooks.message.cannotGetFileSize'));
        return;
      }
      if (file.size / 1024 > 3000) {
        await AlertAsync(t('hooks.message.cannotImportData'));
        return;
      }
      const { message } = await importGeoFile(file.uri, file.name);
      if (message !== '') await AlertAsync(message);
      await deleteReceivedFiles(files);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MapViewContextの値をメモ化
  const mapViewContextValue = useMemo(
    () => ({
      mapViewRef,
      mapType,
      zoom,
      zoomDecimal,
      onRegionChangeMapView,
      onPressMapView,
      onDragMapView,
      onDrop,
      pressZoomIn,
      pressZoomOut,
      pressCompass,
      headingUp,
      azimuth,
      currentLocation: currentLocation
        ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            altitude: currentLocation.altitude ?? undefined,
            accuracy: currentLocation.accuracy ?? undefined,
          }
        : null,
      gpsState,
      pressGPS,
      isPinch,
      panResponder,
      isDrawLineVisible,
      isTerrainActive,
      toggleTerrain,
    }),
    [
      mapViewRef,
      mapType,
      zoom,
      zoomDecimal,
      onRegionChangeMapView,
      onPressMapView,
      onDragMapView,
      onDrop,
      pressZoomIn,
      pressZoomOut,
      pressCompass,
      headingUp,
      azimuth,
      currentLocation,
      gpsState,
      pressGPS,
      panResponder,
      isDrawLineVisible,
      isTerrainActive,
      toggleTerrain,
      isPinch,
    ]
  );

  // DrawingToolsContextの値をメモ化（SVG描画要素を除外）
  const drawingToolsContextValue = useMemo(
    () => ({
      // Drawing states (grouped for better memoization)
      drawingState: {
        isEditingDraw,
        isEditingObject,
        isSelectedDraw,
        isEditingLine,
        editingLineId,
      },

      // Current tools (grouped for better memoization)
      currentTools: {
        featureButton,
        currentDrawTool,
        currentPointTool,
        currentLineTool,
        currentPolygonTool,
      },

      // Tool actions (stable references)
      selectFeatureButton,
      selectDrawTool,
      setPointTool,
      setLineTool,
      setPolygonTool,

      // Drawing actions (stable references)
      onDragEndPoint,
      pressUndoDraw,
      pressSaveDraw,
      pressDeleteDraw,
      finishEditObject,
      resetDrawTools,

      // Backward compatibility (to be deprecated gradually)
      isEditingDraw,
      isEditingObject,
      isSelectedDraw,
      isEditingLine,
      editingLineId,
      featureButton,
      currentDrawTool,
      currentPointTool,
      currentLineTool,
      currentPolygonTool,
    }),
    [
      isEditingDraw,
      isEditingObject,
      isSelectedDraw,
      isEditingLine,
      editingLineId,
      featureButton,
      currentDrawTool,
      currentPointTool,
      currentLineTool,
      currentPolygonTool,
      selectFeatureButton,
      selectDrawTool,
      setPointTool,
      setLineTool,
      setPolygonTool,
      onDragEndPoint,
      pressUndoDraw,
      pressSaveDraw,
      pressDeleteDraw,
      finishEditObject,
      resetDrawTools,
    ]
  );

  // PDFExportContextの値をメモ化
  const pdfExportContextValue = useMemo(
    () => ({
      exportPDFMode,
      pdfArea,
      pdfOrientation,
      pdfPaperSize,
      pdfScale,
      pdfTileMapZoomLevel,
      pressExportPDF,
      pressPDFSettingsOpen,
    }),
    [
      exportPDFMode,
      pdfArea,
      pdfOrientation,
      pdfPaperSize,
      pdfScale,
      pdfTileMapZoomLevel,
      pressExportPDF,
      pressPDFSettingsOpen,
    ]
  );

  // LocationTrackingContextの値をメモ化
  const locationTrackingContextValue = useMemo(
    () => ({
      trackingState,
      trackLog,
      memberLocations,
      pressTracking,
      pressSyncPosition,
      pressDeletePosition,
      editPositionMode: route.params?.mode === 'editPosition',
      editPositionLayer: route.params?.layer,
      editPositionRecord: route.params?.record,
      finishEditPosition,
      // 擬似GPS関連を追加
      useMockGps,
      toggleMockGps,
      mockGpsProgress,
    }),
    [
      trackingState,
      trackLog,
      memberLocations,
      pressTracking,
      pressSyncPosition,
      pressDeletePosition,
      route.params?.mode,
      route.params?.layer,
      route.params?.record,
      finishEditPosition,
      useMockGps,
      toggleMockGps,
      mockGpsProgress,
    ]
  );

  // ProjectContextの値をメモ化
  const projectContextValue = useMemo(
    () => ({
      projectName,
      isSynced,
      isShowingProjectButtons,
      isSettingProject,
      pressProjectLabel,
      pressJumpProject,
      pressDownloadData,
      pressCloseProject,
      pressUploadData,
      pressSaveProjectSetting,
      pressDiscardProjectSetting,
      gotoProjects,
      gotoAccount,
      gotoLogin,
      pressLogout,
    }),
    [
      projectName,
      isSynced,
      isShowingProjectButtons,
      isSettingProject,
      pressProjectLabel,
      pressJumpProject,
      pressDownloadData,
      pressCloseProject,
      pressUploadData,
      pressSaveProjectSetting,
      pressDiscardProjectSetting,
      gotoProjects,
      gotoAccount,
      gotoLogin,
      pressLogout,
    ]
  );

  // SVGDrawingContextの値（RefObjectがあるためメモ化しない）
  const svgDrawingContextValue = {
    // Drawing tools SVG data
    drawLine,
    editingLine: editingLineXY,
    selectLine,

    // MapMemo SVG data
    mapMemoEditingLine: mapMemoEditingLine.current,
    isPencilTouch: isPencilTouch.current,
  };

  // TileManagementContextの値をメモ化
  const tileManagementContextValue = useMemo(
    () => ({
      downloadMode,
      downloadTileMapName,
      tileMaps,
      savedTileSize,
      isDownloading,
      downloadArea,
      savedArea,
      downloadProgress,
      pressDownloadTiles,
      pressStopDownloadTiles,
      pressDeleteTiles,
    }),
    [
      downloadMode,
      downloadTileMapName,
      tileMaps,
      savedTileSize,
      isDownloading,
      downloadArea,
      savedArea,
      downloadProgress,
      pressDownloadTiles,
      pressStopDownloadTiles,
      pressDeleteTiles,
    ]
  );

  // MapMemoContextの値をメモ化
  const mapMemoContextValue = useMemo(
    () => ({
      currentMapMemoTool,
      visibleMapMemoColor,
      currentPenWidth,
      penColor,
      penWidth,
      isPencilModeActive,
      isUndoable,
      isRedoable,
      mapMemoLines,
      isModalMapMemoToolHidden,
      selectMapMemoTool,
      setPenWidth,
      setVisibleMapMemoColor,
      setVisibleMapMemoPen,
      setVisibleMapMemoStamp,
      setVisibleMapMemoBrush,
      setVisibleMapMemoEraser,
      selectPenColor,
      pressUndoMapMemo,
      pressRedoMapMemo,
      togglePencilMode,
    }),
    [
      currentMapMemoTool,
      visibleMapMemoColor,
      currentPenWidth,
      penColor,
      penWidth,
      isPencilModeActive,
      isUndoable,
      isRedoable,
      mapMemoLines,
      isModalMapMemoToolHidden,
      selectMapMemoTool,
      setPenWidth,
      setVisibleMapMemoColor,
      setVisibleMapMemoPen,
      setVisibleMapMemoStamp,
      setVisibleMapMemoBrush,
      setVisibleMapMemoEraser,
      selectPenColor,
      pressUndoMapMemo,
      pressRedoMapMemo,
      togglePencilMode,
    ]
  );

  // DataSelectionContextの値をメモ化
  const dataSelectionContextValue = useMemo(
    () => ({
      pointDataSet,
      lineDataSet,
      polygonDataSet,
      selectedRecord,
      isEditingRecord,
    }),
    [pointDataSet, lineDataSet, polygonDataSet, selectedRecord, isEditingRecord]
  );

  // InfoToolContextの値をメモ化
  const infoToolContextValue = useMemo(
    () => ({
      currentInfoTool,
      isModalInfoToolHidden,
      isInfoToolActive,
      vectorTileInfo,
      selectInfoTool,
      setVisibleInfoPicker,
      setInfoToolActive,
      closeVectorTileInfo,
    }),
    [
      currentInfoTool,
      isModalInfoToolHidden,
      isInfoToolActive,
      vectorTileInfo,
      selectInfoTool,
      setVisibleInfoPicker,
      setInfoToolActive,
      closeVectorTileInfo,
    ]
  );

  // AppStateContextの値をメモ化
  const appStateContextValue = useMemo(
    () => ({
      isOffline,
      restored,
      attribution,
      isLoading,
      user,
      gotoMaps,
      gotoSettings,
      gotoLayers,
      gotoHome,
      bottomSheetRef,
      onCloseBottomSheet,
      updatePmtilesURL,
    }),
    [
      isOffline,
      restored,
      attribution,
      isLoading,
      user,
      gotoMaps,
      gotoSettings,
      gotoLayers,
      gotoHome,
      bottomSheetRef,
      onCloseBottomSheet,
      updatePmtilesURL,
    ]
  );

  return (
    <MapViewContext.Provider value={mapViewContextValue}>
      <DrawingToolsContext.Provider value={drawingToolsContextValue}>
        <PDFExportContext.Provider value={pdfExportContextValue}>
          <LocationTrackingContext.Provider value={locationTrackingContextValue}>
            <ProjectContext.Provider value={projectContextValue}>
              <SVGDrawingContext.Provider value={svgDrawingContextValue}>
                <TileManagementContext.Provider value={tileManagementContextValue}>
                  <MapMemoContext.Provider value={mapMemoContextValue}>
                    <DataSelectionContext.Provider value={dataSelectionContextValue}>
                      <InfoToolContext.Provider value={infoToolContextValue}>
                        <AppStateContext.Provider value={appStateContextValue}>
                          <Home />
                          <HomeModalTermsOfUse />
                          <HomeModalPenPicker
                            modalVisible={visibleMapMemoPen}
                            currentMapMemoTool={currentMapMemoTool}
                            arrowStyle={arrowStyle}
                            isStraightStyle={isStraightStyle}
                            isModalMapMemoToolHidden={isModalMapMemoToolHidden}
                            currentPenWidth={currentPenWidth}
                            selectMapMemoTool={selectMapMemoTool}
                            selectMapMemoPenWidth={setPenWidth}
                            selectMapMemoArrowStyle={setArrowStyle}
                            selectMapMemoStraightStyle={setIsStraightStyle}
                            setVisibleMapMemoPen={setVisibleMapMemoPen}
                            setIsModalMapMemoToolHidden={setIsModalMapMemoToolHidden}
                          />
                          <HomeModalBrushPicker
                            modalVisible={visibleMapMemoBrush}
                            currentMapMemoTool={currentMapMemoTool}
                            selectMapMemoTool={selectMapMemoTool}
                            setVisibleMapMemoBrush={setVisibleMapMemoBrush}
                          />
                          <HomeModalStampPicker
                            modalVisible={visibleMapMemoStamp}
                            currentMapMemoTool={currentMapMemoTool}
                            snapWithLine={snapWithLine}
                            selectMapMemoTool={selectMapMemoTool}
                            selectMapMemoSnapWithLine={setSnapWithLine}
                            setVisibleMapMemoStamp={setVisibleMapMemoStamp}
                          />
                          <HomeModalEraserPicker
                            modalVisible={visibleMapMemoEraser}
                            currentMapMemoTool={currentMapMemoTool}
                            selectMapMemoTool={selectMapMemoTool}
                            setVisibleMapMemoEraser={setVisibleMapMemoEraser}
                          />
                          <HomeModalInfoPicker
                            modalVisible={visibleInfoPicker}
                            currentInfoTool={currentInfoTool}
                            isModalInfoToolHidden={isModalInfoToolHidden}
                            selectInfoTool={selectInfoTool}
                            setVisibleInfoPicker={setVisibleInfoPicker}
                            setIsModalInfoToolHidden={setIsModalInfoToolHidden}
                          />
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
                          {conflictState.visible && conflictState.queue.length > 0 && (
                            <ConflictResolverModal
                              visible={conflictState.visible}
                              candidates={conflictState.queue[0].candidates}
                              id={conflictState.queue[0].id}
                              onSelect={handleSelect}
                              onBulkSelect={handleBulkSelect}
                            />
                          )}
                        </AppStateContext.Provider>
                      </InfoToolContext.Provider>
                    </DataSelectionContext.Provider>
                  </MapMemoContext.Provider>
                </TileManagementContext.Provider>
              </SVGDrawingContext.Provider>
            </ProjectContext.Provider>
          </LocationTrackingContext.Provider>
        </PDFExportContext.Provider>
      </DrawingToolsContext.Provider>
    </MapViewContext.Provider>
  );
}
