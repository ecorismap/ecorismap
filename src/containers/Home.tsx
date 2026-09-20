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
  ArrowStyleType,
  PenWidthType,
} from '../types';
import Home from '../components/pages/Home';
import { Alert } from '../components/atoms/Alert';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { shallowEqual, useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store';
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
  isEraserTool,
  isHandwritingTool,
  isLineTool,
  isMapMemoDrawTool,
  isPlotTool,
  isPointTool,
  isPolygonTool,
} from '../utils/General';
import { getEventTimestamp } from '../utils/OneEuroFilter';
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
import { generateLabel, resolveCodeField, toCodeFieldValue } from '../utils/Layer';
import { hex2rgba, hsv2rgbaString } from '../utils/Color';
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
import { HomeModalLayerSelect } from '../components/organisms/HomeModalLayerSelect';
import { useEditableLayerSelection } from '../hooks/useEditableLayerSelection';
import { TEMPLATE_LAYER, updateLayerAction } from '../modules/layers';
import { updateRecordsAction } from '../modules/dataSet';
import { ulid } from 'ulid';
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

//タッチ開始からこの時間内に2本目の指が着いたらピンチ意図とみなす（2本指の着地ずれの許容時間）
const PINCH_INTENT_DURATION_MS = 300;

// 内部コンポーネント - BottomSheetNavigationProvider の内側で使用
function HomeContainersInner({ navigation, route }: Props_Home) {
  const [restored] = useState(true);
  const mapViewRef = useRef<MapView | MapRef | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  //予約したシートのクローズ。開く操作が入ったら取り消す（開いた直後に閉じられるのを防ぐ）
  const sheetCloseTimerRef = useRef<NodeJS.Timeout | null>(null);
  //onChangeで受け取る実際の位置。-1が閉じた状態
  const lastSheetIndexRef = useRef(-1);
  const openSheetRetryRef = useRef<NodeJS.Timeout | null>(null);
  //こちらから閉じた場合に立てる。閉じ終わったあとに届くonCloseで確認ダイアログを
  //二度出さないために使う（シートが開いたら解除する）
  const isClosingBySelfRef = useRef(false);

  // BottomSheetNavigationContext からナビゲーション関数を取得
  const {
    navigate: bottomSheetNavigate,
    currentScreen: bottomSheetCurrentScreen,
    isBottomSheetOpen,
    setIsBottomSheetOpen,
  } = useBottomSheetNavigation();

  const cancelPendingSheetClose = useCallback(() => {
    if (sheetCloseTimerRef.current !== null) {
      clearTimeout(sheetCloseTimerRef.current);
      sheetCloseTimerRef.current = null;
    }
  }, []);

  const closeSheet = useCallback(() => {
    cancelPendingSheetClose();
    isClosingBySelfRef.current = true;
    bottomSheetRef.current?.close();
  }, [cancelPendingSheetClose]);

  //地図の移動などを見せてから閉じたい場合に使う。予約中に開く操作があれば取り消される
  const closeSheetLater = useCallback(
    (delay: number) => {
      cancelPendingSheetClose();
      sheetCloseTimerRef.current = setTimeout(() => {
        sheetCloseTimerRef.current = null;
        isClosingBySelfRef.current = true;
        bottomSheetRef.current?.close();
      }, delay);
    },
    [cancelPendingSheetClose]
  );

  const openSheet = useCallback(
    (index: number) => {
      cancelPendingSheetClose();
      //開く指示を出した時点でフラグを立てる。ライブラリが「すでにその位置」と判断して
      //onChangeを出さない場合でも、中身がローディング表示のまま残らないようにする
      setIsBottomSheetOpen(true);
      const sheet = bottomSheetRef.current;
      if (sheet === null) {
        //シートが作り直されている最中はrefが空になる。そのまま捨てると「タップしても
        //何も起きない」状態になるため、戻ってくるのを少し待って開き直す
        if (openSheetRetryRef.current !== null) clearTimeout(openSheetRetryRef.current);
        let remaining = 10;
        const retry = () => {
          openSheetRetryRef.current = null;
          //待っている間にシートが開かれていたら、その位置を尊重して何もしない
          //（勝手に元の位置へ戻してしまうため）
          if (lastSheetIndexRef.current >= 0) return;
          if (bottomSheetRef.current !== null) {
            bottomSheetRef.current.snapToIndex(index);
            return;
          }
          remaining -= 1;
          if (remaining > 0) openSheetRetryRef.current = setTimeout(retry, 100);
        };
        openSheetRetryRef.current = setTimeout(retry, 100);
        return;
      }
      sheet.snapToIndex(index);
      //ライブラリは「行き先が現在と同じ」と判断すると何もしないため、内部状態が実際の位置と
      //ずれていると開かないことがある。開けていなければ別の位置を指定してやり直す
      if (openSheetRetryRef.current !== null) clearTimeout(openSheetRetryRef.current);
      openSheetRetryRef.current = setTimeout(() => {
        openSheetRetryRef.current = null;
        if (lastSheetIndexRef.current < 0) bottomSheetRef.current?.expand();
      }, 150);
    },
    [cancelPendingSheetClose, setIsBottomSheetOpen]
  );

  //実際に位置が変わったことを記録する（pages/Home.tsxのonChangeから呼ばれる）
  const onSheetIndexChange = useCallback((index: number) => {
    lastSheetIndexRef.current = index;
    //開いたら「こちらから閉じた」状態は終わり。取りこぼした場合もここで解除される
    if (index >= 0) isClosingBySelfRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (sheetCloseTimerRef.current !== null) clearTimeout(sheetCloseTimerRef.current);
      if (openSheetRetryRef.current !== null) clearTimeout(openSheetRetryRef.current);
    };
  }, []);
  const isMapDragging = useRef(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartPosition = useRef<{ x: number; y: number } | null>(null);
  // タッチ開始時刻。直後に2本目の指が着いた場合はピンチ意図とみなしGrantで加えた点を取り消す
  const touchStartTimeRef = useRef(0);
  // このタッチに2本目の指が関与したか。指が動かないズーム系ジェスチャー（2本指タップ・その場ピンチ）は
  // Moveイベントが発火せず2本指検出を通らないため、タッチ開始時にも記録してリリース時に地図操作として扱う
  const multiTouchSeenRef = useRef(false);
  //2本指検出時の後始末（描きかけの取り消し・中断等）を1ジェスチャー1回に限定するフラグ。
  //毎フレーム再実行すると冪等でない処理（cancelHandwritingStroke等）が二重適用される
  const multiTouchHandledRef = useRef(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  //ズームボタン後に描きかけを確実に再表示するためのフォールバックタイマー
  const zoomRestoreTimerRef = useRef<NodeJS.Timeout | null>(null);
  //地図移動ツールに切り替える前のツール。もう一度押したときの戻り先
  const toolBeforeMoveRef = useRef<DrawToolType | undefined>(undefined);
  // 長押しポップアップが表示されたタッチでは、リリース時のフィーチャー選択を抑止する
  const longPressFiredRef = useRef(false);
  // iOS Google MapsでonPanDragが発火しないため、PanResponder側でGPS追従解除を行う用のref
  const gpsStateRef = useRef<LocationStateType>('off');
  const toggleGPSRef = useRef<((state: LocationStateType) => Promise<void>) | null>(null);

  const dispatch = useDispatch<AppDispatch>();
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
    selectRecord,
    unselectRecord,
    checkRecordEditable,
    activePointLayer,
    activeLineLayer,
    activePolygonLayer,
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
    redoDraw,
    isUndoable: isDrawUndoable,
    isRedoable: isDrawRedoable,
    finishEditObject,
    selectSingleFeature,
    showDrawLine,
    hideDrawLine,
    resetDrawTools,
    toggleTerrain,
    setVisibleInfoPicker,
    setCurrentInfoTool,
    isAreaSelected,
    featuresTransformAngle,
    handleGrantSelect,
    handleMoveSelect,
    handleReleaseSelect,
    handleGrantPlot,
    handleMovePlot,
    handleReleasePlotPoint,
    handleReleasePlotLinePolygon,
    handwritingSubTool,
    setHandwritingSubTool,
    symbolDetailField,
    selectSymbolDetail,
    handleGrantHandwriting,
    convertSelectionToHandwriting,
    switchSelectionToSplit,
    convertSessionToPlot,
    applySelectionStylePreview,
    handleMoveHandwriting,
    handleReleaseHandwriting,
    commitHandwritingStroke,
    cancelHandwritingStroke,
    cancelPlotGrant,
    handleGrantSplitLine,
    getPXY,
    savePoint,
    selectObjectByFeature,
    checkSplitLine,
    setInfoToolActive,
  } = useDrawTool(mapViewRef.current);

  const {
    activeMemoLayer,
    visibleMapMemoColor,
    visibleMapMemoSettings,
    mapMemoSettingsTab,
    currentMapMemoTool,
    currentPenWidth,
    penColor,
    penWidth,
    mapMemoEditingLine,
    mapMemoEditingLineLatLon,
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
    flushPausedPenStroke,
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
      //closeSheet()で閉じた結果として届いたonCloseは、確認も後片付けも済んでいるので何もしない
      if (isClosingBySelfRef.current) {
        isClosingBySelfRef.current = false;
        return;
      }
      const effectiveRouteName = currentRouteName ?? routeName;
      if (effectiveRouteName === 'DataEdit') {
        if (isEditingRecord) {
          const ret = await ConfirmAsync(t('DataEdit.confirm.gotoBack'));
          if (ret) {
            setIsEditingRecord(false);
            unselectRecord();
            //ToDo 写真の削除処理はどうする？
          } else {
            openSheet(2);
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
            openSheet(2);
            return;
          }
        }
      } else if (effectiveRouteName === 'MapEdit') {
        if (isEditingMap) {
          const ret = await ConfirmAsync(t('MapEdit.confirm.gotoBack'));
          if (ret) {
            dispatch(editSettingsAction({ isEditingMap: false }));
          } else {
            openSheet(2);
            return;
          }
        }
      }
      closeSheet();
    },
    [closeSheet, openSheet, 
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
      closeSheet();
    }
  }, [closeSheet, downloadMode]);

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
      // 地図が動いたら描きかけの画面座標は必ず作り直す。表示中かどうかで条件分けすると、
      // 先にimmediateで表示した場合（2本指タップのズーム等）に再計算フラグが消費済みになり、
      // 移動前の画面座標のまま取り残されて別の場所に描かれてしまう
      showDrawLine();
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

  //編集レイヤ選択ダイアログの「新規レイヤを作成」からLayerEditへ遷移する
  const onRequestCreateLayer = useCallback(
    (featureType: 'POINT' | 'LINE' | 'POLYGON') => {
      openSheet(2);
      navigateToSplit('LayerEdit', {
        previous: 'Layers',
        targetLayer: { ...TEMPLATE_LAYER, id: ulid(), type: featureType },
        isEdited: true,
      });
    },
    [navigateToSplit, openSheet]
  );

  //編集レイヤの確認・切替（描画ツール選択時のチェックとツールバーのチップから使う）
  const { layerSelectProps, ensureEditableLayer, openLayerSwitcher } = useEditableLayerSelection({
    onRequestCreateLayer,
  });

  /**
   * 作図ツール選択時の編集可否チェック。
   * 編集レイヤがなければ選択ダイアログで選ばせてactive化し、非表示なら表示確認をしてそのまま続行できる
   */
  const checkEditableLayerForDraw = useCallback(
    async (type: 'POINT' | 'LINE' | 'POLYGON') => ensureEditableLayer(type),
    [ensureEditableLayer]
  );

  /**
   * マップメモの編集可否チェック（設定モーダルを開く前やツール選択時に使う）。
   * マップメモはアクティブなラインレイヤに保存されるため、LINEレイヤの選択フローに統合
   */
  const checkEditableMapMemo = useCallback(async () => ensureEditableLayer('MEMO'), [ensureEditableLayer]);

  //編集レイヤ（ツールパレットの組み立てに使う）
  const editingLayer = useMemo(() => {
    switch (featureButton) {
      case 'LINE':
        return activeLineLayer;
      case 'POLYGON':
        return activePolygonLayer;
      default:
        return undefined;
    }
  }, [activeLineLayer, activePolygonLayer, featureButton]);

  //区分を選ぶパレット（植生図）で「次に描く区分」を決める。色分けに使うフィールドの既定値を
  //書き換えるので、手書きでもプロットでも新しく作るレコードにその区分が入る
  //選択肢を新しく足す。色分けに使うフィールドなら色も一緒に入れて、そのまま次に描く値にする
  const addFieldValue = useCallback(
    (fieldName: string, value: string, color: string, code: string) => {
      if (editingLayer === undefined) return;
      const field = editingLayer.field.find((f) => f.name === fieldName);
      if (field === undefined) return;
      if ((field.list ?? []).some((item) => item.value === value)) return;
      dispatch(
        updateLayerAction({
          ...editingLayer,
          colorStyle:
            fieldName === editingLayer.colorStyle.fieldName
              ? { ...editingLayer.colorStyle, colorList: [...editingLayer.colorStyle.colorList, { value, color }] }
              : editingLayer.colorStyle,
          field: editingLayer.field.map((f) =>
            f.name === fieldName
              ? {
                  ...f,
                  //customFieldValueは選択肢のコード（「<属性名>コード」へ一緒に入る）
                  list: [...(f.list ?? []), { value, isOther: false, customFieldValue: code }],
                  defaultValue: value,
                }
              : f
          ),
        })
      );
    },
    [dispatch, editingLayer]
  );

  //区分の名前・色を変える。名前を変えた場合は、その区分で保存済みのレコードの値も置き換える
  //（置き換えないと色分けから外れて透明になり、集計もばらける）
  const updateFieldValue = useCallback(
    (fieldName: string, oldValue: string, newValue: string, color: string, code: string) => {
      if (editingLayer === undefined || newValue === '') return;
      dispatch(
        updateLayerAction({
          ...editingLayer,
          colorStyle:
            fieldName === editingLayer.colorStyle.fieldName
              ? {
                  ...editingLayer.colorStyle,
                  colorList: editingLayer.colorStyle.colorList.map((c) =>
                    c.value === oldValue ? { value: newValue, color } : c
                  ),
                }
              : editingLayer.colorStyle,
          field: editingLayer.field.map((f) =>
            f.name === fieldName
              ? {
                  ...f,
                  list: (f.list ?? []).map((item) =>
                    item.value === oldValue ? { ...item, value: newValue, customFieldValue: code } : item
                  ),
                  defaultValue: f.defaultValue === oldValue ? newValue : f.defaultValue,
                }
              : f
          ),
        })
      );
      if (newValue === oldValue) return;
      fullDataSet
        .filter((d) => d.layerId === editingLayer.id)
        .forEach((d) => {
          const targets = d.data.filter((record) => record.field[fieldName] === oldValue);
          if (targets.length === 0) return;
          dispatch(
            updateRecordsAction({
              layerId: d.layerId,
              userId: d.userId,
              data: targets.map((record) => ({ ...record, field: { ...record.field, [fieldName]: newValue } })),
            })
          );
        });
    },
    [dispatch, editingLayer, fullDataSet]
  );

  //区分を選択肢から消す。保存済みのレコードの値はそのまま残す（消すとデータが失われるため）
  const deleteFieldValue = useCallback(
    (fieldName: string, value: string) => {
      if (editingLayer === undefined) return;
      dispatch(
        updateLayerAction({
          ...editingLayer,
          colorStyle:
            fieldName === editingLayer.colorStyle.fieldName
              ? {
                  ...editingLayer.colorStyle,
                  colorList: editingLayer.colorStyle.colorList.filter((c) => c.value !== value),
                }
              : editingLayer.colorStyle,
          field: editingLayer.field.map((f) =>
            f.name === fieldName
              ? {
                  ...f,
                  list: (f.list ?? []).filter((item) => item.value !== value),
                  defaultValue: f.defaultValue === value ? undefined : f.defaultValue,
                }
              : f
          ),
        })
      );
    },
    [dispatch, editingLayer]
  );

  //植生図で区分未選択のままツールを押したとき、先に選択モーダルで選んでもらうための保留ツール
  const [pendingPaletteDrawTool, setPendingPaletteDrawTool] = useState<DrawToolType | undefined>(undefined);

  //色分けに使う区分が未選択か。選択直後はclosureのレイヤが古いことがあるので最新の状態で判定する
  const isPaletteColorValueEmpty = useCallback(
    (layerId: string): boolean =>
      dispatch((_thunkDispatch: AppDispatch, getState: () => RootState) => {
        const layer = getState().layers.find((l) => l.id === layerId);
        if (layer === undefined || layer.colorStyle.colorType !== 'CATEGORIZED') return false;
        const field = layer.field.find((f) => f.name === layer.colorStyle.fieldName);
        if (field === undefined) return false;
        return typeof field.defaultValue !== 'string' || field.defaultValue === '';
      }),
    [dispatch]
  );

  //属性を未選択へ戻す（確定後に次の個体を選び直すため）
  const clearPaletteFieldValues = useCallback(
    (layerId: string) => {
      dispatch((thunkDispatch: AppDispatch, getState: () => RootState) => {
        const layer = getState().layers.find((l) => l.id === layerId);
        if (layer === undefined) return;
        //選択肢と一緒に入るコードも戻す（区分なしなのに前のコードが残ったまま描かれるのを防ぐ）
        const codeFieldIds = layer.field
          .map((f) => resolveCodeField(layer, f)?.id)
          .filter((id): id is string => id !== undefined);
        const shouldClear = (f: LayerType['field'][0]) => f.list !== undefined || codeFieldIds.includes(f.id);
        if (!layer.field.some((f) => shouldClear(f) && (f.defaultValue ?? '') !== '')) return;
        thunkDispatch(
          updateLayerAction({
            ...layer,
            field: layer.field.map((f) => (shouldClear(f) ? { ...f, defaultValue: '' } : f)),
          })
        );
      });
    },
    [dispatch]
  );

  //植生図の区分は、タブ（ポイント/ライン/ポリゴン/メモ）や編集レイヤを切り替えたら未選択へ戻す。
  //ツールボタン（追加⇔手書き等）の持ち替えではリセットしない（同じ区分を続けて描く）
  const prevEditingLayerRef = useRef<{ id: string; toolPalette?: LayerType['toolPalette'] } | undefined>(undefined);
  useEffect(() => {
    const prev = prevEditingLayerRef.current;
    if (prev !== undefined && prev.id !== editingLayer?.id && prev.toolPalette === 'VEGETATION') {
      clearPaletteFieldValues(prev.id);
    }
    prevEditingLayerRef.current =
      editingLayer === undefined ? undefined : { id: editingLayer.id, toolPalette: editingLayer.toolPalette };
  }, [editingLayer, clearPaletteFieldValues]);

  const selectFieldValues = useCallback(
    (values: { [fieldName: string]: string }) => {
      const layerId = editingLayer?.id;
      if (layerId === undefined) return;
      //選択肢の追加直後など、closureのレイヤが古いことがあるので最新のレイヤへ反映する
      dispatch((thunkDispatch: AppDispatch, getState: () => RootState) => {
        const layer = getState().layers.find((l) => l.id === layerId);
        if (layer === undefined) return;
        //レイヤ設定で「コードの入れ先」を決めてあるフィールドは、選択肢のコードを一緒に入れる。
        //植生図で区分を選ぶだけで区分コードが入る
        const codeValues: { [fieldId: string]: string | number } = {};
        Object.entries(values).forEach(([name, value]) => {
          const field = layer.field.find((f) => f.name === name);
          if (field === undefined) return;
          const codeField = resolveCodeField(layer, field);
          if (codeField === undefined) return;
          const item = field.list?.find((i) => i.value === value);
          codeValues[codeField.id] = toCodeFieldValue(item?.customFieldValue, codeField.format);
        });
        thunkDispatch(
          updateLayerAction({
            ...layer,
            field: layer.field.map((f) => {
              if (values[f.name] !== undefined) return { ...f, defaultValue: values[f.name] };
              if (codeValues[f.id] !== undefined) return { ...f, defaultValue: codeValues[f.id] };
              return f;
            }),
          })
        );
      });
    },
    [dispatch, editingLayer?.id]
  );

  //ツールバーのチップに表示する編集レイヤ名
  const editingLayerName = useMemo(() => {
    switch (featureButton) {
      case 'POINT':
        return activePointLayer?.name;
      case 'LINE':
        return activeLineLayer?.name;
      //メモは専用レイヤに固定なので、切り替え先のない保存先として名前だけ出す
      case 'MEMO':
        return activeMemoLayer?.name;
      case 'POLYGON':
        return activePolygonLayer?.name;
      default:
        return undefined;
    }
  }, [activeLineLayer?.name, activeMemoLayer?.name, activePointLayer?.name, activePolygonLayer?.name, featureButton]);

  //チップタップで編集レイヤを切り替える。作図中は破棄確認をしてから
  const pressEditingLayerButton = useCallback(async () => {
    if (featureButton === 'NONE') return;
    if (isEditingDraw || isEditingObject) {
      const ret = await ConfirmAsync(t('Home.confirm.discard'));
      if (!ret) return;
      resetDrawTools();
      setDrawTool('NONE');
    }
    await openLayerSwitcher(featureButton);
  }, [featureButton, isEditingDraw, isEditingObject, openLayerSwitcher, resetDrawTools, setDrawTool]);

  const selectMapMemoTool = useCallback(
    async (value: MapMemoToolType | undefined) => {
      setInfoToolActive(false);
      //中断中/描きかけのペンストロークが見えないまま残らないよう、切替前に確定して保存する
      flushPausedPenStroke();
      if (value === undefined) {
        setMapMemoTool('NONE');
      } else {
        //どのツールもマップメモの内容を書き換えるため、ブラシ・スタンプ・消しゴム含め全てで編集可否を確認する
        //（プロジェクト実行中のロック等も選択時に検出する）
        if (!(await checkEditableMapMemo())) return;
        //編集選択の選択状態が残っていれば破棄する
        resetDrawTools();
        setDrawTool('NONE');
        setMapMemoTool(value);
      }
    },
    [
      checkEditableMapMemo,
      flushPausedPenStroke,
      resetDrawTools,
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
      flushPausedPenStroke();
      resetDrawTools();
      setDrawTool('NONE');
      setMapMemoTool('NONE');
    },
    [
      flushPausedPenStroke,
      resetDrawTools,
      setCurrentInfoTool,
      setDrawTool,
      setInfoToolActive,
      setMapMemoTool,
      toggleHeadingUp,
      toggleTerrain,
    ]
  );

  /************** select button ************/

  const closeMapMemoSettings = useCallback(() => {
    setVisibleMapMemoSettings(false);
  }, [setVisibleMapMemoSettings]);

  /**
   * 手書きペン用に設定モーダルを開く。編集可否はツール選択時に確認済みのためそのまま開く
   */
  const openHandwritingSettingsTab = useCallback(
    (tab: MapMemoToolGroupType) => {
      setMapMemoSettingsTab(tab);
      setVisibleMapMemoSettings(true);
    },
    [setMapMemoSettingsTab, setVisibleMapMemoSettings]
  );

  //アクティブレイヤの色分けが「個別（_strokeColor参照）」か。
  //trueなら色・太さボタンを常時表示し、通常の作図（プロット・フリーハンド）にも現在の色・太さを反映する
  const isIndividualStyleLayer = useMemo(() => {
    const layer =
      featureButton === 'LINE' ? activeLineLayer : featureButton === 'POLYGON' ? activePolygonLayer : undefined;
    return (
      layer !== undefined &&
      layer.colorStyle.colorType === 'INDIVIDUAL' &&
      layer.colorStyle.fieldName === '__CUSTOM' &&
      layer.colorStyle.customFieldValue === '_strokeColor'
    );
  }, [activeLineLayer, activePolygonLayer, featureButton]);

  //個別色レイヤへの通常作図で新規レコードに反映する現在の色・太さ（saveLine/savePolygonに渡す）
  const currentDrawStyle = useMemo(
    () => ({
      strokeColor: penColor,
      strokeWidth: penWidth,
      //LINEでは矢印設定も通常作図（プロット）の新規レコードへ反映する
      strokeStyle: featureButton === 'LINE' ? arrowStyle : 'NONE',
      stamp: '',
      zoom: mapRegion.zoom,
    }),
    [penColor, penWidth, arrowStyle, featureButton, mapRegion.zoom]
  );

  //手書きペンの描画スタイル。レイヤの色分けが個別なら現在のペン設定、
  //そうでなければレイヤのスタイルに従う（単一色はその色、それ以外は無彩色でプレビューし、保存時に色・太さは書かない）
  const handwritingPenStyleParam = useMemo(() => {
    if (isIndividualStyleLayer) {
      return { strokeColor: penColor, strokeWidth: penWidth, arrowStyle, isStraightStyle, snapWithLine };
    }
    const layer = featureButton === 'POLYGON' ? activePolygonLayer : activeLineLayer;
    const strokeColor =
      layer !== undefined && layer.colorStyle.colorType === 'SINGLE'
        ? hex2rgba(layer.colorStyle.color) ?? 'rgba(0,0,0,0.7)'
        : 'rgba(0,0,0,0.7)';
    return {
      strokeColor,
      strokeWidth: layer?.colorStyle.lineWidth ?? 1.5,
      arrowStyle,
      isStraightStyle,
      snapWithLine,
    };
  }, [
    isIndividualStyleLayer,
    penColor,
    penWidth,
    arrowStyle,
    isStraightStyle,
    snapWithLine,
    featureButton,
    activeLineLayer,
    activePolygonLayer,
  ]);

  //編集選択（タップ選択・なげなわ）中に色・太さ・矢印を変更したか（項目別）。
  //操作した項目だけを確定時に選択オブジェクトへ反映する（プロパティパネル方式）。
  //形だけの変形や、太さだけ変えたときに色まで塗り替わらないようにするためのフラグ
  const selectionStyleChanged = useRef({ color: false, width: false, arrow: false });
  const prevSelectionStyle = useRef({ penColor, penWidth, arrowStyle });
  useEffect(() => {
    if (isSelectedDraw || isAreaSelected) {
      if (prevSelectionStyle.current.penColor !== penColor) selectionStyleChanged.current.color = true;
      if (prevSelectionStyle.current.penWidth !== penWidth) selectionStyleChanged.current.width = true;
      if (prevSelectionStyle.current.arrowStyle !== arrowStyle) selectionStyleChanged.current.arrow = true;
    } else {
      selectionStyleChanged.current = { color: false, width: false, arrow: false };
    }
    prevSelectionStyle.current = { penColor, penWidth, arrowStyle };
  }, [penColor, penWidth, arrowStyle, isSelectedDraw, isAreaSelected]);

  //スタイル設定モーダルからの変更を直接マークするラッパー。
  //選択オブジェクトの値からグローバル設定と同じ値へ変更した場合、stateが変わらず
  //上のeffectの差分検知では拾えないため（例: 連続して複数のオブジェクトに同じ矢印を設定）。
  //マークと同時に画面上の選択オブジェクトへ即時反映する（キャンセルで元に戻る）
  //新規手書きの描画済みストロークにもプレビューを効かせる（編集選択に限らずセッション中は反映）
  const canPreviewSelectionStyle = isSelectedDraw || isEditingDraw || isEditingObject;
  const setPenWidthMarked = useCallback(
    (width: PenWidthType) => {
      if (isSelectedDraw) selectionStyleChanged.current.width = true;
      if (canPreviewSelectionStyle) {
        //useMapMemoのpenWidth導出と同じ対応（細=2/中=5/太=10）
        applySelectionStylePreview({ strokeWidth: width === 'PEN_THIN' ? 2 : width === 'PEN_MEDIUM' ? 5 : 10 });
      }
      setPenWidth(width);
    },
    [applySelectionStylePreview, canPreviewSelectionStyle, isSelectedDraw, setPenWidth]
  );
  const setArrowStyleMarked = useCallback(
    (style: ArrowStyleType) => {
      if (isSelectedDraw) selectionStyleChanged.current.arrow = true;
      if (canPreviewSelectionStyle) applySelectionStylePreview({ strokeStyle: style });
      setArrowStyle(style);
    },
    [applySelectionStylePreview, canPreviewSelectionStyle, isSelectedDraw, setArrowStyle]
  );
  const selectPenColorMarked = useCallback(
    (hue: number, sat: number, val: number, alpha: number) => {
      if (isSelectedDraw) selectionStyleChanged.current.color = true;
      if (canPreviewSelectionStyle) applySelectionStylePreview({ strokeColor: hsv2rgbaString(hue, sat, val, alpha) });
      selectPenColor(hue, sat, val, alpha);
    },
    [applySelectionStylePreview, canPreviewSelectionStyle, isSelectedDraw, selectPenColor]
  );

  //単一オブジェクト選択中はそのオブジェクトの色・太さを設定UIの初期値にする（プロパティパネル方式）。
  //選択しただけではペンのグローバル設定は変えない（設定UIを開いたときだけ初期値として現れる）
  const selectedSingleObjectStyle = (() => {
    if (!isSelectedDraw) return undefined;
    const selected = drawLine.current.filter((line) => line.record !== undefined);
    if (selected.length !== 1) return undefined;
    const field = selected[0].record!.field;
    const color = typeof field._strokeColor === 'string' && field._strokeColor !== '' ? field._strokeColor : undefined;
    const width = typeof field._strokeWidth === 'number' ? field._strokeWidth : undefined;
    const widthType: PenWidthType | undefined =
      width === undefined
        ? undefined
        : width <= 3
        ? 'PEN_THIN'
        : width <= 7
        ? 'PEN_MEDIUM'
        : width <= 14
        ? 'PEN_THICK'
        : 'PEN_EXTRA_THICK';
    //_strokeStyleはブラシ種別も入るため、矢印値のときだけ初期表示に使う
    const objArrowStyle: ArrowStyleType | undefined =
      field._strokeStyle === 'NONE' || field._strokeStyle === 'ARROW_END' || field._strokeStyle === 'ARROW_BOTH'
        ? field._strokeStyle
        : undefined;
    return { color, widthType, arrowStyle: objArrowStyle };
  })();
  const colorPickerColor = selectedSingleObjectStyle?.color ?? penColor;

  const selectFeatureButton = useCallback(
    (value: FeatureButtonType) => {
      //中断中/描きかけのペンストロークが見えないまま残らないよう、タブ切替前に確定して保存する
      flushPausedPenStroke();
      //以降は作図の描きかけを破棄する。画面のタブボタンから押されたときは
      //pressFeatureButton側で確認を取ってからここへ来る
      setDrawTool('NONE');
      setMapMemoTool('NONE');
      toggleTerrain(value === 'NONE');
      setFeatureButton(value);
      resetDrawTools();
      clearMapMemoHistory();
      if (Platform.OS !== 'web') toggleHeadingUp(false);
    },
    [
      flushPausedPenStroke,
      setDrawTool,
      setMapMemoTool,
      toggleTerrain,
      setFeatureButton,
      resetDrawTools,
      clearMapMemoHistory,
      toggleHeadingUp,
    ]
  );

  //画面のタブボタン用。作図の描きかけがあれば破棄してよいか確認する
  //（位置編集の終了や軌跡記録の開始など、プログラムから切り替える場合は確認しない）
  //破棄確認は「画面に残っている描きかけ（座標を持つオブジェクト）」があるかで判断する。
  //フラグ（isEditingDraw）は点を置いた時点で立ったまま元に戻しても下がらないため、
  //何も無くなった後にも「変更を破棄しますか？」が出てしまう
  const hasUnsavedDrawing = useCallback(() => drawLine.current.some((line) => line.xy.length > 0), [drawLine]);

  const pressFeatureButton = useCallback(
    async (value: FeatureButtonType) => {
      if (hasUnsavedDrawing()) {
        const ret = await ConfirmAsync(t('Home.confirm.discard'));
        if (!ret) return;
      }
      selectFeatureButton(value);
    },
    [hasUnsavedDrawing, selectFeatureButton]
  );

  const finishEditPosition = useCallback(
    async (skipConfirm = false) => {
      // 座標がある場合は確認メッセージを表示（skipConfirmがtrueの場合はスキップ）
      if (!skipConfirm && route.params?.withCoord) {
        const ret = await ConfirmAsync(t('Home.confirm.discardEditPosition'));
        if (!ret) return;
      }

      openSheet(2);
      setTimeout(() => {
        //onPressMapViewでInfoToolがアクティブになるのを防ぐためSetTimeoutで遅延させる
        selectFeatureButton('NONE');
      }, 500);

      navigation.setParams({ mode: undefined });
    },
    [openSheet, navigation, route.params?.withCoord, selectFeatureButton]
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
      openSheet(2);

      navigateToSplit?.('DataEdit', {
        previous: 'Data',
        targetData: record,
        targetLayer: layer,
      });
    }
  }, [openSheet, addCurrentPoint, currentLocation, isLocationStale, gpsState, navigateToSplit, trackingState]);

  const handleAddLocationPoint = useCallback(async () => {
    await addLocationPoint();
  }, [addLocationPoint]);

  //編集のキャンセル。ドローツールをオフにする操作と同じ後始末を行う。
  //現在のツールに依存しないので、地図移動ツールへ持ち替えている間のキャンセルでも使える
  const cancelDraw = useCallback(async () => {
    //描きかけが画面に残っているときだけ確認する（フラグではなく中身で判断する）
    if (hasUnsavedDrawing()) {
      const ret = await ConfirmAsync(t('Home.confirm.discard'));
      if (!ret) return;
    }
    resetDrawTools();
    setDrawTool('NONE');
    toolBeforeMoveRef.current = undefined;
    //飛翔図は1本＝1個体なので、やめたときも属性を未選択へ戻して選び直してもらう
    if (editingLayer?.toolPalette === 'HISYOU') clearPaletteFieldValues(editingLayer.id);
    if (route.params?.mode === 'editPosition') finishEditPosition(true);
  }, [
    clearPaletteFieldValues,
    editingLayer?.id,
    editingLayer?.toolPalette,
    finishEditPosition,
    hasUnsavedDrawing,
    resetDrawTools,
    route.params?.mode,
    setDrawTool,
  ]);

  const selectDrawTool = useCallback(
    async (value: DrawToolType) => {
      setInfoToolActive(false);
      if (isPointTool(value) || isLineTool(value) || isPolygonTool(value)) {
        if (currentDrawTool === value) {
          //ドローツールをオフ（編集のキャンセルもここを通る）
          await cancelDraw();
        } else {
          //ドローツールをオン

          if (isPointTool(value)) {
            if (!(await checkEditableLayerForDraw('POINT'))) return;

            //現在地ポイントは確認して即レコードを追加する操作なので、
            //ツールとして選択状態にはしない（setDrawToolを呼ばずに終了する）
            if (value === 'ADD_LOCATION_POINT') {
              await handleAddLocationPoint();
              return;
            }
            //await runTutrial(`POINTTOOL_${value}`);
          } else if (isLineTool(value)) {
            if (!(await checkEditableLayerForDraw('LINE'))) return;
            //await runTutrial(`LINETOOL_${value}`);
          } else if (isPolygonTool(value)) {
            if (!(await checkEditableLayerForDraw('POLYGON'))) return;
            //植生図は区分未選択のまま描き始めないよう、先に選択モーダルを開く（選んだらこのツールを有効にする）。
            //編集選択からの持ち替えは既存オブジェクトの続きなので開かない
            if (
              editingLayer?.toolPalette === 'VEGETATION' &&
              !isSelectedDraw &&
              !isEditingDraw &&
              !isEditingObject &&
              isPaletteColorValueEmpty(editingLayer.id)
            ) {
              setPendingPaletteDrawTool(value);
              return;
            }
            //await runTutrial(`POLYGONTOOL_${value}`);
          }

          //編集選択で選択済み・追加（プロット）で作成中のオブジェクトがあれば、手書きセッションの
          //ストロークに変換して手書きと同じ編集挙動（頂点マーカーなし・なぞって修正）にする
          if (isHandwritingTool(value) && (isSelectedDraw || isEditingDraw || isEditingObject)) {
            convertSelectionToHandwriting(handwritingPenStyleParam);
          }
          //逆に手書きセッションのストロークがあれば、プロット編集（ノード編集）へ変換する
          if ((value === 'PLOT_LINE' || value === 'PLOT_POLYGON') && (isSelectedDraw || isEditingDraw || isEditingObject)) {
            convertSessionToPlot(featureButton);
          }

          //LINEタブの消しゴム（メモツール）が残っていれば解除する（相互排他）。
          //描きかけのメモがあれば捨てずに確定してから解除する
          flushPausedPenStroke();
          setMapMemoTool('NONE');
          setDrawTool(value);
        }
      } else if (value === 'SELECT') {
        if (currentDrawTool === value) {
          resetDrawTools();
          setDrawTool('NONE');
        } else {
          if (featureButton === 'LINE') {
            if (!(await checkEditableLayerForDraw('LINE'))) return;
          } else if (featureButton === 'POLYGON') {
            if (!(await checkEditableLayerForDraw('POLYGON'))) return;
          } else if (featureButton === 'MEMO') {
            //マップメモの編集選択。描画ツールは解除する
            if (!(await checkEditableMapMemo())) return;
          }
          //消しゴム等のメモツールが残っていれば解除する（相互排他）
          flushPausedPenStroke();
          setMapMemoTool('NONE');
          setDrawTool(value);
          //await runTutrial('SELECTIONTOOL');
        }
      } else {
        if (value === 'MOVE') {
          if (currentDrawTool === value) {
            //もう一度押したら地図移動に切り替える前のツールへ戻す。
            //編集中に「押した同じボタンで戻れない」と、元のツールを探して押す必要があり気づきにくい
            setDrawTool(toolBeforeMoveRef.current ?? 'NONE');
            toolBeforeMoveRef.current = undefined;
          } else {
            //戻り先を覚えておく（作図・編集用のツールのときだけ。NONE等は覚えない）
            toolBeforeMoveRef.current =
              isPlotTool(currentDrawTool) || isHandwritingTool(currentDrawTool) || currentDrawTool === 'SELECT'
                ? currentDrawTool
                : undefined;
            setDrawTool(value);
          }
        }
      }
    },
    [
      cancelDraw,
      checkEditableLayerForDraw,
      checkEditableMapMemo,
      flushPausedPenStroke,
      isPaletteColorValueEmpty,
      editingLayer?.id,
      editingLayer?.toolPalette,
      convertSelectionToHandwriting,
      convertSessionToPlot,
      currentDrawTool,
      featureButton,
      handleAddLocationPoint,
      handwritingPenStyleParam,
      isEditingDraw,
      isEditingObject,
      isSelectedDraw,
      resetDrawTools,
      setDrawTool,
      setInfoToolActive,
      setMapMemoTool,
    ]
  );

  /**************** press ******************/

  const pressUndoDraw = useCallback(async () => {
    const finished = undoDraw();
    if (route.params?.mode === 'editPosition') {
      if (finished) finishEditPosition(true);
    }
  }, [finishEditPosition, route.params?.mode, undoDraw]);

  const pressRedoDraw = useCallback(() => {
    redoDraw();
  }, [redoDraw]);

  //undo/redoの統一ハンドラ。メモモードの通常時はメモ書き込み履歴、
  //それ以外（作図モード、メモの編集選択操作中）は作図編集のundoを使う
  const usesDrawHistory =
    (featureButton !== 'MEMO' && !isEraserTool(currentMapMemoTool)) ||
    currentDrawTool === 'SELECT' ||
    isSelectedDraw;
  const isUndoAvailable = usesDrawHistory ? isDrawUndoable : isUndoable;
  const isRedoAvailable = usesDrawHistory ? isDrawRedoable : isRedoable;
  const pressUndo = useCallback(async () => {
    if (usesDrawHistory) {
      await pressUndoDraw();
    } else {
      pressUndoMapMemo();
    }
  }, [pressUndoDraw, pressUndoMapMemo, usesDrawHistory]);
  const pressRedo = useCallback(() => {
    if (usesDrawHistory) {
      pressRedoDraw();
    } else {
      pressRedoMapMemo();
    }
  }, [pressRedoDraw, pressRedoMapMemo, usesDrawHistory]);

  const pressSaveDraw = useCallback(async () => {
    let result;
    //プロパティパネル方式: 選択中に操作した項目（色・太さ）だけを選択オブジェクトへ反映する。
    //操作していなければ形だけの変形（スタイル保持）。設定UIを開くと選択オブジェクトの値が初期表示される
    const applyStyleToSelected = isSelectedDraw ? { ...selectionStyleChanged.current } : undefined;
    if (featureButton === 'POINT') {
      result = savePoint();
    } else if (featureButton === 'LINE' || featureButton === 'MEMO') {
      //マップメモの編集選択もラインレコードとして保存する
      result = saveLine(currentDrawStyle, applyStyleToSelected);
    } else if (featureButton === 'POLYGON') {
      result = savePolygon(currentDrawStyle, applyStyleToSelected);
    }
    selectionStyleChanged.current = { color: false, width: false, arrow: false };
    if (result === undefined) return false;
    const { isOK, message, layer, recordSet } = result;
    if (!isOK) {
      Alert.alert('', message);
      return false;
    }
    // console.log('🔍 pressSaveDraw - layer:', layer?.name, 'type:', layer?.type, 'id:', layer?.id);
    //手書きも確定でツールをオフにする（新規バッチ・編集選択とも）。DataEditオープンは下の共通処理
    setDrawTool('NONE');
    //飛翔図は1本＝1個体なので、確定したら種名・性別・齢を未選択へ戻して選び直してもらう
    if (layer?.toolPalette === 'HISYOU') clearPaletteFieldValues(layer.id);
    if (route.params?.mode === 'editPosition') {
      navigation.setParams({ mode: undefined });
    }
    // 編集選択の場合はボトムシートを開かない。
    // 飛翔図・植生図は続けて何本・何面も描くので、確定のたびにデータ編集が開くと作業が途切れる
    if (
      !isSelectedDraw &&
      layer !== undefined &&
      layer.toolPalette === undefined &&
      recordSet !== undefined &&
      recordSet.length > 0
    ) {
      openSheet(2);
      navigateToSplit?.('DataEdit', {
        previous: 'Data',
        targetData: recordSet[0],
        targetLayer: layer,
      });
    }
    return true;
  }, [
    clearPaletteFieldValues,
    currentDrawStyle,
    openSheet,
    featureButton,
    isSelectedDraw,
    navigation,
    navigateToSplit,
    route.params?.mode,
    savePoint,
    saveLine,
    savePolygon,
    setDrawTool,
  ]);

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
      //描きかけがあるときはタブを閉じない。閉じると描きかけが黙って破棄されるうえ、
      //ツール状態だけ残って操作不能にもなる。軌跡の記録と作図は同時にできるので、
      //そのまま描き続けて確定してもらう
      if (!hasUnsavedDrawing()) selectFeatureButton('NONE');
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
          openSheet(isLandscape ? 2 : 1);
          navigateToSplit('TrackSummary', {
            layerId: result.layer.id,
            recordId: result.record.id,
            userId: result.record.userId,
            previous: 'Home',
          });
        }
      }
    }
  }, [openSheet, 
    checkUnsavedTrackLog,
    confirmLocationPermission,
    isLandscape,
    navigateToSplit,
    saveTrackLog,
    hasUnsavedDrawing,
    selectFeatureButton,
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

  //ズーム後の描きかけ再表示はregion変化イベントの再計算に任せるが、上限・下限でクランプされた場合や
  //refが無効な場合はイベントが来ず非表示のまま固着するため、フォールバックで必ず再表示する
  //（既に再表示済みならno-op。位置編集中もズームボタンは押せるため、ここが漏れると
  //「ポイントが見えないのに確定ボタンだけ出ている」状態になる）
  const scheduleDrawLineRestore = useCallback(() => {
    if (zoomRestoreTimerRef.current) clearTimeout(zoomRestoreTimerRef.current);
    zoomRestoreTimerRef.current = setTimeout(() => {
      zoomRestoreTimerRef.current = null;
      showDrawLine({ immediate: true });
    }, 400);
  }, [showDrawLine]);

  const pressZoomIn = useCallback(() => {
    hideDrawLine();
    zoomIn();
    scheduleDrawLineRestore();
  }, [hideDrawLine, scheduleDrawLineRestore, zoomIn]);

  const pressZoomOut = useCallback(() => {
    hideDrawLine();
    zoomOut();
    scheduleDrawLineRestore();
  }, [hideDrawLine, scheduleDrawLineRestore, zoomOut]);

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
    openSheet(2);
  }, [openSheet, isEditingRecord, navigation, navigateToSplit, bottomSheetCurrentScreen.name]);

  const gotoMaps = useCallback(async () => {
    if (isEditingRecord) {
      AlertAsync(t('Home.alert.discardChanges'));
      return;
    }
    navigation.setParams({ tileMap: undefined, mode: undefined });
    // 先にナビゲーションを完了させてからBottomSheetを開く（ちらつき防止）
    navigateToSplit?.('Maps');
    openSheet(2);
  }, [openSheet, isEditingRecord, navigation, navigateToSplit]);

  const gotoSettings = useCallback(async () => {
    navigateToSplit?.('Settings', {
      previous: 'Home',
    });
    openSheet(2);
  }, [openSheet, navigateToSplit]);

  const pressDisconnectDrive = useCallback(async () => {
    const ret = await ConfirmAsync(t('GoogleDriveProjects.confirm.disconnect'));
    if (!ret) return;
    await disconnectGoogleAccount();
  }, [disconnectGoogleAccount]);

  const gotoDriveProjects = useCallback(async () => {
    navigateToSplit?.('GoogleDriveProjects', { previous: 'Home' });
    openSheet(2);
  }, [openSheet, navigateToSplit]);

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
            openSheet(isLandscape ? 2 : 1);
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
            openSheet(isLandscape ? 2 : 1);
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
        openSheet(2);
      } else {
        openSheet(1);
      }
      navigateToSplit?.('DataEdit', {
        previous: 'Data',
        targetData: { ...feature },
        targetLayer: { ...layer },
      });
      return false; // フィーチャーが見つかったのでfalseを返す
    },
    [openSheet, 
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
      //前ジェスチャーの状態が残らないよう、早期returnより前にリセットする
      multiTouchSeenRef.current = event.nativeEvent.touches.length >= 2;
      multiTouchHandledRef.current = false;
      //terminate後にonRegionChangeCompleteが来なかった場合の自己回復。
      //新しいタッチの時点では地図は静止しているため、描きかけの即時再表示が安全にできる
      if (!isDrawLineVisible) showDrawLine({ immediate: true });
      if (!event.nativeEvent.touches.length) return;

      const pXY = getPXY(event);

      // ドラッグ開始位置とタッチ開始時刻を記録
      dragStartPosition.current = { x: pXY[0], y: pXY[1] };
      touchStartTimeRef.current = getEventTimestamp(event);

      // 新しいタッチの開始時に長押し発火フラグをリセット
      longPressFiredRef.current = false;

      // 長押しタイマーをクリア（既存のタイマーがある場合）
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      // 長押し検出タイマーを開始（800ms）
      // ドローツールが開いていても、特定のツールが選択されていない場合は長押しを有効にする
      // editPositionモード中と2本指タッチでは長押しを無効にする
      if (
        !isMeasuring &&
        !multiTouchSeenRef.current &&
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
        //ペンロック中の指タッチは地図操作（scrollEnabledは静的条件で既に有効）。
        //手書きの描きかけがあれば確定し、地図が動く間は描きかけを隠す
        commitHandwritingStroke();
        hideDrawLine();
      } else if (currentDrawTool === 'MOVE') {
        hideDrawLine();
      } else if (currentDrawTool === 'SELECT') {
        //なげなわ選択の開始
        handleGrantSelect(pXY);
      } else if (currentDrawTool === 'SPLIT_LINE') {
        const isOK = checkSplitLine(pXY);
        if (isOK) {
          // 確認ダイアログを表示するため、位置を保存してuseEffectで処理
          setPendingSplitPosition(pXY);
          return; // 他の処理をスキップ
        }
      } else if (isPlotTool(currentDrawTool)) {
        handleGrantPlot(pXY);
      } else if (isHandwritingTool(currentDrawTool)) {
        handleGrantHandwriting(pXY, handwritingPenStyleParam);
      } else if (featureButton === 'MEMO' || (featureButton === 'LINE' && isEraserTool(currentMapMemoTool))) {
        //LINEタブでも手書きの消しゴム（メモの消しゴム）を使えるようにする
        //（ペンロック中の指タッチは上の分岐で地図操作になるため、ここに来るのは描画するタッチのみ）
        handleGrantMapMemo(event);
      }
    },
    [
      checkSplitLine,
      commitHandwritingStroke,
      currentDrawTool,
      currentMapMemoTool,
      featureButton,
      getPXY,
      handleGrantHandwriting,
      handleGrantMapMemo,
      handleGrantPlot,
      handleGrantSelect,
      handwritingPenStyleParam,
      hideDrawLine,
      isDrawLineVisible,
      isPencilModeActive,
      isPencilTouch,
      route.params?.mode,
      showDrawLine,
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
      if (currentDrawTool === 'NONE' && currentMapMemoTool === 'NONE' && !isPlotTool(currentDrawTool)) {
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

      //地図が処理するタッチ（MOVEツール・ペンロック中の指ドラッグ）では描画処理をしない
      if (currentDrawTool === 'MOVE' || (isPencilModeActive && isPencilTouch.current === false)) {
        return;
      }
      if (gesture.numberActiveTouches === 2 || event.nativeEvent.touches.length >= 2) {
        //パームリジェクション: ペンロック中にPencilで描画している最中の指・手のひらは完全に無視する。
        //multiTouchSeenRefを戻すことで、指が離れた後もPencilの描画を続けられる
        if (isPencilModeActive && isPencilTouch.current === true) {
          multiTouchSeenRef.current = false;
          return;
        }
        multiTouchSeenRef.current = true;
        //後始末は1ジェスチャー1回だけ。毎フレーム再実行すると冪等でない処理
        //（cancelHandwritingStroke等）が二重適用され、無関係な描きかけが消える
        if (multiTouchHandledRef.current) return;
        multiTouchHandledRef.current = true;
        //タッチ開始直後の2本目着地はピンチ意図とみなし、1本目のGrantで拾った点を取り消す
        const isPinchIntentFromStart = getEventTimestamp(event) - touchStartTimeRef.current < PINCH_INTENT_DURATION_MS;
        if (isPinchIntentFromStart) {
          cancelHandwritingStroke();
        } else {
          //手書きの描きかけがあれば確定してから地図操作へ（描きかけの消失防止）
          commitHandwritingStroke();
        }
        //プロットはGrantで追加・移動したノードを取り消す（タップ確定はリリース時のため）
        cancelPlotGrant();
        //なげなわ選択の描きかけは破棄する
        if (currentDrawTool === 'SELECT') selectLine.current = [];
        //長押しタイマーが残っているとピンチ中に発火するためクリア
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        //ペンで描画中はストロークを破棄せず中断し、後で続きを描けるようにする
        pauseMapMemoDrawing(isPinchIntentFromStart);
        //2本指を地図操作へ引き渡すことはしない（地図ジェスチャーの可否はscrollEnabled等のpropsで
        //静的に決まる）。ツールON中の2本指はここまでの後始末だけして無視する。
        //地図を動かしたいときは地図移動ツールへの持ち替え（メモはツールをオフに）で行う
      } else if (isMapMemoDrawTool(currentMapMemoTool)) {
        //2本指が関与したジェスチャーでは、指を1本離した後の残り指で描かない
        if (!multiTouchSeenRef.current) handleMoveMapMemo(event);
      } else if (currentDrawTool === 'SELECT') {
        //2本指が関与したジェスチャーでは、指を1本離した後の残り指でなげなわを伸ばさない
        if (!multiTouchSeenRef.current) handleMoveSelect(pXY);
      } else if (isPlotTool(currentDrawTool)) {
        //2本指が関与したジェスチャーでは、指を1本離した後の残り指でノードを動かさない
        if (!multiTouchSeenRef.current) handleMovePlot(pXY);
      } else if (isHandwritingTool(currentDrawTool)) {
        //2本指が関与したジェスチャーでは、指を1本離した後の残り指で描かない
        if (!multiTouchSeenRef.current) handleMoveHandwriting(pXY, getEventTimestamp(event));
      }
    },
    [
      cancelHandwritingStroke,
      cancelPlotGrant,
      commitHandwritingStroke,
      currentDrawTool,
      currentMapMemoTool,
      getPXY,
      handleMoveHandwriting,
      handleMoveMapMemo,
      handleMovePlot,
      handleMoveSelect,
      selectLine,
      isPencilModeActive,
      isPencilTouch,
      pauseMapMemoDrawing,
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
      closeSheet();
      navigateToSplit?.('Data', { targetLayer: layer });
    }
  }, [closeSheet, deleteDraw, drawLine, navigateToSplit]);

  const handlePanResponderRelease = useCallback(
    async (event: GestureResponderEvent) => {
      //ペンロック中の指タッチは地図操作なので、情報取得タップ等を発火させない（リセット前に判定を取る）
      const wasPencilFingerTouch = isPencilModeActive && isPencilTouch.current === false;
      isPencilTouch.current = undefined;

      const pXY = getPXY(event);

      //ドラッグ距離（タップかドラッグかの判定用）。リセット前に計算しておく
      const dragDistance = dragStartPosition.current
        ? Math.hypot(pXY[0] - dragStartPosition.current.x, pXY[1] - dragStartPosition.current.y)
        : 0;
      // ドラッグ開始位置をリセット
      dragStartPosition.current = null;

      // 長押しタイマーをクリア
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (route.params?.mode === 'editPosition') showDrawLine();

      //同時リフト時はchangedTouchesに複数入るため、記録漏れの保険としてここでも確認する
      const wasMultiTouch = multiTouchSeenRef.current || (event.nativeEvent.changedTouches?.length ?? 0) >= 2;
      multiTouchSeenRef.current = false;
      multiTouchHandledRef.current = false;

      if (wasPencilFingerTouch || wasMultiTouch) {
        //地図操作のタッチ（ペンロックの指）と2本指が関与したタッチでは描画を確定しない。
        //指が動かないズーム（2本指タップ・その場ピンチ）はMoveの2本指検出を通らないため、ここでも取り消す
        if (wasMultiTouch) {
          commitHandwritingStroke();
          pauseMapMemoDrawing();
        }
        //Grantで置いたプロットがlatlon未確定のまま残ると位置なしレコードとして保存されてしまうため、
        //ここでも必ず取り消す（Moveで取り消し済みなら無害）
        cancelPlotGrant();
        //なげなわの描きかけの残骸が画面に残らないようクリアする
        selectLine.current = [];
        //描きかけを再表示する（地図が動いた場合はmapRegion更新時に位置を再計算して表示される）
        showDrawLine({ immediate: true });
        isMapDragging.current = false;
        longPressFiredRef.current = false;
        return;
      } else if (currentDrawTool === 'MOVE') {
        //タップだけ（地図が動いていない）ならregion変化イベントが来ず再計算が発火しないため即時再表示する。
        //ドラッグ時に即時表示すると旧位置のxyのまま再計算フラグが消費され、パン後にずれて固着するため、
        //従来どおりregion変化後の再計算で表示する
        showDrawLine(dragDistance <= 5 ? { immediate: true } : undefined);
        return;
      } else if (currentDrawTool === 'SELECT') {
        handleReleaseSelect(pXY);
      } else if (currentDrawTool === 'PLOT_POINT' || currentDrawTool === 'ADD_LOCATION_POINT') {
        handleReleasePlotPoint();
      } else if (currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON') {
        const finished = handleReleasePlotLinePolygon();
        if (finished) {
          if (route.params?.mode === 'editPosition') {
            const result = currentDrawTool === 'PLOT_LINE' ? saveLine(currentDrawStyle) : savePolygon(currentDrawStyle);
            const { isOK, message } = result;
            if (!isOK) {
              await AlertAsync(message);
              return;
            }
            finishEditPosition(true);
          } else {
            const result = currentDrawTool === 'PLOT_LINE' ? saveLine(currentDrawStyle) : savePolygon(currentDrawStyle);
            const { isOK, message, layer, recordSet } = result;
            if (!isOK) {
              await AlertAsync(message);
              return;
            }
            setDrawTool('NONE');
            //飛翔図・植生図は続けて描くのでデータ編集は開かない
            if (
              layer !== undefined &&
              layer.toolPalette === undefined &&
              recordSet !== undefined &&
              recordSet.length > 0
            ) {
              openSheet(2);
              navigateToSplit?.('DataEdit', {
                previous: 'Data',
                targetData: recordSet[0],
                targetLayer: layer,
              });
            }
          }
        }
      } else if (isHandwritingTool(currentDrawTool)) {
        handleReleaseHandwriting();
      } else if (currentDrawTool === 'SPLIT_LINE') {
        // 分割ツールの場合はリリース時に何もしない（確認ダイアログはGrantで処理）
        return;
      } else if (currentMapMemoTool !== 'NONE') {
        handleReleaseMapMemo(event);
      } else if (!isMapDragging.current && !longPressFiredRef.current) {
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
      // 長押し発火フラグをリセット
      longPressFiredRef.current = false;
    },
    [openSheet, 
      cancelPlotGrant,
      commitHandwritingStroke,
      currentDrawStyle,
      currentDrawTool,
      currentMapMemoTool,
      finishEditPosition,
      getInfoOfFeature,
      getInfoOfMap,
      getPXY,
        pauseMapMemoDrawing,
      handleReleaseHandwriting,
      handleReleaseMapMemo,
      handleReleasePlotLinePolygon,
      handleReleasePlotPoint,
      handleReleaseSelect,
      isPencilModeActive,
      isPencilTouch,
      mapLocationInfo,
      mapRegion,
      mapSize,
      navigateToSplit,
      route.params,
      saveLine,
      savePolygon,
      selectLine,
      setDrawTool,
      showDrawLine,
      isMeasuring,
      setMeasureB,
    ]
  );

  const handlePanResponderTerminate = useCallback(() => {
    //地図側のネイティブジェスチャー（ピンチズーム等）にタッチが奪われた場合の後始末。
    //Grantで拾った点を取り消し、実質的な描きかけは保全する（リリースは呼ばれない）
    commitHandwritingStroke();
    cancelPlotGrant();
    pauseMapMemoDrawing();
    //リリースが呼ばれないため、ここで再表示を予約しないと描きかけが非表示のまま固着する
    //（地図がジェスチャーを取った後はmapRegionが更新されるので、再計算後に表示される）
    showDrawLine();
    isPencilTouch.current = undefined;
    dragStartPosition.current = null;
    multiTouchSeenRef.current = false;
    multiTouchHandledRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isMapDragging.current = false;
    longPressFiredRef.current = false;
  }, [cancelPlotGrant, commitHandwritingStroke, isPencilTouch, pauseMapMemoDrawing, showDrawLine]);

  const recordMultiTouch = useCallback((event: GestureResponderEvent) => {
    //2本目の指の着地はGrantを再発火しないため、ここで記録する（指が動かないズーム対策）
    if (event.nativeEvent.touches.length >= 2) {
      multiTouchSeenRef.current = true;
      //2本指では長押しポップアップを出さない
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    return true;
  }, []);

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: recordMultiTouch,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderStart: recordMultiTouch,
        onPanResponderGrant: handlePanResponderGrant,
        onPanResponderMove: handlePanResponderMove,
        onPanResponderRelease: handlePanResponderRelease,
        onPanResponderTerminate: handlePanResponderTerminate,
      }),
    [
      handlePanResponderGrant,
      handlePanResponderMove,
      handlePanResponderRelease,
      handlePanResponderTerminate,
      recordMultiTouch,
    ]
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
      closeSheetLater(500);
    } else if (route.params?.previous === 'Settings') {
      //ecorismapを読み込んだときにプロジェクトのホームにジャンプする場合
      changeMapRegion(route.params.jumpTo, true);
      closeSheetLater(500);
      //toggleTerrain(false);
      if (Platform.OS !== 'web') toggleHeadingUp(false);
    } else if (route.params?.previous === 'Projects') {
      closeSheetLater(300);
    } else if (route.params?.previous === 'AccountSettings') {
      closeSheetLater(300);
    } else if (route.params?.previous === 'ProjectEdit') {
      //プロジェクトを開くときにプロジェクトのホームにジャンプする場合
      changeMapRegion(route.params.jumpTo, true);
      closeSheetLater(300);
    } else if (route.params?.previous === 'Data') {
      //絞り込んだデータの範囲にジャンプする場合
      changeMapRegion(route.params.jumpTo, true);
      openSheet(0);
    } else if (route.params?.previous === 'DataEdit') {
      if (route.params?.mode === 'jumpTo') {
        //データの範囲にジャンプする場合
        changeMapRegion(route.params.jumpTo, true);
        if (isLandscape) {
          openSheet(0);
        } else {
          openSheet(0);
        }
      } else if (route.params?.mode === 'editPosition') {
        if (route.params?.layer === undefined || route.params?.record === undefined) return;

        const layer = route.params.layer;
        const record = route.params.record;
        const featureType = layer.type as FeatureButtonType;
        const jumpTo = route.params.jumpTo;

        // UI準備
        closeSheetLater(300);
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
        closeSheetLater(500);
        toggleTerrain(false);
        if (Platform.OS !== 'web') toggleHeadingUp(false);
      } else if (route.params?.jumpTo) {
        //PDFの範囲にジャンプする場合
        closeSheetLater(300);
        toggleTerrain(false);
        if (Platform.OS !== 'web') toggleHeadingUp(false);
        changeMapRegion(route.params.jumpTo, true);
      } else {
        openSheet(2);
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
      pressFeatureButton,
      selectDrawTool,
      setPointTool,
      setLineTool,
      setPolygonTool,

      // Drawing actions (stable references)
      onDragEndPoint,
      pressUndoDraw,
      pressRedoDraw,
      isUndoable: isDrawUndoable,
      isRedoable: isDrawRedoable,
      pressUndo,
      pressRedo,
      isUndoAvailable,
      isRedoAvailable,
      pressSaveDraw,
      cancelDraw,
      pressDeleteDraw,
      finishEditObject,
      resetDrawTools,

      // Editing layer chip
      editingLayerName,
      editingLayer,
      selectFieldValues,
      addFieldValue,
      updateFieldValue,
      deleteFieldValue,
      pendingPaletteDrawTool,
      setPendingPaletteDrawTool,
      pressEditingLayerButton,

      //個別色レイヤ（色・太さボタンの常時表示と通常作図への反映）
      isIndividualStyleLayer,
      //単一オブジェクト選択中の太さ（太さパレットの初期値）
      selectedObjectWidthType: selectedSingleObjectStyle?.widthType,
      selectedObjectArrowStyle: selectedSingleObjectStyle?.arrowStyle,
      switchSelectionToSplit,
      //手書きペンのサブツールと設定モーダル
      handwritingSubTool,
      setHandwritingSubTool,
      symbolDetailField,
      selectSymbolDetail,
      openHandwritingSettingsTab,

      // Backward compatibility (to be deprecated gradually)
      isEditingDraw,
      isEditingObject,
      isAreaSelected,
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
      isAreaSelected,
      isSelectedDraw,
      isEditingLine,
      editingLineId,
      featureButton,
      currentDrawTool,
      currentPointTool,
      currentLineTool,
      currentPolygonTool,
      selectFeatureButton,
      pressFeatureButton,
      selectDrawTool,
      setPointTool,
      setLineTool,
      setPolygonTool,
      onDragEndPoint,
      pressUndoDraw,
      pressRedoDraw,
      isDrawUndoable,
      isDrawRedoable,
      pressUndo,
      pressRedo,
      isUndoAvailable,
      isRedoAvailable,
      pressSaveDraw,
      cancelDraw,
      pressDeleteDraw,
      finishEditObject,
      resetDrawTools,
      editingLayerName,
      editingLayer,
      selectFieldValues,
      addFieldValue,
      updateFieldValue,
      deleteFieldValue,
      pendingPaletteDrawTool,
      pressEditingLayerButton,
      isIndividualStyleLayer,
      selectedSingleObjectStyle?.widthType,
      selectedSingleObjectStyle?.arrowStyle,
      switchSelectionToSplit,
      handwritingSubTool,
      setHandwritingSubTool,
      symbolDetailField,
      selectSymbolDetail,
      openHandwritingSettingsTab,
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
    featuresTransformAngle,
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
      colorPickerColor,
      penWidth,
      isPencilModeActive,
      isUndoable,
      isRedoable,
      mapMemoLines,
      arrowStyle,
      setArrowStyle: setArrowStyleMarked,
      isStraightStyle,
      setIsStraightStyle,
      selectMapMemoTool,
      setPenWidth: setPenWidthMarked,
      setVisibleMapMemoColor,
      selectPenColor: selectPenColorMarked,
      pressUndoMapMemo,
      pressRedoMapMemo,
      togglePencilMode,
    }),
    [
      currentMapMemoTool,
      visibleMapMemoColor,
      currentPenWidth,
      penColor,
      colorPickerColor,
      penWidth,
      isPencilModeActive,
      isUndoable,
      isRedoable,
      mapMemoLines,
      arrowStyle,
      setArrowStyleMarked,
      isStraightStyle,
      setIsStraightStyle,
      selectMapMemoTool,
      setPenWidthMarked,
      setVisibleMapMemoColor,
      selectPenColorMarked,
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
      onSheetIndexChange,
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
      onSheetIndexChange,
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
                            mode={featureButton === 'MEMO' ? 'MEMO' : 'DRAW_LINE'}
                            handwritingSubTool={handwritingSubTool}
                            selectHandwritingSubTool={setHandwritingSubTool}
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
                          <HomeModalLayerSelect {...layerSelectProps} />
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
