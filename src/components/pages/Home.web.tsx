import React, { useCallback, useEffect, useMemo, useContext } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import type { PointRecordType, LineRecordType, PolygonRecordType } from '../../types';

import { COLOR, FUNC_LOGIN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { HomeButtons } from '../organisms/HomeButtons';
import HomeProjectLabel from '../organisms/HomeProjectLabel';
import { HomeAccountButton } from '../organisms/HomeAccountButton';
import Map, { AnyLayer, GeolocateControl, MapRef, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import maplibregl, {
  BackgroundLayerSpecification,
  FillLayerSpecification,
  LayerSpecification,
  LineLayerSpecification,
  RequestParameters,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Point } from '../organisms/HomePoint';
import { CurrentMarker } from '../organisms/HomeCurrentMarker.web';
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
import { useDropzone } from 'react-dropzone';
import { useWindow } from '../../hooks/useWindow';
import { HomeDrawTools } from '../organisms/HomeDrawTools';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { MapViewContext } from '../../contexts/MapView';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { SVGDrawingContext } from '../../contexts/SVGDrawing';
import { PDFExportContext } from '../../contexts/PDFExport';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { ProjectContext } from '../../contexts/Project';
import { TileManagementContext } from '../../contexts/TileManagement';
import { MapMemoContext } from '../../contexts/MapMemo';
import { DataSelectionContext } from '../../contexts/DataSelection';
import { AppStateContext } from '../../contexts/AppState';
import { MemberMarker } from '../organisms/HomeMemberMarker';
import { useFeatureSelectionWeb } from '../../hooks/useFeatureSelectionWeb';
import { isPointRecordType } from '../../utils/Data';
import * as pmtiles from 'pmtiles';
import { MapMemoView } from '../organisms/HomeMapMemoView';
import { HomeMapMemoTools } from '../organisms/HomeMapMemoTools';
import { HomePopup } from '../organisms/HomePopup';
import { isMapMemoDrawTool } from '../../utils/General';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet from '@gorhom/bottom-sheet';
import { ReduceMotion, useSharedValue } from 'react-native-reanimated';
import { PDFArea } from '../organisms/HomePDFArea';
import { HomePDFButtons } from '../organisms/HomePDFButtons';
import { HomeModalColorPicker } from '../organisms/HomeModalColorPicker';
//import Dexie from 'dexie';

// import { HomeInfoToolButton } from '../organisms/HomeInfoToolButton';
import { encode as fastPngEncode } from 'fast-png';
import { tileToWebMercator } from '../../utils/Tile';
import { fromBlob } from 'geotiff';
import { db } from '../../utils/db';
import { HomeTerrainControl } from '../organisms/HomeTerrainControl';
import { Pressable } from '../atoms/Pressable';

export default function HomeScreen() {
  // TileManagementContext
  const { downloadMode, tileMaps, savedTileSize, isDownloading, downloadProgress, pressStopDownloadTiles } =
    useContext(TileManagementContext);

  // MapMemoContext
  const { currentMapMemoTool, visibleMapMemoColor, penColor, setVisibleMapMemoColor, selectPenColor } =
    useContext(MapMemoContext);

  // DataSelectionContext
  const { pointDataSet, lineDataSet, polygonDataSet, selectedRecord, isEditingRecord } =
    useContext(DataSelectionContext);

  // AppStateContext
  const { restored, isLoading, bottomSheetRef, onCloseBottomSheet, updatePmtilesURL } = useContext(AppStateContext);

  // SVGDrawingContext
  const { mapMemoEditingLine } = useContext(SVGDrawingContext);

  // MapViewContext
  const {
    mapViewRef,
    gpsState,
    currentLocation,
    zoom,
    onRegionChangeMapView,
    onDrop,
    panResponder,
    isDrawLineVisible,
    isPinch,
    isTerrainActive,
    toggleTerrain,
  } = useContext(MapViewContext);

  // DrawingToolsContext
  const { featureButton, currentDrawTool, onDragEndPoint, isEditingLine, editingLineId } =
    useContext(DrawingToolsContext);

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
  const { trackingState, memberLocations, editPositionMode, editPositionRecord, editPositionLayer } =
    useContext(LocationTrackingContext);

  // ProjectContext
  const { isSynced, isShowingProjectButtons, isSettingProject, projectName, pressProjectLabel } =
    useContext(ProjectContext);
  //console.log('render Home');
  const layers = useSelector((state: RootState) => state.layers);

  const { mapRegion, windowWidth, isLandscape } = useWindow();
  const { getRootProps, getInputProps } = useDropzone({ onDrop, noClick: true });
  const { selectFeatureWeb } = useFeatureSelectionWeb(mapViewRef.current);
  const snapPoints = useMemo(() => ['10%', '50%', '100%'], []);
  const animatedIndex = useSharedValue(0);

  const skyStyle = {
    'sky-color': '#79bffc',
    'sky-horizon-blend': 0.6,
    'horizon-color': '#f0f8ff',
    'horizon-fog-blend': 1,
    'fog-color': '#034580',
    'fog-ground-blend': 0.85,
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

  //console.log('Home');
  const headerRightButton = useCallback(() => {
    if (isDownloading) {
      return (
        <View style={styles.headerRight}>
          <Button name="pause" onPress={pressStopDownloadTiles} backgroundColor={COLOR.DARKRED} />
          <View style={{ width: 40, alignItems: 'flex-end' }}>
            <Text style={{ marginHorizontal: 0 }}>{downloadProgress}%</Text>
          </View>
        </View>
      );
    } else if (exportPDFMode) {
      return (
        <View style={styles.headerRight}>
          <Button name="cog" onPress={pressPDFSettingsOpen} labelText={t('Home.label.settings')} />
        </View>
      );
    } else {
      return (
        <View style={styles.headerRight}>
          <Text style={{ marginHorizontal: 10 }}>{savedTileSize}MB</Text>
        </View>
      );
    }
  }, [downloadProgress, isDownloading, exportPDFMode, pressPDFSettingsOpen, pressStopDownloadTiles, savedTileSize]);

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
        {!isEditingRecord && (
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
            onPress={onCloseBottomSheet}
          >
            <Text style={{ fontSize: 40, color: COLOR.GRAY4, lineHeight: 35 }}>×</Text>
          </Pressable>
        )}
      </View>
    );
  }, [isEditingRecord, onCloseBottomSheet]);

  // ========== レイヤースタイル関連の処理 ==========

  /**
   * PMTilesファイルのメタデータからデフォルトのベクタースタイルを生成
   * @param tileMap 対象のタイルマップ
   * @returns デフォルトのレイヤースタイル配列
   */
  const getDefaultStyle = async (tileMap: TileMapType) => {
    try {
      const pmtile = new pmtiles.PMTiles(tileMap.url.replace('pmtiles://', ''));
      const metadata: any = await pmtile.getMetadata();

      //const header = await pmtile.getHeader();
      let layers_: LayerSpecification[] = [];

      if (metadata.type !== 'baselayer') {
        layers_ = [];
      }

      let vector_layers: LayerSpecification[];
      if (metadata.json) {
        const j = JSON.parse(metadata.json);
        vector_layers = j.vector_layers;
      } else {
        vector_layers = metadata.vector_layers;
      }

      if (vector_layers) {
        for (const layer of vector_layers) {
          layers_.push({
            id: layer.id + '_fill',
            type: 'fill',
            source: 'source',
            'source-layer': layer.id,
            paint: {
              'fill-color': '#00FF00',
              'fill-outline-color': '#000000',
              'fill-opacity': 0.5,
            },
            filter: ['==', ['geometry-type'], 'Polygon'],
          });
          layers_.push({
            id: layer.id + '_stroke',
            type: 'line',
            source: 'source',
            'source-layer': layer.id,
            paint: {
              'line-color': '#0000FF',
              'line-width': 1,
            },
            filter: ['==', ['geometry-type'], 'LineString'],
          });
          layers_.push({
            id: layer.id + '_point',
            type: 'circle',
            source: 'source',
            'source-layer': layer.id,
            paint: {
              'circle-color': '#FF0000',
              'circle-radius': 3,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#FFFFFF',
            },
            filter: ['==', ['geometry-type'], 'Point'],
          });
        }
      }
      //console.log('layers_', layers_);
      return layers_ as LineLayerSpecification[] | FillLayerSpecification[];
    } catch (e) {
      console.log(e);
      return [];
    }
  };

  /**
   * ローカルストレージ（IndexedDB）からベクタースタイルを取得
   * @param tileMap 対象のタイルマップ
   * @returns レイヤースタイル配列
   */
  const getStyleFromLocal = useCallback(async (tileMap: TileMapType) => {
    const style = (await db.pmtiles.get(tileMap.id))?.style;
    if (style) {
      const layerStyles = JSON.parse(style).layers as LineLayerSpecification[] | FillLayerSpecification[];
      if (Array.isArray(layerStyles)) return layerStyles;
    }
    return [];
  }, []);

  /**
   * 外部URLからベクタースタイルを取得
   * @param tileMap 対象のタイルマップ
   * @returns レイヤースタイル配列
   */
  const getStyleFromURL = useCallback(async (tileMap: TileMapType) => {
    const url = tileMap.styleURL;
    if (!url) return [];
    const response = await fetch(url);
    if (response.ok) {
      const json = await response.json();
      if (json) {
        const layerStyles = json.layers;
        if (Array.isArray(layerStyles)) return layerStyles as LineLayerSpecification[] | FillLayerSpecification[];
      }
    }
    return [];
  }, []);

  // ========== レイヤー生成関数 ==========

  /**
   * ラスタータイル用のレイヤー定義を生成（同期処理）
   * @param tileMap 対象のタイルマップ
   * @returns ラスターレイヤー定義またはnull
   */
  const getRasterLayer = useCallback((tileMap: TileMapType): AnyLayer | null => {
    if (tileMap.url) {
      return {
        id: tileMap.id,
        type: 'raster',
        source: tileMap.id,
        minzoom: tileMap.minimumZ,
        maxzoom: 24,
        paint: { 'raster-opacity': 1 - (tileMap.transparency !== undefined ? tileMap.transparency : 0) },
      } as AnyLayer;
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
   * ヒルシェードレイヤーの定義を生成
   * @param tileMap 対象のタイルマップ
   * @returns ヒルシェードレイヤー定義
   */
  const getHillshadeLayer = useCallback((tileMap: TileMapType): AnyLayer | AnyLayer[] => {
    // transparencyが未定義の場合は0（不透明）をデフォルトとする
    const transparency = tileMap.transparency ?? 0;
    const opacity = 1 - transparency;

    // グレースケールの陰影図として設定（透明度を適用）
    const shadowColor = `rgba(0, 0, 0, ${opacity})`; // 黒
    const highlightColor = `rgba(255, 255, 255, ${opacity})`; // 白
    const accentColor = `rgba(0, 0, 0, ${opacity})`; // 黒

    // 背景レイヤーとヒルシェードレイヤーの2つを返す
    return [
      // ヒルシェードレイヤー
      {
        id: `${tileMap.id}_0`,
        type: 'hillshade' as const,
        source: tileMap.id,
        minzoom: tileMap.minimumZ || 2,
        maxzoom: tileMap.maximumZ || 17,
        layout: {
          visibility: 'visible' as const,
        },
        paint: {
          'hillshade-shadow-color': shadowColor,
          'hillshade-highlight-color': highlightColor,
          'hillshade-accent-color': accentColor,
          'hillshade-exaggeration': 0.8,
          'hillshade-illumination-anchor': 'viewport' as const,
        },
      } as AnyLayer,
    ];
  }, []);

  /**
   * ベクタータイル用のレイヤー定義を生成（非同期処理）
   * スタイル情報を取得し、透過度を適用して返す
   * @param tileMap 対象のタイルマップ
   * @returns ベクターレイヤー定義の配列
   */
  const getVectorLayers = useCallback(
    async (tileMap: TileMapType) => {
      let layerStyles: LineLayerSpecification[] | FillLayerSpecification[] | BackgroundLayerSpecification[] = [];
      if (tileMap.styleURL && tileMap.styleURL.startsWith('style://')) {
        layerStyles = await getStyleFromLocal(tileMap);
      } else if (tileMap.styleURL && tileMap.styleURL !== '') {
        layerStyles = await getStyleFromURL(tileMap);
      }
      //Pmtilesのスタイルがない場合はデフォルトスタイルを取得.
      //pbfの場合はメタデータの取得方法が異なるため、デフォルトスタイルを取得しない
      if (layerStyles.length === 0) {
        if (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles')) {
          layerStyles = await getDefaultStyle(tileMap);
        } else {
          return [];
        }
      }
      //レイヤのIDをtileMapのIDとインデックスで設定
      //スタイルの透過設定とレイヤの透過設定を統合
      const updatedLayers = layerStyles.map(
        (layerStyle: LineLayerSpecification | FillLayerSpecification | BackgroundLayerSpecification, index: number) => {
          const newLayerStyle = { ...layerStyle };
          newLayerStyle.id = `${tileMap.id}_${index}`;
          if (newLayerStyle.type !== 'background' && newLayerStyle.source) {
            newLayerStyle.source = `${tileMap.id}`;
          }

          if (newLayerStyle.type === 'fill' && newLayerStyle.paint) {
            if (
              newLayerStyle.paint['fill-opacity'] !== undefined &&
              typeof newLayerStyle.paint['fill-opacity'] === 'number'
            ) {
              newLayerStyle.paint['fill-opacity'] = newLayerStyle.paint['fill-opacity'] * (1 - tileMap.transparency);
            } else {
              newLayerStyle.paint['fill-opacity'] = 1 - tileMap.transparency;
            }
          } else if (newLayerStyle.type === 'background' && newLayerStyle.paint) {
            if (
              newLayerStyle.paint['background-opacity'] &&
              typeof newLayerStyle.paint['background-opacity'] === 'number'
            ) {
              newLayerStyle.paint['background-opacity'] =
                newLayerStyle.paint['background-opacity'] * (1 - tileMap.transparency);
            } else {
              newLayerStyle.paint['background-opacity'] = 1 - tileMap.transparency;
            }
          }
          return newLayerStyle;
        }
      );

      return updatedLayers;
    },
    [getStyleFromLocal, getStyleFromURL]
  );

  /**
   * タイルマップから適切なレイヤー定義を生成する統一インターフェース
   * ベクタータイルとラスタータイルを自動判別して処理
   * @param tileMap 対象のタイルマップ
   * @returns レイヤー定義（単一または配列）またはnull
   */
  const getTileMapLayers = useCallback(
    async (tileMap: TileMapType): Promise<AnyLayer | AnyLayer[] | null> => {
      // 非表示またはグループの場合はスキップ
      if (!tileMap.visible || tileMap.isGroup) {
        return null;
      }

      // ヒルシェードタイルの判定と処理
      if (tileMap.url && tileMap.url.startsWith('hillshade://')) {
        return getHillshadeLayer(tileMap);
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
    [getRasterLayer, getVectorLayers, getHillshadeLayer]
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
    const dynamicLayers = layersResult.flat().filter((layer): layer is AnyLayer => !!layer);

    // 各レイヤーをマップに追加（features-placeholderの前に挿入）
    dynamicLayers.forEach((layer: AnyLayer) => {
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

    // isTerrainActiveの状態に基づいて地形設定を復元
    if (isTerrainActive) {
      map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
    } else {
      map.setTerrain(null);
    }
  }, [tileMaps, getTileMapLayers, mapViewRef, isTerrainActive]);

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


  // 地理院のraster-dem
  const maptilerdem = {
    maxzoom: 12,
    minzoom: 0,
    tileSize: 256,
    //tiles: ['https://optgeo.github.io/10b512-7-113-50/zxy/{z}/{x}/{y}.webp'],
    //tiles: ['https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png'],
    tiles: ['https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=' + maptilerKey],
    type: 'raster-dem',
  };

  const rasterdem = maptilerdem;

  // ========== マップイベントハンドラー ==========

  /**
   * マップ初回ロード時の処理
   * 地形データソースの設定とレイヤーの初期化
   */
  const onMapLoad = useCallback(
    async (evt: any) => {
      const map = evt.target;
      map.touchPitch.enable();

      // 地形データソースの追加
      if (!map.getSource('rasterdem')) {
        map.addSource('rasterdem', rasterdem);
      }

      // ユーザーの設定に合わせて地形表示を初期化
      if (isTerrainActive) {
        map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
      } else {
        map.setTerrain(null);
      }

      // 初回ロード時にレイヤーを追加（useEffectが実行される前に確実に追加）
      if (mapViewRef.current) {
        await addDynamicLayers();
      }
    },
    [rasterdem, isTerrainActive, addDynamicLayers, mapViewRef]
  );

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
          if (tileMap.url && (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles'))) {
            return {
              ...result,
              [tileMap.id]: {
                type: tileMap.isVector ? 'vector' : 'raster',
                url: tileMap.url.startsWith('pmtiles://') ? tileMap.url : 'pmtiles://' + tileMap.url,
                minzoom: tileMap.minimumZ,
                maxzoom: tileMap.overzoomThreshold,
                scheme: 'xyz',
                tileSize: tileMap.isVector ? 512 : 256,
                attribution: tileMap.attribution,
              },
            };
          } else if (tileMap.url.includes('.pbf')) {
            return {
              ...result,
              [tileMap.id]: {
                type: 'vector',
                tiles: [tileMap.url],
                minzoom: tileMap.minimumZ,
                maxzoom: tileMap.maximumZ,
                scheme: 'xyz',
                tileSize: 512,
                attribution: tileMap.attribution,
              },
            };
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
          } else if (tileMap.url.startsWith('hillshade://')) {
            return {
              ...result,
              [tileMap.id]: {
                type: 'raster-dem' as const,
                tiles: [tileMap.url.replace('hillshade://', '')],
                tileSize: tileMap.tileSize || 256,
                minzoom: tileMap.minimumZ || 2,
                maxzoom: tileMap.maximumZ || 14,
                encoding: 'terrarium' as const,
                attribution: tileMap.attribution,
              },
            };
          } else if (tileMap.url) {
            return {
              ...result,
              [tileMap.id]: {
                type: 'raster',
                //tiles: ['custom://' + tileMap.url], //キャッシュを使う場合
                tiles: [tileMap.url],
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
                maxzoom: 24,
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
      glyphs: 'https://map.ecoris.info/glyphs/{fontstack}/{range}.pbf',
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
  }, [tileMaps]);
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
            color={penColor}
            modalVisible={visibleMapMemoColor}
            withAlpha={true}
            pressSelectColorOK={selectPenColor}
            pressSelectColorCancel={() => setVisibleMapMemoColor(false)}
          />
          <MapMemoView />
          <HomePopup />
          {isDrawLineVisible && <SvgView />}

          <div {...getRootProps({ className: 'dropzone' })}>
            <input {...getInputProps()} />

            <View style={styles.map} {...panResponder.panHandlers}>
              <Map
                //@ts-ignore
                mapLib={maplibregl}
                ref={mapViewRef as React.RefObject<MapRef>}
                {...mapRegion}
                style={{ width: '100%', height: '100%' }}
                //@ts-ignore
                mapStyle={mapStyle}
                maxPitch={85}
                onMove={(e) => onRegionChangeMapView(e.viewState)}
                onLoad={onMapLoad}
                cursor={currentDrawTool === 'PLOT_POINT' ? 'crosshair' : 'auto'}
                //interactiveLayerIds={interactiveLayerIds} //ラインだけに限定する場合
                //onMouseMove={onMouseMove}
                dragPan={
                  isPinch ||
                  (isMapMemoDrawTool(currentMapMemoTool) && mapMemoEditingLine.length === 0) ||
                  (currentMapMemoTool === 'NONE' &&
                    (currentDrawTool === 'NONE' || currentDrawTool === 'MOVE' || currentDrawTool.includes('INFO')))
                }
                touchZoomRotate={featureButton === 'NONE'}
                dragRotate={featureButton === 'NONE'}
                sky={skyStyle}
              >
                <HomeZoomLevel zoom={zoom} top={20} left={10} />

                <NavigationControl
                  style={{ position: 'absolute', top: 50, left: 0 }}
                  position="top-left"
                  visualizePitch={true}
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
                />
                {/************** Member Location ****************** */}
                {isSynced &&
                  memberLocations.map((memberLocation) => (
                    <MemberMarker key={memberLocation.uid} memberLocation={memberLocation} />
                  ))}

                {/************** Current Marker ****************** */}
                {(gpsState !== 'off' || trackingState !== 'off') && currentLocation && (
                  <CurrentMarker
                    currentLocation={currentLocation}
                    //angle={magnetometer && northUp ? magnetometer!.trueHeading : 0}
                  />
                )}

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

                  // HomeContextからisEditingLine, editingLineIdを取得
                  // ここではuseContext(HomeContext)のスコープ内なので直接参照可能
                  // isEditingLineがtrueのときのみeditingLineIdを渡す
                  return (
                    <Line
                      key={`${d.layerId}-${d.userId}`}
                      data={d.data as LineRecordType[]}
                      layer={layer!}
                      zoom={zoom}
                      zIndex={101}
                      selectedRecord={selectedRecord}
                      editingLineId={isEditingLine ? editingLineId : undefined}
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
                {exportPDFMode && <PDFArea pdfArea={pdfArea} />}
                <ScaleControl maxWidth={300} unit={'metric'} position="bottom-left" />
              </Map>
            </View>
          </div>

          {projectName !== undefined && (isShowingProjectButtons || isSettingProject) && <HomeProjectButtons />}
          {projectName === undefined || downloadMode ? null : (
            <HomeProjectLabel name={projectName} onPress={pressProjectLabel} />
          )}

          {!FUNC_LOGIN || downloadMode ? null : <HomeAccountButton />}

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
            />
          )}
        </View>
      </View>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        animatedIndex={animatedIndex}
        animateOnMount={true}
        onClose={onCloseBottomSheet}
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

  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: 10,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
