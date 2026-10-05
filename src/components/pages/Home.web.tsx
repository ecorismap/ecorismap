import React, { useCallback, useEffect, useMemo, useContext, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import type { PointRecordType, LineRecordType, PolygonRecordType } from '../../types';

import { COLOR } from '../../constants/AppConstants';
import { HomeButtons } from '../organisms/HomeButtons';
import HomeProjectLabel from '../organisms/HomeProjectLabel';
import { HomeAccountButton } from '../organisms/HomeAccountButton';
import Map, {
  GeolocateControl,
  GeolocateEvent,
  GeolocateResultEvent,
  MapRef,
  NavigationControl,
  ScaleControl,
} from 'react-map-gl/maplibre';
import maplibregl, { LayerSpecification, RasterDEMTileSource, RequestParameters } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Point } from '../organisms/HomePoint';
import { Polygon } from '../organisms/HomePolygon.web';
import { Line } from '../organisms/HomeLine';
import { TileMapType, PaperOrientationType, PaperSizeType, ScaleType } from '../../types';
import { SvgView } from '../organisms/HomeSvgView';
import { BottomSheetContent } from '../organisms/BottomSheetContent';
import { HomeZoomLevel } from '../organisms/HomeZoomLevel';
import { HomeProjectButtons } from '../organisms/HomeProjectButtons';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { maptilerKey } from '../../constants/APIKeys';
import { MAPTERHORN_URL, TERRAIN_EXAGGERATION } from '../../constants/DemSources';
import { takePendingVista, terrain3dVistaStore } from '../../utils/terrain3d/vistaStore';
import {
  clearWebVista,
  createWebPeakProjector,
  reapplyWebVista,
  startWebVista,
  WEB_NORMAL_MAX_PITCH_DEG,
} from '../../utils/terrain3d/webVista';
import { VISTA_MAX_PITCH_DEG } from '../../utils/terrain3d/constants';
import { HomeTerrain3DVistaBanner } from '../organisms/HomeTerrain3DVistaBanner';
import { HomeTerrain3DButtons } from '../organisms/HomeTerrain3DButtons';
import { HomeVistaPeakLabels } from '../organisms/HomeVistaPeakLabels';
import { loadPeakIndex } from '../../utils/peaks/peakData';
import { isPeaksUrl } from '../../utils/peaks/peak2dLabels';
import { EMPTY_PEAKS, getPeakLayers, PeakFeatureCollection, toPeakGeoJSON } from '../../utils/peaks/peakLayers.web';

// 3D表示用の標高タイル（Mapterhorn、terrarium形式をmaplibreが内蔵デコード）。
// 日本は基盤地図情報DEM(1m/5m/10m)、国外はCopernicus GLO-30ほか。詳細はdocs/DEM_SOURCES.md
const rasterdem = {
  type: 'raster-dem',
  tiles: [MAPTERHORN_URL],
  encoding: 'terrarium',
  tileSize: 512,
  minzoom: 0,
  maxzoom: 15,
  attribution: '<a href="https://mapterhorn.com/attribution" target="_blank">&copy; Mapterhorn</a>',
};
import { useDropzone } from 'react-dropzone';
import { useWindow } from '../../hooks/useWindow';
import { useViewportBounds } from '../../hooks/useViewportBounds';
import { HomeDrawTools } from '../organisms/HomeDrawTools';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { MapViewContext } from '../../contexts/MapView';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { PDFExportContext } from '../../contexts/PDFExport';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { ProjectContext } from '../../contexts/Project';
import { TileManagementContext } from '../../contexts/TileManagement';
import { MapMemoContext } from '../../contexts/MapMemo';
import { DataSelectionContext } from '../../contexts/DataSelection';
import { AppStateContext } from '../../contexts/AppState';
import { useBottomSheetNavigation } from '../../contexts/BottomSheetNavigationContext';
import { MemberMarker } from '../organisms/HomeMemberMarker';
import { HomeTrackFocusMarker } from '../organisms/HomeTrackFocusMarker';
import { HomeMeasure } from '../organisms/HomeMeasure';
import { HomeMeasureBanner } from '../organisms/HomeMeasureBanner';
import { HomeViewshedBanner } from '../organisms/HomeViewshedBanner';
import { HomeViewshedPreview } from '../organisms/HomeViewshedPreview';
import { useFeatureSelectionWeb } from '../../hooks/useFeatureSelectionWeb';
import { isPointRecordType } from '../../utils/Data';
import * as pmtiles from 'pmtiles';
import { MapMemoView } from '../organisms/HomeMapMemoView';
import { HomeMapMemoTools } from '../organisms/HomeMapMemoTools';
import { HomePopup } from '../organisms/HomePopup';
import { HomePoiPopup } from '../organisms/HomePoiPopup';
import { HomeTrackPointPopup } from '../organisms/HomeTrackPointPopup';
import { getMapGesturesEnabled } from '../../utils/General';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet from '@gorhom/bottom-sheet';
import { ReduceMotion, useSharedValue } from 'react-native-reanimated';
import { PDFArea } from '../organisms/HomePDFArea';
import { HomePDFButtons } from '../organisms/HomePDFButtons';
import { HomeModalColorPicker } from '../organisms/HomeModalColorPicker';
//import Dexie from 'dexie';

// import { HomeInfoToolButton } from '../organisms/HomeInfoToolButton';
import { encode as fastPngEncode } from 'fast-png';
import {
  buildShadingTileUrl,
  createShadingProtocolHandler,
  SHADING_PROTOCOL,
} from '../../utils/shadingTileProtocol.web';
import { isDemProtocolUrl, isReliefUrl, toDemUrl } from '../../utils/terrainShading';
import { reliefStyleFromUrl } from '../../utils/colorRelief';
import {
  BATHY_TERRAIN_PROTOCOL,
  GSJDEM_PROTOCOL,
  buildBathymetryTerrainTileUrl,
  buildGsjDemTileUrl,
  createBathymetryTerrainProtocolHandler,
  createGsjDemProtocolHandler,
  gebcoSourceParams,
  getGebcoContourTilesUrl,
  getGebcoLayers,
  getGebcoNameSources,
} from '../../utils/gebcoDemLayers.web';
import { withTileSignature } from '../../utils/TileSignature';
import { tileToWebMercator } from '../../utils/Tile';
import { fromBlob } from 'geotiff';
import { db } from '../../utils/db';
import { getPmtilesSource, getVectorLayerStyles, VECTOR_GLYPHS_URL } from '../../utils/vectorTileStyle';
import { HomeTerrainControl } from '../organisms/HomeTerrainControl';
import { Pressable } from '../atoms/Pressable';

export default function HomeScreen() {
  // TileManagementContext
  const { downloadMode, tileMaps } = useContext(TileManagementContext);

  // MapMemoContext
  const { currentMapMemoTool, visibleMapMemoColor, colorPickerColor, setVisibleMapMemoColor, selectPenColor } =
    useContext(MapMemoContext);

  // DataSelectionContext
  const { pointDataSet, lineDataSet, polygonDataSet, selectedRecord, isEditingRecord } =
    useContext(DataSelectionContext);

  // isEditingLayer, isEditingMap from Redux
  // 署名付きタイル配信の署名。tileMap.urlは書き換えず、maplibreに渡す直前に合成する。
  const tileSignatures = useSelector((state: RootState) => state.tileSignatures);
  const isEditingLayer = useSelector((state: RootState) => state.settings.isEditingLayer);
  const isEditingMap = useSelector((state: RootState) => state.settings.isEditingMap);

  // AppStateContext
  const { restored, isLoading, bottomSheetRef, onCloseBottomSheet, updatePmtilesURL, gotoHome } =
    useContext(AppStateContext);

  // BottomSheetNavigationContext
  const { currentRouteName, setIsBottomSheetOpen, bottomSheetRef: navSheetRef } = useBottomSheetNavigation();

  // 実際のBottomSheetをAppStateのrefとナビゲーションContextのrefの両方に接続する
  // （ContextのsnapToIndex/closeBottomSheetが実シートに効くようにするため）
  const setBottomSheetRefs = useCallback(
    (instance: BottomSheet | null) => {
      bottomSheetRef.current = instance;
      navSheetRef.current = instance;
    },
    [bottomSheetRef, navSheetRef]
  );

  // MapViewContext
  const {
    mapViewRef,
    zoom,
    zoomDecimal,
    onRegionChangeMapView,
    onDrop,
    panResponder,
    isDrawLineVisible,
    isTerrainActive,
    toggleTerrain,
    updateLocationFromWebGeolocate,
    endWebGeolocate,
  } = useContext(MapViewContext);

  // DrawingToolsContext
  const { featureButton, currentDrawTool, onDragEndPoint } = useContext(DrawingToolsContext);

  // 眺望中は地図の標準操作（パン・回転・ズーム）を止める。ドラッグは見回しになる（webVista）
  const vistaActive = useSyncExternalStore(
    terrain3dVistaStore.subscribe,
    () => terrain3dVistaStore.getSnapshot().active
  );

  // 2Dの長押しメニューから眺望を選んで3Dへ来たら、その地点の眺望へ移す。
  // 3Dを抜けたら眺望も解除する（2Dへ戻る側が俯角を0へ戻すので、ここではカメラを動かさない）
  useEffect(() => {
    const mapRef = mapViewRef.current as MapRef | null;
    if (mapRef === null) return;
    if (isTerrainActive) {
      const pending = takePendingVista();
      if (pending !== null) startWebVista(mapRef.getMap(), pending.latitude, pending.longitude);
    } else {
      clearWebVista(false);
    }
  }, [isTerrainActive, mapViewRef]);
  useEffect(() => () => clearWebVista(false), []);
  // 眺望に入ると地図を非制御にする（webVista.tsの注意書き参照）。
  // 非制御になる前の視点はpropsで戻されているので、切り替わった後に置き直す
  useEffect(() => {
    if (vistaActive) reapplyWebVista();
  }, [vistaActive]);
  // 眺望中の山名ラベルの投影。眺望に入った時点の地図インスタンスで作る
  const peakProjector = useMemo(() => {
    const mapRef = mapViewRef.current as MapRef | null;
    return vistaActive && mapRef !== null ? createWebPeakProjector(mapRef.getMap()) : null;
  }, [vistaActive, mapViewRef]);

  //地図ジェスチャーの許可判定（nativeのscrollEnabledと同じルール）。Webにはペンロックが無い
  const mapGesturesEnabled = useMemo(
    () =>
      getMapGesturesEnabled({
        currentMapMemoTool,
        currentDrawTool,
        isPencilModeActive: false,
        isPencilTouch: undefined,
      }),
    [currentDrawTool, currentMapMemoTool]
  );

  // PDFExportContext
  const {
    exportPDFMode,
    pdfArea,
    pdfOrientation,
    pdfPaperSize,
    pdfScale,
    pdfTileMapZoomLevel,
    pressExportPDF,
    pressPDFSettingsOpen,
  } = useContext(PDFExportContext);

  // LocationTrackingContext
  const { memberLocations, editPositionMode, editPositionRecord, editPositionLayer } =
    useContext(LocationTrackingContext);

  // ProjectContext
  const { isSynced, isShowingProjectButtons, isSettingProject, projectName, pressProjectLabel } =
    useContext(ProjectContext);
  //console.log('render Home');
  const layers = useSelector((state: RootState) => state.layers);

  const { mapRegion, windowWidth, isLandscape } = useWindow();
  const { bounds } = useViewportBounds(mapRegion);
  const { getRootProps, getInputProps } = useDropzone({ onDrop, noClick: true });
  const { selectFeatureWeb } = useFeatureSelectionWeb(mapViewRef.current);
  const snapPoints = useMemo(() => ['10%', '50%', '100%'], []);
  const animatedIndex = useSharedValue(0);

  const pressPDFBack = useCallback(() => gotoHome(), [gotoHome]);

  // 地図の現在地ボタン(GeolocateControl)で取得した位置をアプリのGPS状態へ同期する。
  // これが無いとWeb版はgpsState/currentLocationが常にOFF扱いになり、
  // 位置トグル付きの辞書追加や現在地ポイント追加が機能しない
  const handleGeolocate = useCallback(
    (e: GeolocateResultEvent) => {
      updateLocationFromWebGeolocate({
        latitude: e.coords.latitude,
        longitude: e.coords.longitude,
        altitude: e.coords.altitude,
        accuracy: e.coords.accuracy,
      });
    },
    [updateLocationFromWebGeolocate]
  );

  const handleGeolocateError = useCallback(() => {
    endWebGeolocate();
  }, [endWebGeolocate]);

  const handleTrackUserLocationEnd = useCallback(
    (e: GeolocateEvent) => {
      // 地図を手動移動しただけ（backgroundモード）でもendイベントが発火するため、
      // コントロールが完全にOFFになった場合のみアプリのGPS状態を落とす。
      // _watchStateはmaplibre内部プロパティのため、参照できない場合は安全側（OFF扱い）に倒す
      const watchState = (e.target as unknown as { _watchState?: string })._watchState;
      if (watchState === undefined || watchState === 'OFF') {
        endWebGeolocate();
      }
    },
    [endWebGeolocate]
  );

  const skyStyle = {
    'sky-color': '#79bffc',
    'sky-horizon-blend': 0.6,
    'horizon-color': '#f0f8ff',
    'horizon-fog-blend': 1,
    'fog-color': '#034580',
    'fog-ground-blend': 0.85,
  };
  // 眺望中の空。通常のフォグは「注視点〜地平線の85%から先」を濃い青で塗るが、眺望は注視点が
  // 足元のすぐ先なので遠くの山並みがほぼ全部フォグに沈み、山名だけ出て山が見えなかった。
  // 眺望では地形にフォグを掛けず（fog-ground-blend=1）、地平線際の空だけ明るい霞にする
  const VISTA_SKY_STYLE = {
    ...skyStyle,
    'fog-color': '#dbe8f5',
    'fog-ground-blend': 1,
    'horizon-fog-blend': 0.15,
  };
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  const loadPDF = async (params: RequestParameters, _abortController: AbortController) => {
    try {
      // //parms.urlはpdf://mapId/z/x/yの形式
      const [mapId, ...tileNumber] = params.url.split('/').slice(-4);
      const [z, x, y] = tileNumber.map(Number);
      //console.log(mapId, z, x, y);
      const geotiff = await db.geotiff.get(mapId);
      //console.log(geotiff);
      if (!geotiff) return { data: null };
      const tiff = await fromBlob(geotiff.blob);
      if (!tiff) return { data: null };
      const topLeft = tileToWebMercator(x, y, z);
      const bottomRight = tileToWebMercator(x + 1, y + 1, z);
      const bbox = [topLeft.mercatorX, bottomRight.mercatorY, bottomRight.mercatorX, topLeft.mercatorY];
      //console.log(bbox);
      const size = 512;

      const data = await tiff.readRasters({
        bbox,
        samples: [0, 1, 2, 3],
        width: size,
        height: size,
        interleave: true,
      });

      const img = new ImageData(size, size);
      //@ts-ignore
      img.data.set(new Uint8ClampedArray(data));
      const png = fastPngEncode(img);
      return { data: png };
    } catch (e) {
      return { data: null };
    }
  };

  maplibregl.addProtocol('pdf', loadPDF);

  // 標高タイルから全方向陰影を生成するプロトコル。
  // maplibre内蔵のhillshadeは光源方位に依存し地図を回すと凹凸が反転するため使わない。
  maplibregl.addProtocol(SHADING_PROTOCOL, createShadingProtocolHandler());

  // GEBCO海底地形図用: GSJ数値PNG→Terrain-RGB変換プロトコル（raster-demソースが読む）
  maplibregl.addProtocol(GSJDEM_PROTOCOL, createGsjDemProtocolHandler());
  // GEBCO表示中の3D地形: Mapterhornの海（0m）をGEBCOの海底で埋めるプロトコル
  maplibregl.addProtocol(BATHY_TERRAIN_PROTOCOL, createBathymetryTerrainProtocolHandler());

  //console.log('Home');

  const customHandle = useCallback(() => {
    return (
      <View
        style={{
          height: 25,
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            backgroundColor: COLOR.GRAY4,
            borderRadius: 2.5,
            width: 30,
            height: 4,
            alignSelf: 'center',
          }}
        />
        {!isEditingRecord && !isEditingLayer && !isEditingMap && (
          <Pressable
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: 60,
              height: 20,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={() => onCloseBottomSheet(currentRouteName)}
          >
            <Text style={{ fontSize: 40, color: COLOR.GRAY4, lineHeight: 35 }}>×</Text>
          </Pressable>
        )}
      </View>
    );
  }, [isEditingRecord, isEditingLayer, isEditingMap, onCloseBottomSheet, currentRouteName]);

  // ========== レイヤースタイル関連の処理 ==========


  // ========== レイヤー生成関数 ==========

  /**
   * ラスタータイル用のレイヤー定義を生成（同期処理）
   * @param tileMap 対象のタイルマップ
   * @returns ラスターレイヤー定義またはnull
   */
  const getRasterLayer = useCallback((tileMap: TileMapType): LayerSpecification | null => {
    if (tileMap.url) {
      return {
        id: tileMap.id,
        type: 'raster',
        source: tileMap.id,
        minzoom: tileMap.minimumZ,
        maxzoom: 24,
        paint: { 'raster-opacity': 1 - (tileMap.transparency !== undefined ? tileMap.transparency : 0) },
      } as LayerSpecification;
    } else if (tileMap.id === 'hybrid') {
      return {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        minzoom: 0,
        maxzoom: 24,
        paint: { 'raster-opacity': 1 },
      };
    } else if (tileMap.id === 'standard') {
      return {
        id: 'standard',
        type: 'raster',
        source: 'standard',
        minzoom: 0,
        maxzoom: 24,
        paint: { 'raster-opacity': 1 },
      };
    }
    return null;
  }, []);

  /**
   * 立体図レイヤーの定義を生成
   * @param tileMap 対象のタイルマップ
   * @returns ヒルシェードレイヤー定義
   */
  const getShadingLayer = useCallback((tileMap: TileMapType): LayerSpecification | LayerSpecification[] => {
    // 陰影はterrainshadeプロトコル側で焼き込んであるので、通常のラスタレイヤとして扱う
    const transparency = tileMap.transparency ?? 0;

    return [
      {
        id: `${tileMap.id}_0`,
        type: 'raster' as const,
        source: tileMap.id,
        minzoom: tileMap.minimumZ || 0,
        maxzoom: 24,
        layout: {
          visibility: 'visible' as const,
        },
        paint: {
          'raster-opacity': 1 - transparency,
          // 陰影の細部をズーム中に潰さない
          'raster-resampling': 'linear' as const,
          'raster-fade-duration': 0,
        },
      } as LayerSpecification,
    ];
  }, []);

  const getVectorLayers = useCallback(
    (tileMap: TileMapType) => getVectorLayerStyles(tileMap, tileSignatures),
    // 署名が届いたら取得し直す必要があるため依存に含める
    [tileSignatures]
  );

  /**
   * タイルマップから適切なレイヤー定義を生成する統一インターフェース
   * ベクタータイルとラスタータイルを自動判別して処理
   * @param tileMap 対象のタイルマップ
   * @returns レイヤー定義（単一または配列）またはnull
   */
  const getTileMapLayers = useCallback(
    async (tileMap: TileMapType): Promise<LayerSpecification | LayerSpecification[] | null> => {
      // 非表示またはグループの場合はスキップ
      if (!tileMap.visible || tileMap.isGroup) {
        return null;
      }

      // 地図一覧の「山名」（peaks://）は同梱の山頂データのラベル（タイルではない）
      if (isPeaksUrl(tileMap.url)) {
        return getPeakLayers(tileMap);
      }

      // GEBCO海底地形図はデモ再現のmaplibreネイティブレイヤ（段彩・陰影・等深線・数値ラベル）
      if (isReliefUrl(tileMap.url) && reliefStyleFromUrl(tileMap.url) === 'gebco') {
        return getGebcoLayers(tileMap);
      }

      // 立体図タイル（標高から陰影・陰影段彩を計算）の判定と処理
      if (isDemProtocolUrl(tileMap.url)) {
        return getShadingLayer(tileMap);
      }

      // ベクタータイルの判定と処理
      const isVectorTile =
        tileMap.url &&
        (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles') || tileMap.url.includes('.pbf')) &&
        tileMap.isVector;

      if (isVectorTile) {
        return await getVectorLayers(tileMap);
      }

      // ラスタータイルの処理
      return getRasterLayer(tileMap);
    },
    [getRasterLayer, getVectorLayers, getShadingLayer]
  );

  // ========== 動的レイヤー管理 ==========

  /**
   * マップに動的にレイヤーを追加・更新する
   * 既存レイヤーを削除してから新規レイヤーを追加
   */
  const addDynamicLayers = useCallback(async () => {
    if (!mapViewRef.current) return;
    const map = (mapViewRef.current as MapRef).getMap();
    if (!map) return;

    // スタイルのロードが完了するまで待つ
    if (!map.isStyleLoaded()) {
      await new Promise<void>((resolve) => {
        const checkStyleLoaded = () => {
          if (map.isStyleLoaded()) {
            map.off('idle', checkStyleLoaded);
            resolve();
          }
        };
        map.on('idle', checkStyleLoaded);
      });
    }

    // Remove all existing dynamic layers (both raster and vector)
    const style = map.getStyle();
    if (style && style.layers) {
      const dynamicLayerIds = style.layers
        .filter((layer) => {
          if (layer.id.includes('_') && tileMaps.some((tm) => layer.id.startsWith(tm.id + '_'))) {
            return true;
          }
          // Remove all tilemap-related layers (including standard/satellite)
          return tileMaps.some((tm) => layer.id === tm.id || layer.id === 'satellite' || layer.id === 'standard');
        })
        .map((layer) => layer.id);

      // Remove layers in reverse order to avoid dependency issues
      dynamicLayerIds.reverse().forEach((layerId) => {
        if (map.getLayer(layerId)) {
          try {
            map.removeLayer(layerId);
          } catch (e) {
            //console.warn(`Failed to remove layer ${layerId}:`, e);
          }
        }
      });
    }

    // 全レイヤーを逆順で処理（表示順序を正しくするため）
    const layersPromise = tileMaps
      .slice(0)
      .reverse()
      .map((tileMap: TileMapType) => getTileMapLayers(tileMap));

    const layersResult = await Promise.all(layersPromise);
    const dynamicLayers = layersResult.flat().filter((layer): layer is LayerSpecification => !!layer);

    // 各レイヤーをマップに追加（features-placeholderの前に挿入）
    dynamicLayers.forEach((layer: LayerSpecification) => {
      if (!map.getLayer(layer.id)) {
        try {
          // features-placeholderレイヤーの前に挿入することで、
          // フィーチャーレイヤー（ライン、ポイント、ポリゴン）の下に配置される
          map.addLayer(layer, 'features-placeholder');
        } catch (e) {
          //console.warn(`Failed to add layer ${layer.id}:`, e);
        }
      }
    });

    // GEBCO海底地形図の表示中は、3D地形の海を海底の深さで起伏させる（ネイティブの海底モード相当）
    const gebcoMap = tileMaps.find(
      (tm) => tm.visible && !tm.isGroup && isReliefUrl(tm.url) && reliefStyleFromUrl(tm.url) === 'gebco'
    );
    const terrainTileUrl = gebcoMap
      ? buildBathymetryTerrainTileUrl(withTileSignature(toDemUrl(gebcoMap.url), tileSignatures))
      : MAPTERHORN_URL;
    const demSource = map.getSource('rasterdem') as RasterDEMTileSource | undefined;
    if (demSource && demSource.tiles?.[0] !== terrainTileUrl) {
      demSource.setTiles([terrainTileUrl]);
    }

    // isTerrainActiveの状態に基づいて地形設定を復元
    if (isTerrainActive) {
      map.setTerrain({ source: 'rasterdem', exaggeration: TERRAIN_EXAGGERATION });
    } else {
      map.setTerrain(null);
    }
  }, [tileMaps, getTileMapLayers, mapViewRef, isTerrainActive, tileSignatures]);

  // ========== Hooks ==========

  // PMTilesのURL更新（起動時）
  useEffect(() => {
    (async () => {
      await updatePmtilesURL();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タイルマップ変更時のレイヤー更新
  useEffect(() => {
    (async () => {
      if (mapViewRef.current) {
        await addDynamicLayers();
      }
    })();
    // mapViewRef is a ref object and should not be in the dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileMaps, addDynamicLayers]);

  useEffect(() => {
    if (isPointRecordType(selectedRecord?.record)) return;
    selectFeatureWeb(selectedRecord);
  }, [selectFeatureWeb, selectedRecord]);


  // ========== マップイベントハンドラー ==========

  /**
   * マップ初回ロード時の処理
   * 地形データソースの設定とレイヤーの初期化
   */
  const onMapLoad = useCallback(
    async (evt: any) => {
      const map = evt.target;

      // 地形データソースの追加
      if (!map.getSource('rasterdem')) {
        map.addSource('rasterdem', rasterdem);
      }

      // ユーザーの設定に合わせて地形表示を初期化
      if (isTerrainActive) {
        map.setTerrain({ source: 'rasterdem', exaggeration: TERRAIN_EXAGGERATION });
      } else {
        map.setTerrain(null);
      }

      // 初回ロード時にレイヤーを追加（useEffectが実行される前に確実に追加）
      if (mapViewRef.current) {
        await addDynamicLayers();
      }
    },
    [isTerrainActive, addDynamicLayers, mapViewRef]
  );

  // 地図一覧の「山名」を表示したときだけ、同梱の山頂データを読み込む（初期バンドルを太らせない）
  const [peaksGeoJSON, setPeaksGeoJSON] = useState<PeakFeatureCollection | null>(null);
  const hasVisiblePeaks = useMemo(
    () => tileMaps.some((tileMap) => tileMap.visible && !tileMap.isGroup && isPeaksUrl(tileMap.url)),
    [tileMaps]
  );
  useEffect(() => {
    if (!hasVisiblePeaks || peaksGeoJSON !== null) return;
    let cancelled = false;
    loadPeakIndex()
      .then((index) => {
        if (!cancelled) setPeaksGeoJSON(toPeakGeoJSON(index));
      })
      .catch((e) => console.warn('山頂データの読み込みに失敗', e));
    return () => {
      cancelled = true;
    };
  }, [hasVisiblePeaks, peaksGeoJSON]);

  // ========== マップスタイル定義 ==========

  /**
   * MapLibre GLのスタイル定義を生成
   * ソースのみを定義し、レイヤーは動的に追加
   */
  const mapStyle = useMemo(() => {
    const sources = tileMaps
      .slice(0)
      .reverse()
      .reduce((result: any, tileMap: TileMapType) => {
        if (tileMap.visible && !tileMap.isGroup) {
          const pmtilesSource = getPmtilesSource(tileMap, tileSignatures);
          if (pmtilesSource !== undefined) {
            return { ...result, [tileMap.id]: pmtilesSource };
          } else if (tileMap.url.endsWith('.pdf') || tileMap.url.startsWith('pdf://') || tileMap.url.startsWith('file://')) {
            return {
              ...result,
              [tileMap.id]: {
                type: 'raster',
                tiles: ['pdf://' + tileMap.id + '/{z}/{x}/{y}'],
                minzoom: tileMap.minimumZ,
                maxzoom: tileMap.maximumZ,
                scheme: 'xyz',
                tileSize: 256,
                attribution: tileMap.attribution,
              },
            };
          } else if (isReliefUrl(tileMap.url) && reliefStyleFromUrl(tileMap.url) === 'gebco') {
            // GEBCO海底地形図: raster-dem（Terrain-RGB変換）と等深線ベクタの2ソース
            const demUrl = withTileSignature(toDemUrl(tileMap.url), tileSignatures);
            const { tileSize, maxzoom } = gebcoSourceParams(demUrl);
            return {
              ...result,
              [tileMap.id]: {
                type: 'raster-dem' as const,
                tiles: [buildGsjDemTileUrl(demUrl)],
                tileSize,
                minzoom: tileMap.minimumZ || 0,
                maxzoom,
                encoding: 'mapbox' as const,
                attribution: tileMap.attribution,
              },
              [`${tileMap.id}_contour`]: {
                type: 'vector' as const,
                tiles: [getGebcoContourTilesUrl(maplibregl, demUrl)],
                minzoom: 4,
                maxzoom,
              },
              ...getGebcoNameSources(tileMap.id),
            };
          } else if (isDemProtocolUrl(tileMap.url)) {
            // 標高タイルを自前で取得・計算するため、raster-demではなく通常のラスタとして扱う。
            // maxzoomは標高タイルが実在する最大ズーム。これを超える分はmaplibreが拡大表示する。
            return {
              ...result,
              [tileMap.id]: {
                type: 'raster' as const,
                tiles: [
                  buildShadingTileUrl(
                    withTileSignature(toDemUrl(tileMap.url), tileSignatures),
                    tileMap.flipY,
                    isReliefUrl(tileMap.url),
                    reliefStyleFromUrl(tileMap.url)
                  ),
                ],
                tileSize: 256,
                minzoom: tileMap.minimumZ || 0,
                maxzoom: Math.min(tileMap.overzoomThreshold ?? 15, tileMap.maximumZ ?? 15),
                scheme: 'xyz' as const,
                attribution: tileMap.attribution,
              },
            };
          } else if (isPeaksUrl(tileMap.url)) {
            // 山名は同梱データをGeoJSONで重ねる。読み込みが終わるまでは空で置いておく
            return {
              ...result,
              [tileMap.id]: { type: 'geojson', data: peaksGeoJSON ?? EMPTY_PEAKS, attribution: tileMap.attribution },
            };
          } else if (tileMap.url) {
            return {
              ...result,
              [tileMap.id]: {
                type: 'raster',
                //tiles: ['custom://' + tileMap.url], //キャッシュを使う場合
                tiles: [withTileSignature(tileMap.url, tileSignatures)],
                minzoom: tileMap.minimumZ,
                maxzoom: tileMap.maximumZ,
                scheme: tileMap.flipY ? 'tms' : 'xyz',
                tileSize: 256,
                attribution: tileMap.attribution,
              },
            };
          } else if (tileMap.id === 'hybrid') {
            return {
              ...result,
              satellite: {
                type: 'raster',
                tiles: ['https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.jpg?key=' + maptilerKey],
                minzoom: 0,
                // MapTilerの衛星写真はz22まで。24にしていると、眺望など大きく拡大したときに
                // 存在しないz23・z24を取りに行って400エラーが出続けた（それより先はz22の拡大表示）
                maxzoom: 22,
                scheme: 'xyz',
                tileSize: 512,
                attribution:
                  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
              },
            };
          } else if (tileMap.id === 'standard') {
            return {
              ...result,
              standard: {
                type: 'raster',
                tiles: ['https://api.maptiler.com/maps/topo-v2/{z}/{x}/{y}.png?key=' + maptilerKey],
                minzoom: 0,
                maxzoom: 24,
                scheme: 'xyz',
                tileSize: 512,
                attribution:
                  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>',
              },
            };
          }
        } else {
          return { ...result };
        }
      }, {});

    return {
      version: 8,
      glyphs: VECTOR_GLYPHS_URL,
      //glyphs: 'https://gsi-cyberjapan.github.io/optimal_bvmap/glyphs/{fontstack}/{range}.pbf',
      //sprite: 'https://gsi-cyberjapan.github.io/optimal_bvmap/sprite/std',
      sources: { ...sources, rasterdem: rasterdem },
      layers: [
        {
          id: 'features-placeholder',
          type: 'background',
          paint: { 'background-opacity': 0 },
        },
      ],
      sky: skyStyle,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileMaps, tileSignatures, peaksGeoJSON]);
  //console.log(mapRegion);
  return !restored ? null : (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { flexDirection: isLandscape ? 'row' : 'column' }]}>
        <View
          style={{
            height: '100%',
            width: windowWidth,
            justifyContent: 'center',
            zIndex: 0,
            elevation: 0,
          }}
        >
          <Loading visible={isLoading} text={t('common.processing')} />
          <HomeModalColorPicker
            color={colorPickerColor}
            modalVisible={visibleMapMemoColor}
            withAlpha={true}
            pressSelectColorOK={selectPenColor}
            pressSelectColorCancel={() => setVisibleMapMemoColor(false)}
          />
          <MapMemoView />
          <HomePopup />
          <HomePoiPopup />
          <HomeMeasureBanner />
          <HomeViewshedBanner />
          <HomeTerrain3DVistaBanner />
          <HomeVistaPeakLabels projector={peakProjector} />
          {/* Webは通常の回転・傾きを地図のコントロールで行うので、眺望中（高さ変更が要る）だけ出す */}
          {vistaActive && <HomeTerrain3DButtons top={230} left={10} />}
          <HomeTrackPointPopup />
          {isDrawLineVisible && <SvgView />}

          <div {...getRootProps({ className: 'dropzone' })}>
            <input {...getInputProps()} />

            <View style={styles.map} {...panResponder.panHandlers}>
              <Map
                //@ts-ignore
                mapLib={maplibregl}
                ref={mapViewRef as React.RefObject<MapRef>}
                {...(vistaActive ? {} : mapRegion)}
                style={{ width: '100%', height: '100%' }}
                //@ts-ignore
                mapStyle={mapStyle}
                maxPitch={vistaActive ? VISTA_MAX_PITCH_DEG : WEB_NORMAL_MAX_PITCH_DEG}
                onMove={(e) => onRegionChangeMapView(e.viewState)}
                onLoad={onMapLoad}
                cursor={currentDrawTool === 'PLOT_POINT' ? 'crosshair' : 'auto'}
                //interactiveLayerIds={interactiveLayerIds} //ラインだけに限定する場合
                //onMouseMove={onMouseMove}
                dragPan={mapGesturesEnabled && !vistaActive}
                touchZoomRotate={mapGesturesEnabled && !vistaActive}
                doubleClickZoom={mapGesturesEnabled && !vistaActive}
                dragRotate={mapGesturesEnabled && featureButton === 'NONE' && !vistaActive}
                touchPitch={isTerrainActive && mapGesturesEnabled && !vistaActive}
                scrollZoom={!vistaActive}
                keyboard={!vistaActive}
                sky={vistaActive ? VISTA_SKY_STYLE : skyStyle}
              >
                <HomeZoomLevel zoom={zoom} top={20} left={10} />

                <NavigationControl
                  // showZoomは作成時にしか効かないので、眺望の出入りで作り直す
                  key={vistaActive ? 'nav-vista' : 'nav'}
                  style={{ position: 'absolute', top: 50, left: 0 }}
                  position="top-left"
                  visualizePitch={true}
                  // 眺望中の地図のズームは視点を動かしてしまう。代わりに眺望のボタン列で画角を変える
                  showZoom={!vistaActive}
                />
                <HomeTerrainControl
                  top={150}
                  left={10}
                  isTerrainActive={isTerrainActive ?? false}
                  toggleTerrain={toggleTerrain ?? (() => {})}
                />
                <GeolocateControl
                  style={{ position: 'absolute', top: 180, left: 0 }}
                  trackUserLocation={true}
                  position="top-left"
                  onGeolocate={handleGeolocate}
                  onError={handleGeolocateError}
                  onTrackUserLocationEnd={handleTrackUserLocationEnd}
                />
                {/************** Member Location ****************** */}
                {isSynced &&
                  memberLocations.map((memberLocation) => (
                    <MemberMarker key={memberLocation.uid} memberLocation={memberLocation} />
                  ))}

                {/************** Track Focus Marker (軌跡サマリー連動) ****************** */}
                <HomeTrackFocusMarker />
                {/************** Measure (二点間距離測定) ****************** */}
                <HomeMeasure />
                {/************** Point Line Polygon ****************** */}
                {pointDataSet.map((d) => {
                  const layer = layers.find((v) => v.id === d.layerId);
                  if (!layer?.visible) return null;

                  return (
                    <Point
                      key={`${d.layerId}-${d.userId}`}
                      data={d.data as PointRecordType[]}
                      layer={layer!}
                      zoom={zoom}
                      // 地形表示（傾けた3D・眺望）では表示範囲で間引かない。boundsはmapRegion由来の
                      // 「注視点のまわりの矩形」で、傾けると奥の見えている範囲を含まない
                      // （眺望では注視点が40m先・z20になり、数百m四方に縮んで全ポイントが消えた）
                      bounds={isTerrainActive ? null : bounds}
                      selectedRecord={selectedRecord}
                      onDragEndPoint={onDragEndPoint}
                      currentDrawTool={currentDrawTool}
                      editPositionMode={editPositionMode}
                      editPositionLayer={editPositionLayer}
                      editPositionRecord={editPositionRecord}
                    />
                  );
                })}
                {lineDataSet.map((d) => {
                  const layer = layers.find((v) => v.id === d.layerId);
                  if (!layer?.visible) return null;

                  return (
                    <Line
                      key={`${d.layerId}-${d.userId}`}
                      data={d.data as LineRecordType[]}
                      layer={layer!}
                      zoom={zoom}
                      zIndex={101}
                      selectedRecord={selectedRecord}
                      zoomDecimal={zoomDecimal}
                    />
                  );
                })}

                {polygonDataSet.map((d) => {
                  const layer = layers.find((v) => v.id === d.layerId);
                  if (!layer?.visible) return null;

                  return (
                    <Polygon
                      key={`${d.layerId}-${d.userId}`}
                      data={d.data as PolygonRecordType[]}
                      layer={layer!}
                      zoom={zoom}
                      zIndex={100}
                    />
                  );
                })}
                {/************** Viewshed Preview (可視領域の仮表示) ****************** */}
                <HomeViewshedPreview />
                {exportPDFMode && <PDFArea pdfArea={pdfArea} />}
                <ScaleControl maxWidth={300} unit={'metric'} position="bottom-left" />
              </Map>
            </View>
          </div>

          {projectName !== undefined && (isShowingProjectButtons || isSettingProject) && <HomeProjectButtons />}
          {projectName === undefined || downloadMode ? null : (
            <HomeProjectLabel name={projectName} onPress={pressProjectLabel} />
          )}

          {downloadMode ? null : <HomeAccountButton />}

          {/* HomeInfoToolButtonを非表示にする
          {!(downloadMode || exportPDFMode || editPositionMode) && <HomeInfoToolButton />}
          */}
          {featureButton !== 'NONE' && featureButton !== 'MEMO' && <HomeDrawTools />}
          {featureButton === 'MEMO' && <HomeMapMemoTools />}
          {!(downloadMode || exportPDFMode || editPositionMode) && <HomeButtons />}
          {exportPDFMode && (
            <HomePDFButtons
              pdfTileMapZoomLevel={pdfTileMapZoomLevel}
              pdfOrientation={pdfOrientation as PaperOrientationType}
              pdfPaperSize={pdfPaperSize as PaperSizeType}
              pdfScale={pdfScale as ScaleType}
              onPress={pressExportPDF}
              pressPDFSettingsOpen={pressPDFSettingsOpen}
              pressBack={pressPDFBack}
            />
          )}
        </View>
      </View>

      <BottomSheet
        ref={setBottomSheetRefs}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={!isEditingRecord && !isEditingLayer && !isEditingMap}
        //native側と同じ理由（スクロールロック固着の迂回）。ハンドル操作は従来どおり
        enableContentPanningGesture={false}
        animatedIndex={animatedIndex}
        animateOnMount={true}
        onClose={() => onCloseBottomSheet(currentRouteName)}
        onChange={(index) => setIsBottomSheetOpen(index >= 0)}
        handleComponent={customHandle}
        enableDynamicSizing={false}
        overrideReduceMotion={ReduceMotion.Always}
        style={{ marginLeft: isLandscape ? '50%' : '0%', width: isLandscape ? '50%' : '100%' }}
      >
        <View
          style={{
            flex: 1,
          }}
        >
          <BottomSheetContent />
        </View>
      </BottomSheet>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
});
