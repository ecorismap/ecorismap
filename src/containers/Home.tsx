import React, { useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  AppState as RNAppState,
  AppStateStatus,
  GestureResponderEvent,
  Platform,
  PanResponderInstance,
  PanResponder,
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
} from 'react-native';
import MapView, { Region } from 'react-native-maps';
import {
  FeatureButtonType,
  DrawToolType,
  MapMemoToolGroupType,
  MapMemoToolType,
  LayerType,
  RecordType,
  InfoToolType,
  PoiInfoType,
  MapLocationInfoType,
  TrackPointInfoType,
  LineRecordType,
  TileMapType,
  LocationStateType,
  LocationType,
} from '../types';
import Home from '../components/pages/Home';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { shallowEqual, useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { useTiles } from '../hooks/useTiles';
import { useRecord } from '../hooks/useRecord';
import { Props_Home } from '../routes';
import { useMapView } from '../hooks/useMapView';
import { useLocation } from '../hooks/useLocation';
import { useSyncLocation } from '../hooks/useSyncLocation';
import { useAccount } from '../hooks/useAccount';
import { useGoogleAccount } from '../hooks/useGoogleAccount';
import { MapRef, ViewState } from 'react-map-gl/maplibre';
import { useProject } from '../hooks/useProject';
import {
  getExt,
  isBrushTool,
  isEraserTool,
  isFreehandTool,
  isLineTool,
  isMapMemoDrawTool,
  isPenTool,
  isPlotTool,
  isPointTool,
  isPolygonTool,
  isStampTool,
} from '../utils/General';
import { t } from '../i18n/config';
import { COLOR, TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system/legacy';
import { editSettingsAction } from '../modules/settings';
import { useTutrial } from '../hooks/useTutrial';
import { HomeModalTermsOfUse } from '../components/organisms/HomeModalTermsOfUse';
import { HomeModalUpdateInfo } from '../components/organisms/HomeModalUpdateInfo';
import { usePointTool } from '../hooks/usePointTool';
import { useDrawTool } from '../hooks/useDrawTool';
import { MapViewContext } from '../contexts/MapView';
import { DrawingToolsContext } from '../contexts/DrawingTools';
import { PDFExportContext } from '../contexts/PDFExport';
import { LocationTrackingContext } from '../contexts/LocationTracking';
import { ProjectContext } from '../contexts/Project';
import { SVGDrawingContext } from '../contexts/SVGDrawing';
import { TileManagementContext } from '../contexts/TileManagement';
import {
  boundsFromCoords,
  estimateDownloadTileCount,
  DOWNLOAD_TILE_COUNT_CONFIRM,
  DOWNLOAD_TILE_COUNT_LIMIT,
  ESTIMATED_TILE_SIZE_MB,
} from '../utils/tileDownloadHelpers';
import { getDemViewshedTileMap } from '../utils/demTileDownload';
import { DEM_VIEWSHED_MAP_ID } from '../constants/DemSources';
import { MapMemoContext } from '../contexts/MapMemo';
import { DataSelectionContext } from '../contexts/DataSelection';
import { InfoToolContext } from '../contexts/InfoTool';
import { AppStateContext } from '../contexts/AppState';
import { useGeoFile } from '../hooks/useGeoFile';
import * as e3kit from '../lib/virgilsecurity/e3kit';
import { hasAuthSession } from '../lib/firebase/sign-in';
import { getReceivedFiles, deleteReceivedFiles, exportFileFromData, exportFileFromUri } from '../utils/File';
import { getDropedFile } from '../utils/File.web';
import { useMapMemo } from '../hooks/useMapMemo';
import { useVectorTile } from '../hooks/useVectorTile';
import { useWindow } from '../hooks/useWindow';
import {
  xyArrayToLatLonObjects,
  xyToLatLon,
  calcDegreeRadius,
  findNearestTrackPoint,
  latLonToXY,
} from '../utils/Coords';
import { generateLabel } from '../utils/Layer';
import { getAllTrackPoints } from '../utils/Location';
import { TRACK_PHOTO_TAP_RADIUS_PX, clusterTrackPhotos, spiderOffsets } from '../utils/trackPhoto';
import BottomSheet from '@gorhom/bottom-sheet';
import { useNetInfo } from '@react-native-community/netinfo';
import {
  BottomSheetNavigationProvider,
  NavigateToHomeParams,
  BottomSheetScreenName,
  BottomSheetScreenParams,
  useBottomSheetNavigation,
} from '../contexts/BottomSheetNavigationContext';

import { usePDF } from '../hooks/usePDF';
import { HomeModalPDFSettings } from '../components/organisms/HomeModalPDFSettings';
import { HomeModalViewshedSettings } from '../components/organisms/HomeModalViewshedSettings';
import { calcViewshedPreview } from '../utils/viewshedPreview';
import dayjs from 'dayjs';
import { HomeModalMapMemoSettings } from '../components/organisms/HomeModalMapMemoSettings';
import { HomeModalInfoPicker } from '../components/organisms/HomeModalInfoPicker';
import { Position } from 'geojson';
import { useMaps } from '../hooks/useMaps';
import { useRepository } from '../hooks/useRepository';
import { ConflictResolverModal } from '../components/organisms/HomeModalConflictResolver';
import { selectNonDeletedDataSet } from '../modules/selectors';
import { TrackFocusContext, TrackFocusProvider } from '../contexts/TrackFocus';
import { TrackPhotoProvider, TrackPhotoContext } from '../contexts/TrackPhoto';
import { MeasureContext, MeasureProvider } from '../contexts/Measure';
import { ViewshedContext, ViewshedProvider } from '../contexts/Viewshed';
import { useLayers } from '../hooks/useLayers';

// 内部コンポーネント - BottomSheetNavigationProvider の内側で使用
function HomeContainersInner({ navigation, route }: Props_Home) {
  const [restored] = useState(true);
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isMapDragging = useRef(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 長押しポップアップが表示されたタッチでは、リリース時のフィーチャー選択を抑止する
  const longPressFiredRef = useRef(false);
  const freehandFinishedRef = useRef(false);
  // iOS Google MapsでonPanDragが発火しないため、PanResponder側でGPS追従解除を行う用のref
  const gpsStateRef = useRef<LocationStateType>('off');
  const toggleGPSRef = useRef<((state: LocationStateType) => Promise<void>) | null>(null);

  const dispatch = useDispatch();
  // 二点間距離測定の状態（長押しポップアップから開始、タップでB点設定）
  const { isMeasuring, setMeasureB, endMeasure } = useContext(MeasureContext);
  // 軌跡上の写真マーカー（タップ判定はMarkerのonPressではなくここの画面タップヒットテストで行う）
  const { trackPhotos, setSelectedPhoto, expandedClusterId, setExpandedClusterId } = useContext(TrackPhotoContext);
  // 軌跡サマリーのフォーカス地点（時刻ポップアップとマーカーの表示元）。地図を動かしたら解除する
  const { setTrackFocusPoint } = useContext(TrackFocusContext);
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const user = useSelector((state: RootState) => state.user);
  const tileRegions = useSelector((state: RootState) => state.settings.tileRegions, shallowEqual);
  const projectName = useSelector((state: RootState) => state.settings.projectName, shallowEqual);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const mapType = useSelector((state: RootState) => state.settings.mapType, shallowEqual);
  const isOffline = useSelector((state: RootState) => state.settings.isOffline, shallowEqual);
  const isEditingRecord = useSelector((state: RootState) => state.settings.isEditingRecord, shallowEqual);
  const isEditingLayer = useSelector((state: RootState) => state.settings.isEditingLayer, shallowEqual);
  const isEditingMap = useSelector((state: RootState) => state.settings.isEditingMap, shallowEqual);
  const memberLocations = useSelector((state: RootState) => state.settings.memberLocation, shallowEqual);

  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const fullDataSet = useSelector((state: RootState) => state.dataSet);

  // SplitScreen のルート名を追跡
  const [currentSplitRoute, setCurrentSplitRoute] = useState<string>('Layers');
  const routeName = currentSplitRoute;

  // BottomSheetNavigationContext からナビゲーション関数を取得
  const {
    navigate: bottomSheetNavigate,
    currentScreen: bottomSheetCurrentScreen,
    isBottomSheetOpen,
  } = useBottomSheetNavigation();

  // ボトムシートが開いた後にselectRecordを実行するためのペンディング状態
  const pendingSelectRecord = useRef<{ layerId: string; feature: RecordType } | null>(null);

  // navigateToSplit 関数（BottomSheetNavigationContext の navigate を使用）
  const navigateToSplit = useCallback(
    <T extends BottomSheetScreenName>(screen: T, params?: BottomSheetScreenParams[T]) => {
      bottomSheetNavigate(screen, params);
    },
    [bottomSheetNavigate]
  );

  const { importGeoFile } = useGeoFile();
  const { runTutrial } = useTutrial();
  const { zoom, zoomDecimal, zoomIn, zoomOut, changeMapRegion } = useMapView(mapViewRef.current);
  const { isConnected } = useNetInfo();

  // 複数地図選択状態
  const [selectedTileMapIds, setSelectedTileMapIds] = useState<string[]>([]);

  // 表示する地図の選択状態
  const [selectedDisplayTileMapId, setSelectedDisplayTileMapId] = useState<string | null>(null);

  //タイルのダウンロード関連
  const {
    isDownloading,
    downloadArea,
    savedArea,
    downloadProgress,
    savedTileSize,
    downloadTiles,
    downloadMultipleTiles,
    stopDownloadTiles,
  } = useTiles(route.params?.tileMap, selectedTileMapIds, tileMaps);

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
    setInfoToolActive,
  } = useDrawTool(mapViewRef.current);

  const {
    visibleMapMemoColor,
    visibleMapMemoSettings,
    mapMemoSettingsTab,
    currentMapMemoTool,
    currentPenWidth,
    penColor,
    penWidth,
    mapMemoEditingLine,
    mapMemoEditingLineLatLon,
    editableMapMemo,
    isIndividualColorRequired,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    mapMemoLines,
    snapWithLine,
    arrowStyle,
    isStraightStyle,
    isEditingLine,
    editingLineId,
    setMapMemoTool,
    setPenWidth,
    setVisibleMapMemoColor,
    setVisibleMapMemoSettings,
    setMapMemoSettingsTab,
    setArrowStyle,
    selectPenColor,
    handleGrantMapMemo,
    handleMoveMapMemo,
    handleReleaseMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    clearMapMemoHistory,
    pauseMapMemoDrawing,
    changeColorTypeToIndividual,
    setPencilModeActive,
    setSnapWithLine,
    setIsStraightStyle,
  } = useMapMemo(mapViewRef.current);
  const { importPdfFile, importPmtilesFile, updatePmtilesURL } = useMaps();
  const { addCurrentPoint, resetPointPosition, updatePointPosition } = usePointTool();
  //現在位置、GPS関連
  const {
    currentLocation,
    isLocationStale,
    gpsState,
    trackingState,
    headingUp,
    azimuth,
    trackMetadata,
    savingTrackStatus,
    toggleGPS,
    toggleTracking,
    toggleHeadingUp,
    checkUnsavedTrackLog,
    saveTrackLog,
    confirmLocationPermission,
    updateLocationFromWebGeolocate,
    endWebGeolocate,
  } = useLocation(mapViewRef);
  //現在位置の共有関連
  const { uploadLocation } = useSyncLocation(projectId);

  //Account関連
  const { logout, deleteLocalEncryptKeys } = useAccount();
  //Google Drive接続状態（起動時のサイレント再接続を含む）
  const { googleAccountEmail, disconnectGoogleAccount } = useGoogleAccount();
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
  const [poiInfo, setPoiInfo] = useState<PoiInfoType | null>(null);
  const [mapLocationInfo, setMapLocationInfo] = useState<MapLocationInfoType | null>(null);
  const [trackPointInfo, setTrackPointInfo] = useState<TrackPointInfoType | null>(null);
  const [pendingSplitPosition, setPendingSplitPosition] = useState<Position | null>(null);
  // 可視領域作成ダイアログ（対象座標がセットされている間表示）
  const [viewshedTarget, setViewshedTarget] = useState<LocationType | null>(null);
  const [viewshedDistanceKm, setViewshedDistanceKm] = useState('3');
  const [viewshedObserverHeight, setViewshedObserverHeight] = useState('2');
  // 長押し位置の近くの既存ポイント（スナップ候補）と、それを中心に使うかの選択
  const [viewshedSnapPoint, setViewshedSnapPoint] = useState<{ coordinate: LocationType; name: string } | null>(null);
  const [viewshedUseSnap, setViewshedUseSnap] = useState(true);
  const { addViewshedResult, hasViewshedPreview } = useContext(ViewshedContext);
  const attribution = useMemo(() => {
    const sources = Array.from(
      new Set(
        tileMaps
          .filter((tileMap) => tileMap.visible && tileMap.url && tileMap.attribution)
          .map((tileMap) => tileMap.attribution)
      )
    );
    // 可視領域は標高タイルの加工物なので、表示中は標高データの出典も併記する
    if (hasViewshedPreview) sources.push(t('common.demAttribution'));
    return sources.join(', ');
  }, [tileMaps, hasViewshedPreview]);

  const downloadMode = useMemo(
    () => route.params?.tileMap !== undefined || route.params?.mode === 'download',
    [route.params?.tileMap, route.params?.mode]
  );
  const downloadTileMapName = useMemo(() => route.params?.tileMap?.name || '', [route.params?.tileMap]);
  const exportPDFMode = useMemo(() => route.params?.mode === 'exportPDF', [route.params?.mode]);

  // ネットワーク状態に基づく効果的なオフライン判定
  // 手動のisOffline設定とネットワーク接続状態の両方を考慮
  const effectiveOffline = useMemo(() => {
    // 手動でオフラインモードが設定されている場合は常にオフライン
    if (isOffline) return true;

    // ネットワーク接続状態をチェック（nullの場合はオンラインと仮定）
    if (isConnected === false) return true;

    // それ以外はオンライン
    return false;
  }, [isOffline, isConnected]);

  /******************************* */
  const downloadData = useCallback(
    async ({ isAdmin = false, shouldPhotoDownload = false }) => {
      if (project === undefined) throw new Error(t('hooks.message.unknownError'));

      //ログアウト後にバックアップ復元した状態（Redux上はログイン済みだが認証セッションなし）では
      //サーバー同期できないため、再ログインを案内する
      if (user.uid && !hasAuthSession()) {
        throw new Error(t('hooks.message.reloginRequired'));
      }
      // e3kitの初期化チェック
      if (!e3kit.isInitialized() && user.uid) {
        const { isOK: initE3kitOK, message: initE3kitMessage } = await e3kit.initializeUser(user.uid);
        if (!initE3kitOK) {
          throw new Error(
            `${t('hooks.message.failedInitializeEncrypt')}${initE3kitMessage ? `: ${initE3kitMessage}` : ''}`
          );
        }
      }
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

  const onCloseBottomSheet = useCallback(
    async (currentRouteName?: string) => {
      // currentRouteNameが渡された場合はそれを使用、なければrouteNameを使用
      const effectiveRouteName = currentRouteName ?? routeName;
      if (effectiveRouteName === 'DataEdit') {
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
      } else if (effectiveRouteName === 'LayerEdit') {
        if (isEditingLayer) {
          const ret = await ConfirmAsync(t('LayerEdit.confirm.gotoBack'));
          if (ret) {
            dispatch(editSettingsAction({ isEditingLayer: false }));
          } else {
            bottomSheetRef.current?.snapToIndex(2);
            return;
          }
        }
      } else if (effectiveRouteName === 'MapEdit') {
        if (isEditingMap) {
          const ret = await ConfirmAsync(t('MapEdit.confirm.gotoBack'));
          if (ret) {
            dispatch(editSettingsAction({ isEditingMap: false }));
          } else {
            bottomSheetRef.current?.snapToIndex(2);
            return;
          }
        }
      }
      bottomSheetRef.current?.close();
    },
    [
      dispatch,
      isEditingLayer,
      isEditingMap,
      isEditingRecord,
      route.params?.mode,
      routeName,
      setIsEditingRecord,
      unselectRecord,
    ]
  );

  // ダウンロードモードに入った時にBottomSheetを閉じる
  useEffect(() => {
    if (downloadMode) {
      bottomSheetRef.current?.close();
    }
  }, [downloadMode]);

  // PanResponder内から最新のgpsState/toggleGPSを参照するためのref同期
  useEffect(() => {
    gpsStateRef.current = gpsState;
  }, [gpsState]);
  useEffect(() => {
    toggleGPSRef.current = toggleGPS;
  }, [toggleGPS]);

  // ボトムシートが開いた後にpendingSelectRecordを処理
  // マーカーの色変更とボトムシートのアニメーションの競合（IllegalStateException）を避けるため
  // アニメーション完了を待つために遅延を追加
  useEffect(() => {
    if (isBottomSheetOpen && pendingSelectRecord.current) {
      const { layerId, feature } = pendingSelectRecord.current;
      pendingSelectRecord.current = null;
      // ボトムシートのアニメーションが完全に完了するまで待つ
      const timer = setTimeout(() => {
        selectRecord(layerId, feature);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isBottomSheetOpen, selectRecord]);

  const onRegionChangeMapView = useCallback(
    (region: Region | ViewState) => {
      changeMapRegion(region);
      // Web(maplibre)は地図パン中にdrawLineのhide/showが起きず refreshDrawLine が false のままになり、
      // 再計算useEffectが走らず描画オーバーレイ（マーカー/ライン）が旧位置に取り残される。
      // Webでは地図移動のたびにshowDrawLine()でrefreshフラグを立て、xyを地図へ追従させる。
      if (Platform.OS === 'web' || !isDrawLineVisible) showDrawLine();
      closeVectorTileInfo();
      setPoiInfo(null);
      setMapLocationInfo(null);
      setTrackPointInfo(null);
      setTrackFocusPoint(null);
      setExpandedClusterId(null);
    },
    [
      changeMapRegion,
      closeVectorTileInfo,
      isDrawLineVisible,
      showDrawLine,
      setPoiInfo,
      setMapLocationInfo,
      setTrackFocusPoint,
      setExpandedClusterId,
    ]
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

  const onDragMapView = useCallback(async () => {
    //console.log('onDragMapView');
    // ref経由で参照することで、PanResponder側で先に追従解除済みなら二重呼び出しを回避（Android対策）
    if (gpsStateRef.current === 'follow') {
      await toggleGPSRef.current?.('show');
    }
    setPoiInfo(null);
    setMapLocationInfo(null);
    setTrackPointInfo(null);
    setTrackFocusPoint(null);
    setExpandedClusterId(null);
  }, [setPoiInfo, setMapLocationInfo, setTrackFocusPoint, setExpandedClusterId]);

  const togglePencilMode = useCallback(() => {
    runTutrial('PENCILMODE');
    setPencilModeActive(!isPencilModeActive);
  }, [isPencilModeActive, runTutrial, setPencilModeActive]);

  // 長押し位置の近く（40px以内）にある表示中の既存ポイントを探す（可視領域の中心へのスナップ候補）
  const findNearestVisiblePoint = useCallback(
    (pXY: Position): { coordinate: LocationType; name: string } | undefined => {
      const SNAP_RADIUS_PX = 40;
      let nearest: { coordinate: LocationType; name: string } | undefined;
      let nearestDist = SNAP_RADIUS_PX;
      for (const layer of layers) {
        if (layer.type !== 'POINT' || !layer.visible) continue;
        for (const data of pointDataSet) {
          if (data.layerId !== layer.id) continue;
          for (const record of data.data) {
            if (!record.visible || (record as RecordType).deleted || record.coords === undefined) continue;
            const coords = record.coords as LocationType;
            const xy = latLonToXY([coords.longitude, coords.latitude], mapRegion, mapSize, mapViewRef.current);
            const dist = Math.hypot(xy[0] - pXY[0], xy[1] - pXY[1]);
            if (dist < nearestDist) {
              nearestDist = dist;
              const label = generateLabel(layer, record);
              nearest = { coordinate: coords, name: label !== '' ? label : layer.name };
            }
          }
        }
      }
      return nearest;
    },
    [layers, pointDataSet, mapRegion, mapSize]
  );

  // 長押しポップアップの「可視領域を作成」から呼ばれ、設定ダイアログを開く
  const pressCreateViewshed = useCallback(
    (coordinate: LocationType, snapPoint?: { coordinate: LocationType; name: string }) => {
      setViewshedTarget(coordinate);
      setViewshedSnapPoint(snapPoint ?? null);
      setViewshedUseSnap(true);
    },
    []
  );

  const pressViewshedOK = useCallback(async () => {
    if (viewshedTarget === null) return;
    const distanceKm = parseFloat(viewshedDistanceKm);
    const observerHeight = parseFloat(viewshedObserverHeight);
    if (isNaN(distanceKm) || distanceKm < 0.1 || distanceKm > 100) {
      await AlertAsync(t('Home.alert.viewshedDistanceRange'));
      return;
    }
    if (isNaN(observerHeight) || observerHeight < 0 || observerHeight > 1000) {
      await AlertAsync(t('Home.alert.viewshedHeightRange'));
      return;
    }
    // スナップ候補があり選択が維持されていれば、既存ポイントの正確な座標を中心にし、
    // ポイント名を観測点レコードの備考に記録する
    const snapped = viewshedUseSnap && viewshedSnapPoint !== null ? viewshedSnapPoint : null;
    const observer = snapped ? snapped.coordinate : viewshedTarget;
    setViewshedTarget(null);
    setViewshedSnapPoint(null);
    setIsLoading(true);
    try {
      const { isOK, message, result } = await calcViewshedPreview(observer, distanceKm, observerHeight);
      setIsLoading(false);
      if (isOK && result !== undefined) {
        addViewshedResult(result);
      } else {
        await AlertAsync(message);
      }
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [viewshedTarget, viewshedDistanceKm, viewshedObserverHeight, viewshedUseSnap, viewshedSnapPoint, addViewshedResult]);

  const pressViewshedCancel = useCallback(() => {
    setViewshedTarget(null);
    setViewshedSnapPoint(null);
  }, []);

  const selectMapMemoTool = useCallback(
    async (value: MapMemoToolType | undefined) => {
      setInfoToolActive(false);
      if (value === undefined) {
        setMapMemoTool('NONE');
      } else {
        //どのツールもマップメモの内容を書き換えるため、ブラシ・スタンプ・消しゴム含め全てで編集可否を確認する
        if (!editableMapMemo) {
          Alert.alert('', t('Home.alert.cannotEdit'));
          return;
        }
        //レイヤの色分け設定を書き換えることになるので、実際に描くペンのときだけ事前に確認する
        if (isPenTool(value) && isIndividualColorRequired) {
          const ret = await ConfirmAsync(t('Home.confirm.individualColor'));
          if (!ret) return;
          changeColorTypeToIndividual();
        }
        setDrawTool('NONE');
        setMapMemoTool(value);
      }
    },
    [
      changeColorTypeToIndividual,
      editableMapMemo,
      isIndividualColorRequired,
      setDrawTool,
      setInfoToolActive,
      setMapMemoTool,
    ]
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

  //MEMOモード内で各ツールの設定を一度開いたかどうか。モード入場ごとにリセットし、
  //初回タップでは設定タブを開いて確認してもらう
  const mapMemoToolVisited = useRef<{ [key in MapMemoToolGroupType]?: boolean }>({});
  //各グループで最後に使った種別（トグルON時に復元する）
  const mapMemoLastTool = useRef<{ [key in MapMemoToolGroupType]?: MapMemoToolType }>({ PEN: 'PEN' });

  useEffect(() => {
    if (isStampTool(currentMapMemoTool)) mapMemoLastTool.current.STAMP = currentMapMemoTool;
    else if (isBrushTool(currentMapMemoTool)) mapMemoLastTool.current.BRUSH = currentMapMemoTool;
    else if (isEraserTool(currentMapMemoTool)) mapMemoLastTool.current.ERASER = currentMapMemoTool;
  }, [currentMapMemoTool]);

  /**
   * マップメモ設定モーダルを指定タブで開く（タブバーからの切替にも使う）
   */
  const openMapMemoSettingsTab = useCallback(
    (tab: MapMemoToolGroupType) => {
      setMapMemoSettingsTab(tab);
      setVisibleMapMemoSettings(true);
    },
    [setMapMemoSettingsTab, setVisibleMapMemoSettings]
  );

  const closeMapMemoSettings = useCallback(() => {
    setVisibleMapMemoSettings(false);
  }, [setVisibleMapMemoSettings]);

  /**
   * マップメモのツールボタン押下。
   * 選択中なら解除、未選択ならMEMOモード入場後の初回は設定タブを開き、
   * 2回目以降は前回の種別で即選択するトグル動作
   */
  const pressMapMemoToolButton = useCallback(
    (group: MapMemoToolGroupType) => {
      const isActive =
        group === 'PEN'
          ? isPenTool(currentMapMemoTool)
          : group === 'STAMP'
          ? isStampTool(currentMapMemoTool)
          : group === 'BRUSH'
          ? isBrushTool(currentMapMemoTool)
          : isEraserTool(currentMapMemoTool);
      if (isActive) {
        selectMapMemoTool(undefined);
        return;
      }
      const lastTool = group === 'PEN' ? 'PEN' : mapMemoLastTool.current[group];
      if (!mapMemoToolVisited.current[group] || lastTool === undefined) {
        mapMemoToolVisited.current[group] = true;
        openMapMemoSettingsTab(group);
        return;
      }
      selectMapMemoTool(lastTool);
    },
    [currentMapMemoTool, openMapMemoSettingsTab, selectMapMemoTool]
  );

  const selectFeatureButton = useCallback(
    (value: FeatureButtonType) => {
      setDrawTool('NONE');
      setMapMemoTool('NONE');
      toggleTerrain(value === 'NONE');
      setFeatureButton(value);
      resetDrawTools();
      clearMapMemoHistory();
      //MEMOモードに入るたびに「初回タップで設定を開く」をリセットする
      if (value === 'MEMO') mapMemoToolVisited.current = {};
      if (Platform.OS !== 'web') toggleHeadingUp(false);
    },
    [setDrawTool, setMapMemoTool, toggleTerrain, setFeatureButton, resetDrawTools, clearMapMemoHistory, toggleHeadingUp]
  );

  const finishEditPosition = useCallback(
    async (skipConfirm = false) => {
      // 座標がある場合は確認メッセージを表示（skipConfirmがtrueの場合はスキップ）
      if (!skipConfirm && route.params?.withCoord) {
        const ret = await ConfirmAsync(t('Home.confirm.discardEditPosition'));
        if (!ret) return;
      }

      bottomSheetRef.current?.snapToIndex(2);
      setTimeout(() => {
        //onPressMapViewでInfoToolがアクティブになるのを防ぐためSetTimeoutで遅延させる
        selectFeatureButton('NONE');
      }, 500);

      navigation.setParams({ mode: undefined });
    },
    [navigation, route.params?.withCoord, selectFeatureButton]
  );

  const addLocationPoint = useCallback(async () => {
    if (Platform.OS === 'web') {
      // Web版はGeolocateControl（地図の現在地ボタン）経由のライブ現在地のみ使用できる。
      // BackgroundGeolocationのフォールバック取得が無いため、現在地未取得なら中断する
      if (gpsState === 'off' || currentLocation === null) {
        await AlertAsync(t('Home.alert.gps'));
        return;
      }
    } else if (gpsState === 'off' && trackingState === 'off') {
      await AlertAsync(t('Home.alert.gps'));
      return;
    }

    // 確認アラートを表示
    const ret = await ConfirmAsync(t('Home.confirm.addLocationPoint'));
    if (!ret) {
      return;
    }

    // GPS ON（follow/show）または軌跡記録中は、保持済みのライブ現在地を渡す。
    // 記録中に getCurrentPosition を呼ぶとiOSで古い位置（軌跡開始地点）が返る不具合の回避。
    // 衛星捕捉中（stale=キャッシュ位置表示中）は古い座標を登録しないよう渡さない
    // （従来この時間帯はcurrentLocationがnullだったため挙動維持）。
    const preferred =
      (gpsState !== 'off' || trackingState === 'on') && !isLocationStale ? currentLocation : undefined;
    const { isOK, message, layer, record } = await addCurrentPoint(preferred);
    if (!isOK || layer === undefined || record === undefined) {
      await AlertAsync(message);
    } else {
      bottomSheetRef.current?.snapToIndex(2);

      navigateToSplit?.('DataEdit', {
        previous: 'Data',
        targetData: record,
        targetLayer: layer,
      });
    }
  }, [addCurrentPoint, currentLocation, isLocationStale, gpsState, navigateToSplit, trackingState]);

  const handleAddLocationPoint = useCallback(async () => {
    await addLocationPoint();
  }, [addLocationPoint]);

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
          if (route.params?.mode === 'editPosition') finishEditPosition(true);
        } else {
          //ドローツールをオン

          if (isPointTool(value)) {
            if (activePointLayer === undefined) {
              await AlertAsync(t('Home.alert.cannotEdit'));
              return;
            }

            // ADD_LOCATION_POINTの場合は現在地でポイント編集を開始
            if (value === 'ADD_LOCATION_POINT') {
              await handleAddLocationPoint();
              return; // handleAddLocationPoint内でsetDrawToolを呼んでいるため
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
      if (finished) finishEditPosition(true);
    }
  }, [finishEditPosition, route.params?.mode, undoDraw]);

  const pressSaveDraw = useCallback(async () => {
    let result;
    if (featureButton === 'POINT') {
      result = savePoint();
    } else if (featureButton === 'LINE') {
      result = saveLine();
    } else if (featureButton === 'POLYGON') {
      result = savePolygon();
    }
    if (result === undefined) return false;
    const { isOK, message, layer, recordSet } = result;
    if (!isOK) {
      Alert.alert('', message);
      return false;
    }
    // console.log('🔍 pressSaveDraw - layer:', layer?.name, 'type:', layer?.type, 'id:', layer?.id);
    setDrawTool('NONE');
    if (route.params?.mode === 'editPosition') {
      navigation.setParams({ mode: undefined });
    }
    // 編集選択の場合はボトムシートを開かない
    if (!isSelectedDraw && layer !== undefined && recordSet !== undefined && recordSet.length > 0) {
      bottomSheetRef.current?.snapToIndex(2);
      navigateToSplit?.('DataEdit', {
        previous: 'Data',
        targetData: recordSet[0],
        targetLayer: layer,
      });
    }
    return true;
  }, [featureButton, isSelectedDraw, navigation, navigateToSplit, route.params?.mode, savePoint, saveLine, savePolygon, setDrawTool]);

  // ダウンロード対象の地図リスト（選択地図 > 全地図 > 従来の単一地図）
  // 可視領域用DEM（疑似地図・Redux tileMaps非登録）は、明示選択時と「すべての地図」時に合成して含める
  const downloadTargetMaps = useMemo(() => {
    if (selectedTileMapIds.length > 0) {
      const maps = tileMaps.filter((map) => selectedTileMapIds.includes(map.id));
      if (selectedTileMapIds.includes(DEM_VIEWSHED_MAP_ID)) maps.push(getDemViewshedTileMap());
      return maps;
    }
    if (route.params?.mode === 'download') {
      // 「すべての地図」が選択されている場合、ダウンロード可能な全ての地図
      return [
        ...tileMaps.filter((map) => !map.isGroup && map.id !== 'standard' && map.id !== 'hybrid'),
        getDemViewshedTileMap(),
      ];
    }
    return route.params?.tileMap !== undefined ? [route.params.tileMap] : [];
  }, [route.params?.mode, route.params?.tileMap, selectedTileMapIds, tileMaps]);

  // ズームレベルではなく推定タイル数でダウンロード可否を判定する（地図ごとの実際の取得範囲に自動で追従）
  const estimatedTileCount = useMemo(
    () => estimateDownloadTileCount(boundsFromCoords(downloadArea.coords), downloadTargetMaps, zoom),
    [downloadArea.coords, downloadTargetMaps, zoom]
  );
  const isDownloadPossible = estimatedTileCount <= DOWNLOAD_TILE_COUNT_LIMIT;

  const pressDownloadTiles = useCallback(async () => {
    if (estimatedTileCount > DOWNLOAD_TILE_COUNT_LIMIT) {
      await AlertAsync(t('Home.alert.tooManyTiles'));
      return;
    }
    if (estimatedTileCount > DOWNLOAD_TILE_COUNT_CONFIRM) {
      const estimatedMB = Math.round(estimatedTileCount * ESTIMATED_TILE_SIZE_MB);
      const ok = await ConfirmAsync(
        t('Home.confirm.downloadTiles', {
          tileCount: estimatedTileCount.toLocaleString(),
          size: estimatedMB.toLocaleString(),
        })
      );
      if (!ok) return;
    }

    if (selectedTileMapIds.length > 0 || route.params?.mode === 'download') {
      await downloadMultipleTiles(zoom, downloadTargetMaps);
    } else {
      // 従来の単一地図ダウンロード
      downloadTiles(zoom);
    }
  }, [
    downloadTargetMaps,
    downloadTiles,
    downloadMultipleTiles,
    estimatedTileCount,
    route.params?.mode,
    selectedTileMapIds,
    zoom,
  ]);

  const pressStopDownloadTiles = useCallback(() => {
    stopDownloadTiles();
  }, [stopDownloadTiles]);

  const pressCompass = useCallback(async () => {
    if (isInfoToolActive) return;
    if (featureButton !== 'NONE') return;
    if (headingUp) {
      // オフは権限チェック・GPSサービス再同期を通さず即座に北向きへ戻す。
      // GPS状態は変更しない（follow中にshowへ降格させない）。
      await toggleHeadingUp(false);
      return;
    }
    if ((await confirmLocationPermission()) !== 'granted') return;
    // 回転（heading購読）を先に開始し、GPSサービス起動の完了を待たせない
    await toggleHeadingUp(true);
    await toggleGPS('show');
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
      await toggleGPS('follow');
      await toggleTracking('on');
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
        // 保存に成功したら軌跡サマリーを表示する
        if (result.isOK && result.layer !== undefined && result.record !== undefined) {
          bottomSheetRef.current?.snapToIndex(isLandscape ? 2 : 1);
          navigateToSplit('TrackSummary', {
            layerId: result.layer.id,
            recordId: result.record.id,
            userId: result.record.userId,
            previous: 'Home',
          });
        }
      }
    }
  }, [
    checkUnsavedTrackLog,
    confirmLocationPermission,
    isLandscape,
    navigateToSplit,
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
    const ret = await ConfirmAsync(t('Home.confirm.deleteTiles'));
    if (!ret) return;

    let mapsToDelete: TileMapType[] = [];

    // 選択された地図を削除
    if (selectedTileMapIds.length > 0) {
      mapsToDelete = tileMaps.filter((map) => selectedTileMapIds.includes(map.id));
      if (selectedTileMapIds.includes(DEM_VIEWSHED_MAP_ID)) mapsToDelete.push(getDemViewshedTileMap());
    } else if (downloadMode && route.params?.mode === 'download') {
      // ダウンロードモードで「すべての地図」が選択されている場合、ダウンロード可能な全ての地図を削除
      mapsToDelete = [
        ...tileMaps.filter((map) => !map.isGroup && map.id !== 'standard' && map.id !== 'hybrid'),
        getDemViewshedTileMap(),
      ];
    } else if (route.params?.tileMap !== undefined) {
      // 従来の単一地図削除（後方互換性のため）
      mapsToDelete = [route.params.tileMap];
    }

    // ファイル削除
    for (const map of mapsToDelete) {
      try {
        await FileSystem.deleteAsync(`${TILE_FOLDER}/${map.id}/`);
      } catch (error) {
        // エラーは無視
      }
    }

    // tileRegionsを一括削除
    const mapIdsToDelete = mapsToDelete.map((m) => m.id);
    const newTileRegions = tileRegions.filter((region) => !mapIdsToDelete.includes(region.tileMapId));
    dispatch(editSettingsAction({ tileRegions: newTileRegions }));
  }, [dispatch, downloadMode, route.params?.tileMap, route.params?.mode, selectedTileMapIds, tileRegions, tileMaps]);

  const toggleTileMapSelection = useCallback((tileMapId: string) => {
    setSelectedTileMapIds((prev) => {
      if (prev.includes(tileMapId)) {
        return prev.filter((id) => id !== tileMapId);
      } else {
        return [...prev, tileMapId];
      }
    });
  }, []);

  const pressLogout = useCallback(async () => {
    if (isSettingProject) {
      const ret = await ConfirmAsync(t('Home.confirm.discardLogout'));
      if (!ret) return;
    } else {
      const message =
        googleAccountEmail !== undefined ? t('Home.confirm.logoutWithGoogle') : t('Home.confirm.logout');
      const ret = await ConfirmAsync(message);
      if (!ret) return;
    }

    // ローカルの暗号化鍵一式を削除（uidを参照するためlogoutより前に実行。エラーでも続行）
    await deleteLocalEncryptKeys();

    clearProject();
    await logout();
    // LOGOUT=すべてサインアウト。組織ログアウト後にGoogle接続だけ残ると
    // アカウントボタンが接続済み表示のままになり「ログアウトできていない」ように見えるため
    if (googleAccountEmail !== undefined) {
      await disconnectGoogleAccount();
    }
    navigation.navigate('Home');
  }, [clearProject, deleteLocalEncryptKeys, disconnectGoogleAccount, googleAccountEmail, isSettingProject, logout, navigation]);

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
      if (!isConnected) {
        await AlertAsync(t('Home.alert.noInternet'));
        return;
      }
      setIsLoading(true);
      //ログアウト後にバックアップ復元した状態（Redux上はログイン済みだが認証セッションなし）では
      //サーバー同期できないため、再ログインを案内する
      if (user.uid && !hasAuthSession()) {
        await AlertAsync(t('hooks.message.reloginRequired'));
        setIsLoading(false);
        return;
      }
      // e3kitの初期化チェック
      if (!e3kit.isInitialized() && user.uid) {
        const { isOK: initE3kitOK, message: initE3kitMessage } = await e3kit.initializeUser(user.uid);
        if (!initE3kitOK) {
          await AlertAsync(
            `${t('hooks.message.failedInitializeEncrypt')}${initE3kitMessage ? `: ${initE3kitMessage}` : ''}`
          );
          setIsLoading(false);
          return;
        }
      }

      const { isOK, message } = await uploadData();
      setIsLoading(false);
      if (!isOK) {
        // キャンセル時など message が空の場合は不要なダイアログを出さない
        if (message) await AlertAsync(message);
      } else {
        await AlertAsync(t('Home.alert.upload'));
      }
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [isConnected, uploadData, user.uid]);

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
      navigateToSplit?.('Layers');
      clearProject();
      setIsShowingProjectButtons(false);
    }
  }, [clearProject, navigateToSplit]);

  const pressSaveProjectSetting = useCallback(async () => {
    try {
      const ret = await ConfirmAsync(t('Home.confirm.saveProject'));
      if (!ret) return;
      setIsLoading(true);
      await saveProjectSetting();
      setIsLoading(false);
      await AlertAsync(t('Home.alert.saveProject'));
      navigateToSplit?.('Layers');
      clearProject();
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: project!, isNew: false });
    } catch (e: any) {
      setIsLoading(false);
      await AlertAsync(e.message);
    }
  }, [clearProject, navigateToSplit, navigation, project, saveProjectSetting]);

  const pressDiscardProjectSetting = useCallback(async () => {
    const ret = await ConfirmAsync(t('Home.confirm.discardProject'));
    if (ret) {
      navigateToSplit?.('Layers');
      clearProject();
      navigation.navigate('ProjectEdit', { previous: 'Projects', project: project!, isNew: false });
    }
  }, [clearProject, navigateToSplit, navigation, project]);
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
      accountFormState: 'selectLoginMethod',
    });
  }, [navigation]);

  const gotoLayers = useCallback(async () => {
    if (isEditingRecord) {
      AlertAsync(t('Home.alert.discardChanges'));
      return;
    }
    navigation.setParams({ mode: undefined });
    // Data または DataEdit 画面が開いている場合は BottomSheet を開くだけ
    if (bottomSheetCurrentScreen.name !== 'Data' && bottomSheetCurrentScreen.name !== 'DataEdit') {
      navigateToSplit?.('Layers');
    }
    bottomSheetRef.current?.snapToIndex(2);
  }, [isEditingRecord, navigation, navigateToSplit, bottomSheetCurrentScreen.name]);

  const gotoMaps = useCallback(async () => {
    if (isEditingRecord) {
      AlertAsync(t('Home.alert.discardChanges'));
      return;
    }
    navigation.setParams({ tileMap: undefined, mode: undefined });
    // 先にナビゲーションを完了させてからBottomSheetを開く（ちらつき防止）
    navigateToSplit?.('Maps');
    bottomSheetRef.current?.snapToIndex(2);
  }, [isEditingRecord, navigation, navigateToSplit]);

  const gotoSettings = useCallback(async () => {
    navigateToSplit?.('Settings', {
      previous: 'Home',
    });
    bottomSheetRef.current?.snapToIndex(2);
  }, [navigateToSplit]);

  const pressDisconnectDrive = useCallback(async () => {
    const ret = await ConfirmAsync(t('GoogleDriveProjects.confirm.disconnect'));
    if (!ret) return;
    await disconnectGoogleAccount();
  }, [disconnectGoogleAccount]);

  const gotoDriveProjects = useCallback(async () => {
    navigateToSplit?.('GoogleDriveProjects', { previous: 'Home' });
    bottomSheetRef.current?.snapToIndex(2);
  }, [navigateToSplit]);

  const gotoHome = useCallback(
    (params?: NavigateToHomeParams) => {
      navigation.navigate('Home', {
        previous: params?.previous || 'Home',
        mode: params?.mode,
        tileMap: params?.tileMap,
        jumpTo: params?.jumpTo,
        layer: params?.layer,
        record: params?.record,
        withCoord: params?.withCoord,
      });
    },
    [navigation]
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
          const mapResult = await exportFileFromUri(mapUri as string, fileName, { mimeType: 'application/pdf' });
          const dataResult = await exportFileFromUri(dataUri as string, fileName.replace('_map_', '_data_'), {
            mimeType: 'application/pdf',
          });
          setIsLoading(false);
          if (mapResult === 'saved' || dataResult === 'saved') await AlertAsync(t('Home.alert.exportPDF'));
        } else {
          setIsLoading(true);
          mapUri = await generatePDF({ dataSet, layers });
          const mapResult = await exportFileFromUri(mapUri as string, fileName, { mimeType: 'application/pdf' });
          setIsLoading(false);
          if (mapResult === 'saved') await AlertAsync(t('Home.alert.exportPDF'));
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
        finishEditPosition(true);
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
        return false;
      }
      setTrackPointInfo(null);

      // 軌跡サマリー表示中の写真マーカーのタップ判定。
      // 重なる写真はグループ化されているため、複数枚グループはまず引き出し線つきで展開し、
      // 展開後のサムネイルをタップで拡大表示する。
      // クラスタリングは表示側（HomeTrackPhotoMarkers）と同一の入力・ロジックで行い判定を一致させる
      if (Platform.OS !== 'web' && trackPhotos.length > 0) {
        const pXY = getPXY(event);
        const items = trackPhotos.map((photo) => {
          const [x, y] = latLonToXY([photo.longitude, photo.latitude], mapRegion, mapSize, mapViewRef.current);
          return { assetId: photo.assetId, x, y };
        });
        const clusters = clusterTrackPhotos(items);
        const photoById = new Map(trackPhotos.map((p) => [p.assetId, p]));

        // 展開中グループがあれば引き出し先のサムネイル位置を優先判定
        const expandedCluster = clusters.find((c) => c.id === expandedClusterId && c.assetIds.length > 1);
        if (expandedCluster !== undefined) {
          const offsets = spiderOffsets(expandedCluster.assetIds.length);
          let nearestPhoto = null as (typeof trackPhotos)[number] | null;
          let nearestDist = TRACK_PHOTO_TAP_RADIUS_PX;
          for (let i = 0; i < expandedCluster.assetIds.length; i++) {
            const dist = Math.hypot(
              expandedCluster.x + offsets[i].dx - pXY[0],
              expandedCluster.y + offsets[i].dy - pXY[1]
            );
            if (dist <= nearestDist) {
              nearestDist = dist;
              nearestPhoto = photoById.get(expandedCluster.assetIds[i]) ?? null;
            }
          }
          if (nearestPhoto !== null) {
            setSelectedPhoto(nearestPhoto);
            return false; // 写真を表示したので他のヒットテストは行わない
          }
          // 展開中に他の場所をタップしたら折りたたむ（このタップは他のヒットテストに回さない）
          setExpandedClusterId(null);
          return false;
        }

        let nearestCluster = null as (typeof clusters)[number] | null;
        let nearestDist = TRACK_PHOTO_TAP_RADIUS_PX;
        for (const cluster of clusters) {
          const dist = Math.hypot(cluster.x - pXY[0], cluster.y - pXY[1]);
          if (dist <= nearestDist) {
            nearestDist = dist;
            nearestCluster = cluster;
          }
        }
        if (nearestCluster !== null) {
          if (nearestCluster.assetIds.length > 1) {
            setExpandedClusterId(nearestCluster.id);
          } else {
            const photo = photoById.get(nearestCluster.id);
            if (photo !== undefined) setSelectedPhoto(photo);
          }
          return false; // 写真グループを処理したので他のヒットテストは行わない
        }
      }

      const { layer, feature, recordSet, recordIndex } = selectSingleFeature(event);

      if (layer === undefined || feature === undefined || recordSet === undefined || recordIndex === undefined) {
        // editPositionモード中は選択を外さない
        if (route.params?.mode !== 'editPosition') {
          unselectRecord();
        }
        // 記録中の軌跡ログはレコード化前でselectSingleFeatureの対象外のため、別途ヒットテストする。
        // 保存済み軌跡と同様に、時刻ポップアップとあわせてサマリー（記録中はライブ更新）を開く
        if (Platform.OS !== 'web' && trackMetadata.totalPoints > 0) {
          const pXY = getPXY(event);
          const latlon = xyToLatLon(pXY, mapRegion, mapSize, mapViewRef.current);
          const radius = calcDegreeRadius(2000, mapRegion, mapSize);
          const nearest = findNearestTrackPoint(getAllTrackPoints(), latlon, radius);
          const timestamp = nearest?.interpolatedTimestamp ?? nearest?.point.timestamp;
          if (nearest !== undefined && timestamp !== undefined) {
            setTrackPointInfo({
              coordinate: { latitude: nearest.point.latitude, longitude: nearest.point.longitude },
              timestamp,
              altitude: nearest.point.altitude,
              speed: nearest.point.speed,
            });
            bottomSheetRef.current?.snapToIndex(isLandscape ? 2 : 1);
            navigateToSplit('TrackSummary', {
              recording: true,
              previous: 'Home',
              initialFocusLatLon: { latitude: nearest.point.latitude, longitude: nearest.point.longitude },
            });
            return false; // ポップアップとサマリーを表示したのでgetInfoOfMapは実行しない
          }
        }
        return true; // 何も見つからなかったのでtrueを返す
      }

      // 保存済み軌跡（trackレイヤ）はDataEditを開かず、タップ位置に最も近い軌跡上の地点の時刻ポップアップのみ表示する
      // （timestampがない軌跡は従来どおりDataEditへフォールバック）
      // ヒットテストはReduxのcoords（timestamp保持済み）を使うためWebでも動作する
      if (layer.id === 'track' && layer.type === 'LINE') {
        const lineFeature = feature as LineRecordType;
        if (lineFeature.coords !== undefined) {
          const pXY = getPXY(event);
          const latlon = xyToLatLon(pXY, mapRegion, mapSize, mapViewRef.current);
          const radius = calcDegreeRadius(2000, mapRegion, mapSize);
          const nearest = findNearestTrackPoint(lineFeature.coords, latlon, radius);
          const timestamp = nearest?.interpolatedTimestamp ?? nearest?.point.timestamp;
          if (nearest !== undefined && timestamp !== undefined) {
            setTrackPointInfo({
              coordinate: { latitude: nearest.point.latitude, longitude: nearest.point.longitude },
              timestamp,
              altitude: nearest.point.altitude,
              speed: nearest.point.speed,
            });
            // タップと同時にサマリーを開き、タップ地点を初期フォーカスにする
            bottomSheetRef.current?.snapToIndex(isLandscape ? 2 : 1);
            navigateToSplit('TrackSummary', {
              layerId: layer.id,
              recordId: lineFeature.id,
              userId: lineFeature.userId,
              previous: 'Home',
              initialFocusLatLon: { latitude: nearest.point.latitude, longitude: nearest.point.longitude },
            });
            return false; // サマリーを表示したのでDataEditへは遷移しない
          }
        }
      }

      // selectRecordを遅延実行するためにペンディング状態に保存
      // ボトムシートが開いた後にselectRecordを実行することで、
      // マーカーの色変更とボトムシートのアニメーションの競合を避ける
      pendingSelectRecord.current = { layerId: layer.id, feature: { ...feature } };

      // 先にボトムシートを開く
      if (isLandscape) {
        bottomSheetRef.current?.snapToIndex(2);
      } else {
        bottomSheetRef.current?.snapToIndex(1);
      }
      navigateToSplit?.('DataEdit', {
        previous: 'Data',
        targetData: { ...feature },
        targetLayer: { ...layer },
      });
      return false; // フィーチャーが見つかったのでfalseを返す
    },
    [
      isEditingRecord,
      isLandscape,
      navigateToSplit,
      route.params?.mode,
      selectSingleFeature,
      unselectRecord,
      trackMetadata.totalPoints,
      trackPhotos,
      setSelectedPhoto,
      expandedClusterId,
      setExpandedClusterId,
      getPXY,
      mapRegion,
      mapSize,
    ]
  );

  // 描画・メモツールの起動や位置編集モードへの遷移時は距離測定を自動終了する
  useEffect(() => {
    if (isMeasuring && (featureButton !== 'NONE' || currentMapMemoTool !== 'NONE' || route.params?.mode === 'editPosition')) {
      endMeasure();
    }
  }, [isMeasuring, featureButton, currentMapMemoTool, route.params?.mode, endMeasure]);

  const handlePanResponderGrant = useCallback(
    async (event: GestureResponderEvent) => {
      //@ts-ignore
      isPencilTouch.current = !!event.nativeEvent.altitudeAngle;
      if (!event.nativeEvent.touches.length) return;

      const pXY = getPXY(event);

      // ドラッグ開始位置を記録
      dragStartPosition.current = { x: pXY[0], y: pXY[1] };

      // 新しいタッチの開始時に長押し発火フラグをリセット
      longPressFiredRef.current = false;

      // 長押しタイマーをクリア（既存のタイマーがある場合）
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      // 長押し検出タイマーを開始（800ms）
      // ドローツールが開いていても、特定のツールが選択されていない場合は長押しを有効にする
      // editPositionモード中は長押しを無効にする
      if (
        !isMeasuring &&
        (featureButton === 'NONE' || currentDrawTool === 'NONE') &&
        currentMapMemoTool === 'NONE' &&
        featureButton !== 'MEMO' &&
        route.params?.mode !== 'editPosition'
      ) {
        longPressTimerRef.current = setTimeout(async () => {
          // 長押しが検出された場合、地図の位置でGoogle Mapsへのポップアップを表示
          const xy = pXY;
          const latLonArray = xyArrayToLatLonObjects([xy], mapRegion, mapSize, mapViewRef.current);
          if (latLonArray && latLonArray.length > 0) {
            longPressFiredRef.current = true;
            setMapLocationInfo({
              coordinate: {
                latitude: latLonArray[0].latitude,
                longitude: latLonArray[0].longitude,
              },
              position: { x: xy[0], y: xy[1] },
              // 近くの既存ポイントがあれば可視領域の中心へのスナップ候補として保持
              snapPoint: findNearestVisiblePoint(xy),
            });
          }
        }, 800);
      }

      //if (route.params?.mode === 'editPosition') hideDrawLine();
      if (isPencilModeActive && isPencilTouch.current === false) {
        hideDrawLine();
        setIsPinch(true);
      } else if (currentDrawTool === 'MOVE') {
        hideDrawLine();
      } else if (currentDrawTool === 'SPLIT_LINE') {
        const isOK = checkSplitLine(pXY);
        if (isOK) {
          // 確認ダイアログを表示するため、位置を保存してuseEffectで処理
          setPendingSplitPosition(pXY);
          return; // 他の処理をスキップ
        }
      } else if (isPlotTool(currentDrawTool)) {
        handleGrantPlot(pXY);
      } else if (isFreehandTool(currentDrawTool)) {
        const finished = handleGrantFreehand(pXY);
        freehandFinishedRef.current = finished;
        if (finished) {
          if (route.params?.mode === 'editPosition') {
            const result = currentDrawTool === 'FREEHAND_LINE' ? saveLine() : savePolygon();
            const { isOK, message } = result;
            if (!isOK) {
              await AlertAsync(message);
              return;
            }
            finishEditPosition(true);
          } else {
            const result = currentDrawTool === 'FREEHAND_LINE' ? saveLine() : savePolygon();
            const { isOK, message, layer, recordSet } = result;
            if (!isOK && message !== undefined) {
              await AlertAsync(message);
            } else {
              setDrawTool('NONE');
              if (layer !== undefined && recordSet !== undefined && recordSet.length > 0) {
                bottomSheetRef.current?.snapToIndex(2);
                navigateToSplit?.('DataEdit', {
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
      getPXY,
      handleGrantFreehand,
      handleGrantMapMemo,
      handleGrantPlot,
      hideDrawLine,
      isPencilModeActive,
      isPencilTouch,
      navigateToSplit,
      route.params?.mode,
      saveLine,
      savePolygon,
      setDrawTool,
      setIsPinch,
      mapRegion,
      mapSize,
      setMapLocationInfo,
      findNearestVisiblePoint,
      isMeasuring,
    ]
  );
  const handlePanResponderMove = useCallback(
    //@ts-ignore
    (event: GestureResponderEvent, gesture) => {
      if (!event.nativeEvent.touches.length) return;
      const pXY = getPXY(event);

      // 地図をドラッグしていることを検出
      if (
        currentDrawTool === 'NONE' &&
        currentMapMemoTool === 'NONE' &&
        !isPlotTool(currentDrawTool) &&
        !isFreehandTool(currentDrawTool)
      ) {
        // ドラッグ開始位置からの移動距離を計算
        if (dragStartPosition.current) {
          const dx = pXY[0] - dragStartPosition.current.x;
          const dy = pXY[1] - dragStartPosition.current.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // 移動距離が閾値（5ピクセル）を超えた場合のみドラッグと判定
          if (distance > 5) {
            const isNewDrag = !isMapDragging.current;
            isMapDragging.current = true;

            // ドラッグ開始時にGPS追従モードを解除（iOS Google MapsのonPanDrag不発火対策）
            if (isNewDrag && gpsStateRef.current === 'follow') {
              toggleGPSRef.current?.('show');
            }

            // 長押しタイマーをクリア（移動が検出されたため）
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }

            // 既存のタイムアウトをクリア
            if (dragTimeoutRef.current) {
              clearTimeout(dragTimeoutRef.current);
            }

            // 300ms後にドラッグ状態をリセット
            dragTimeoutRef.current = setTimeout(() => {
              isMapDragging.current = false;
            }, 300);
          }
        }
      }

      if (currentDrawTool === 'MOVE' || isPinch) {
        return;
      }
      if (gesture.numberActiveTouches === 2) {
        hideDrawLine();
        //ペンで描画中はストロークを破棄せず中断し、ピンチ後に続きを描けるようにする
        pauseMapMemoDrawing();
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
      currentDrawTool,
      currentMapMemoTool,
      getPXY,
      handleMoveFreehand,
      handleMoveMapMemo,
      handleMovePlot,
      hideDrawLine,
      isPinch,
      pauseMapMemoDrawing,
      setIsPinch,
    ]
  );

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
      navigateToSplit?.('Data', { targetLayer: layer });
    }
  }, [deleteDraw, drawLine, navigateToSplit]);

  const handlePanResponderRelease = useCallback(
    async (event: GestureResponderEvent) => {
      isPencilTouch.current = undefined;

      // ドラッグ開始位置をリセット
      dragStartPosition.current = null;

      // 長押しタイマーをクリア
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      const pXY = getPXY(event);

      if (route.params?.mode === 'editPosition') showDrawLine();

      if (isPinch) {
        showDrawLine();
        setIsPinch(false);
        return;
      } else if (currentDrawTool === 'MOVE') {
        showDrawLine();
        return;
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
        navigateToSplit?.('Data', { targetLayer: layer });
      } else if (currentDrawTool === 'PLOT_POINT' || currentDrawTool === 'ADD_LOCATION_POINT') {
        handleReleasePlotPoint();
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
            finishEditPosition(true);
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
              navigateToSplit?.('DataEdit', {
                previous: 'Data',
                targetData: recordSet[0],
                targetLayer: layer,
              });
            }
          }
        }
      } else if (isFreehandTool(currentDrawTool)) {
        handleReleaseFreehand();
      } else if (currentDrawTool === 'SPLIT_LINE') {
        // 分割ツールの場合はリリース時に何もしない（確認ダイアログはGrantで処理）
        return;
      } else if (currentMapMemoTool !== 'NONE') {
        handleReleaseMapMemo(event);
      } else if (!isMapDragging.current && !freehandFinishedRef.current && !longPressFiredRef.current) {
        if (isMeasuring) {
          // 測定モード中はタップ位置をB点に設定（再タップで置換）。情報取得ポップアップは抑制する
          const latLonArray = xyArrayToLatLonObjects([pXY], mapRegion, mapSize, mapViewRef.current);
          if (latLonArray && latLonArray.length > 0) {
            setMeasureB({ latitude: latLonArray[0].latitude, longitude: latLonArray[0].longitude });
          }
        } else {
          // 地図をドラッグしておらず、長押しポップアップを表示していない場合のみ情報取得
          // まずgetInfoOfFeatureを実行し、何も見つからなければgetInfoOfMapを実行
          const noFeatureFound = await getInfoOfFeature(event);
          if (noFeatureFound) {
            // フィーチャーが見つからなかった場合、かつ長押しポップアップが表示されていない場合のみgetInfoOfMapを実行
            if (!mapLocationInfo) {
              const xy = pXY;
              const latLonArray = xyArrayToLatLonObjects([xy], mapRegion, mapSize, mapViewRef.current);
              if (latLonArray && latLonArray.length > 0) {
                const latlon: Position = [latLonArray[0].longitude, latLonArray[0].latitude];
                await getInfoOfMap(latlon, xy);
              }
            }
          }
        }
      }
      // ドラッグ状態をリセット
      isMapDragging.current = false;
      // フリーハンド完了フラグをリセット
      freehandFinishedRef.current = false;
      // 長押し発火フラグをリセット
      longPressFiredRef.current = false;
    },
    [
      currentDrawTool,
      currentMapMemoTool,
      deleteDraw,
      finishEditPosition,
      getInfoOfFeature,
      getInfoOfMap,
      getPXY,
      handleReleaseDeletePoint,
      handleReleaseFreehand,
      handleReleaseMapMemo,
      handleReleasePlotLinePolygon,
      handleReleasePlotPoint,
      handleReleaseSelect,
      isPencilTouch,
      isPinch,
      mapLocationInfo,
      mapRegion,
      mapSize,
      navigateToSplit,
      route.params,
      saveLine,
      savePolygon,
      setDrawTool,
      setIsPinch,
      showDrawLine,
      isMeasuring,
      setMeasureB,
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
    withCoord?: boolean;
  } | null>(null);

  // pendingEditPositionが設定されたら、mapRegion更新後に実行
  useEffect(() => {
    if (pendingEditPosition) {
      const { layer, record, featureType, withCoord } = pendingEditPosition;
      // 少し遅延を入れて確実にmapRegionが更新されてから実行
      const timer = setTimeout(() => {
        if (featureType === 'POINT') {
          // 位置なしレコードも編集対象として登録し、タップで設定した位置を既存レコードへ保存する
          selectObjectByFeature(layer, record, withCoord);
          setDrawTool('PLOT_POINT');
        } else if (featureType === 'LINE' || featureType === 'POLYGON') {
          // DataEditからの編集時は座標を再計算
          selectObjectByFeature(layer, record, true);
          setDrawTool(featureType === 'LINE' ? 'PLOT_LINE' : 'PLOT_POLYGON');
        }
        setPendingEditPosition(null);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [
    pendingEditPosition,
    mapRegion,
    selectObjectByFeature,
    setDrawTool,
  ]);

  // 分割確認ダイアログの処理
  const isSplitConfirmingRef = useRef(false);
  useEffect(() => {
    if (pendingSplitPosition === null) return;
    if (isSplitConfirmingRef.current) return; // 既に確認中なら何もしない

    isSplitConfirmingRef.current = true;

    const confirmAndSplit = async () => {
      const confirmed = await ConfirmAsync(t('Home.confirm.splitLine'));
      if (confirmed) {
        handleGrantSplitLine(pendingSplitPosition);
        if (route.params?.mode === 'editPosition') finishEditPosition(true);
        setDrawTool('NONE');
      }
      setPendingSplitPosition(null);
      isSplitConfirmingRef.current = false;
    };

    confirmAndSplit();
  }, [pendingSplitPosition, handleGrantSplitLine, route.params?.mode, finishEditPosition, setDrawTool]);

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
    } else if (route.params?.previous === 'Data') {
      //絞り込んだデータの範囲にジャンプする場合
      changeMapRegion(route.params.jumpTo, true);
      bottomSheetRef.current?.snapToIndex(0);
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
          setPendingEditPosition({ layer, record, featureType, withCoord: route.params?.withCoord });
        } else {
          // jumpToがない場合はすぐに編集モードを開始（座標再計算なし）
          if (featureType === 'POINT') {
            // 位置なしレコードも編集対象として登録し、タップで設定した位置を既存レコードへ保存する
            selectObjectByFeature(layer, record, false);
            setDrawTool('PLOT_POINT');
          } else if (featureType === 'LINE' || featureType === 'POLYGON') {
            selectObjectByFeature(layer, record, false);
            setDrawTool(featureType === 'LINE' ? 'PLOT_LINE' : 'PLOT_POLYGON');
          }
        }
      }
    } else if (route.params?.previous === 'Maps') {
      if (route.params?.tileMap || route.params?.mode === 'download') {
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
    //衛星捕捉中（stale=キャッシュ位置表示中）は古い位置をメンバーへ配信しない。
    if (Platform.OS !== 'web' && !isLocationStale) {
      uploadLocation(currentLocation);
    }
  }, [currentLocation, isLocationStale, uploadLocation]);

  useEffect(() => {
    return bottomSheetRef.current?.close();
  }, []);

  useEffect(() => {
    //編集中にアプリを落とした場合に再起動時に編集を破棄する
    setIsEditingRecord(false);
    dispatch(editSettingsAction({ isEditingLayer: false, isEditingMap: false }));

    if (Platform.OS === 'web') return;

    //起動時に読み込む場合

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

  // クリーンアップ処理: タイマーをクリア
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // POIタップの制御用関数
  const setPoiInfoWithControl = useCallback(
    (poi: PoiInfoType | null) => {
      // ドローツールが開いていても、特定のツールが選択されていない場合はPOIタップを有効にする
      if ((featureButton === 'NONE' || currentDrawTool === 'NONE') && currentMapMemoTool === 'NONE') {
        setPoiInfo(poi);
      }
    },
    [featureButton, currentDrawTool, currentMapMemoTool]
  );

  // MapViewContextの値をメモ化
  const mapViewContextValue = useMemo(
    () => ({
      mapViewRef,
      mapType,
      zoom,
      zoomDecimal,
      onRegionChangeMapView,
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
      isLocationStale,
      gpsState,
      pressGPS,
      updateLocationFromWebGeolocate,
      endWebGeolocate,
      isPinch,
      panResponder,
      isDrawLineVisible,
      isTerrainActive,
      toggleTerrain,
      poiInfo,
      setPoiInfo: setPoiInfoWithControl,
      mapLocationInfo,
      setMapLocationInfo,
      trackPointInfo,
      setTrackPointInfo,
      pressCreateViewshed,
    }),
    [
      mapViewRef,
      mapType,
      zoom,
      zoomDecimal,
      onRegionChangeMapView,
      onDragMapView,
      onDrop,
      pressZoomIn,
      pressZoomOut,
      pressCompass,
      headingUp,
      azimuth,
      currentLocation,
      isLocationStale,
      gpsState,
      pressGPS,
      updateLocationFromWebGeolocate,
      endWebGeolocate,
      panResponder,
      isDrawLineVisible,
      isTerrainActive,
      toggleTerrain,
      isPinch,
      poiInfo,
      setPoiInfoWithControl,
      mapLocationInfo,
      setMapLocationInfo,
      trackPointInfo,
      pressCreateViewshed,
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
      trackMetadata,
      memberLocations,
      pressTracking,
      pressSyncPosition,
      editPositionMode: route.params?.mode === 'editPosition',
      editPositionLayer: route.params?.layer,
      editPositionRecord: route.params?.record,
      finishEditPosition,
    }),
    [
      trackingState,
      trackMetadata,
      memberLocations,
      pressTracking,
      pressSyncPosition,
      route.params?.mode,
      route.params?.layer,
      route.params?.record,
      finishEditPosition,
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
      googleAccountEmail,
      pressDisconnectDrive,
      gotoDriveProjects,
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
      googleAccountEmail,
      pressDisconnectDrive,
      gotoDriveProjects,
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
    mapMemoEditingLineLatLon: mapMemoEditingLineLatLon.current,
    mapViewRef: mapViewRef.current,
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
      selectedTileMapIds,
      selectedDisplayTileMapId,
      isDownloadPossible,
      toggleTileMapSelection,
      setSelectedDisplayTileMapId,
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
      selectedTileMapIds,
      selectedDisplayTileMapId,
      isDownloadPossible,
      toggleTileMapSelection,
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
      selectMapMemoTool,
      setPenWidth,
      setVisibleMapMemoColor,
      pressMapMemoToolButton,
      openMapMemoSettingsTab,
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
      selectMapMemoTool,
      setPenWidth,
      setVisibleMapMemoColor,
      pressMapMemoToolButton,
      openMapMemoSettingsTab,
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
      isInfoToolActive,
      vectorTileInfo,
      selectInfoTool,
      setVisibleInfoPicker,
      setInfoToolActive,
      closeVectorTileInfo,
    }),
    [
      currentInfoTool,
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
      isOffline: effectiveOffline, // effectiveOfflineを使用
      restored,
      attribution,
      isLoading,
      setLoading: setIsLoading,
      user,
      gotoMaps,
      gotoSettings,
      gotoLayers,
      gotoHome,
      onSplitRouteChange: setCurrentSplitRoute,
      bottomSheetRef,
      onCloseBottomSheet,
      updatePmtilesURL,
    }),
    [
      effectiveOffline, // isOfflineの代わりにeffectiveOfflineを依存配列に含める
      restored,
      attribution,
      isLoading,
      user,
      gotoMaps,
      gotoSettings,
      gotoLayers,
      gotoHome,
      setIsLoading,
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
                          <HomeModalUpdateInfo />
                          <HomeModalMapMemoSettings
                            visible={visibleMapMemoSettings}
                            tab={mapMemoSettingsTab}
                            currentMapMemoTool={currentMapMemoTool}
                            currentPenWidth={currentPenWidth}
                            arrowStyle={arrowStyle}
                            isStraightStyle={isStraightStyle}
                            snapWithLine={snapWithLine}
                            selectMapMemoTool={selectMapMemoTool}
                            selectMapMemoPenWidth={setPenWidth}
                            selectMapMemoArrowStyle={setArrowStyle}
                            selectMapMemoStraightStyle={setIsStraightStyle}
                            selectMapMemoSnapWithLine={setSnapWithLine}
                            setTab={setMapMemoSettingsTab}
                            close={closeMapMemoSettings}
                          />
                          <HomeModalInfoPicker
                            modalVisible={visibleInfoPicker}
                            currentInfoTool={currentInfoTool}
                            selectInfoTool={selectInfoTool}
                            setVisibleInfoPicker={setVisibleInfoPicker}
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
                          <HomeModalViewshedSettings
                            visible={viewshedTarget !== null}
                            distanceKm={viewshedDistanceKm}
                            observerHeight={viewshedObserverHeight}
                            setDistanceKm={setViewshedDistanceKm}
                            setObserverHeight={setViewshedObserverHeight}
                            snapName={viewshedSnapPoint?.name}
                            useSnapPoint={viewshedUseSnap}
                            setUseSnapPoint={setViewshedUseSnap}
                            pressOK={pressViewshedOK}
                            pressCancel={pressViewshedCancel}
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
                          {savingTrackStatus.isSaving && (
                            <View style={styles.savingIndicator}>
                              <View style={styles.savingIndicatorContent}>
                                <ActivityIndicator size="large" color={COLOR.PROGRESS_BAR_FILL} />
                                <Text style={styles.savingIndicatorText}>{savingTrackStatus.message}</Text>
                                {savingTrackStatus.phase !== '' && (
                                  <View style={styles.progressBar}>
                                    <View
                                      style={[
                                        styles.progressBarFill,
                                        {
                                          width: `${
                                            savingTrackStatus.phase === 'merging'
                                              ? 25
                                              : savingTrackStatus.phase === 'filtering'
                                              ? 50
                                              : savingTrackStatus.phase === 'cleaning'
                                              ? 75
                                              : savingTrackStatus.phase === 'saving'
                                              ? 90
                                              : 0
                                          }%`,
                                        },
                                      ]}
                                    />
                                  </View>
                                )}
                              </View>
                            </View>
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

const styles = StyleSheet.create({
  savingIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLOR.SAVING_OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  savingIndicatorContent: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 10,
    padding: 20,
    minWidth: 250,
    alignItems: 'center',
    shadowColor: COLOR.BLACK,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  savingIndicatorText: {
    marginTop: 10,
    fontSize: 16,
    color: COLOR.TEXT_DARK,
    textAlign: 'center',
  },
  progressBar: {
    marginTop: 15,
    height: 6,
    width: 200,
    backgroundColor: COLOR.PROGRESS_BAR_BG,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLOR.PROGRESS_BAR_FILL,
    borderRadius: 3,
  },
});

// 外部コンポーネント - BottomSheetNavigationProvider でラップ
export default function HomeContainers(props: Props_Home) {
  // ルート変更を追跡するためのstate（HomeContainersInnerで使用）
  const [, setCurrentSplitRoute] = useState<string>('Layers');

  // gotoHome用のナビゲーション関数
  const handleNavigateToHome = useCallback(
    (params?: NavigateToHomeParams) => {
      props.navigation.navigate('Home', {
        previous: params?.previous || 'Home',
        mode: params?.mode,
        tileMap: params?.tileMap,
        jumpTo: params?.jumpTo,
        layer: params?.layer,
        record: params?.record,
        withCoord: params?.withCoord,
      });
    },
    [props.navigation]
  );

  return (
    <ViewshedProvider>
      <MeasureProvider>
        <TrackFocusProvider>
          <TrackPhotoProvider>
            <BottomSheetNavigationProvider onRouteChange={setCurrentSplitRoute} onNavigateToHome={handleNavigateToHome}>
              <HomeContainersInner {...props} />
            </BottomSheetNavigationProvider>
          </TrackPhotoProvider>
        </TrackFocusProvider>
      </MeasureProvider>
    </ViewshedProvider>
  );
}
