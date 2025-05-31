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
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { SvgView } from '../organisms/HomeSvgView';
import SplitScreen from '../../routes/split';
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
import { InfoToolContext } from '../../contexts/InfoTool';
import { AppStateContext } from '../../contexts/AppState';
import { MemberMarker } from '../organisms/HomeMemberMarker';
import { useFeatureSelectionWeb } from '../../hooks/useFeatureSelectionWeb';
import { isPointRecordType } from '../../utils/Data';
import * as pmtiles from 'pmtiles';
import { MapMemoView } from '../organisms/HomeMapMemoView';
import { HomeMapMemoTools } from '../organisms/HomeMapMemoTools';
import { HomePopup } from '../organisms/HomePopup';
import { isLineTool, isMapMemoDrawTool, isPointTool, isPolygonTool } from '../../utils/General';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { ReduceMotion, useSharedValue } from 'react-native-reanimated';
import { PDFArea } from '../organisms/HomePDFArea';
import { HomePDFButtons } from '../organisms/HomePDFButtons';
import { HomeModalColorPicker } from '../organisms/HomeModalColorPicker';
//import Dexie from 'dexie';

import { HomeInfoToolButton } from '../organisms/HomeInfoToolButton';
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

  // InfoToolContext
  const { isInfoToolActive } = useContext(InfoToolContext);

  // AppStateContext
  const { restored, isLoading, gotoMaps, gotoHome, bottomSheetRef, onCloseBottomSheet, updatePmtilesURL } =
    useContext(AppStateContext);

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
    onPressMapView,
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
  const navigation = useNavigation();
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

  // // データベースの定義
  // const db = new Dexie('TilesDatabase');
  // db.version(1).stores({
  //   tiles: 'url, blob', // Blobデータとして画像を保存
  // });

  // // IndexedDBに画像をBlobとして保存
  // const saveImageToIndexedDB = async (url: string, blob: Blob) => {
  //   //@ts-ignore
  //   await db.tiles.put({ url, blob });
  //   console.log('IndexedDBに保存', url);
  // };

  // const getLocalTile = async (url: string) => {
  //   const tile = await db.tiles.get(url);
  //   if (tile?.blob) {
  //     console.log('IndexedDBから取得', url);
  //     return tile.blob.arrayBuffer(); // BlobをArrayBufferに変換
  //   }
  //   return null;
  // };

  // const loadFn: maplibregl.AddProtocolAction = (params: RequestParameters, callback: any) => {
  //   getLocalTile(params.url)
  //     .then((tileBuffer) => {
  //       if (tileBuffer) {
  //         callback(null, tileBuffer, null, null);
  //       } else {
  //         fetch(`https://${params.url.split('://')[2]}`)
  //           .then(async (response) => {
  //             if (!response.ok) {
  //               throw new Error(`Tile fetch error: ${response.statusText}`);
  //             }
  //             const blob = await response.blob();
  //             saveImageToIndexedDB(params.url, blob); // Blobとして保存
  //             const arrayBuffer = await blob.arrayBuffer();
  //             callback(null, arrayBuffer, null, null);
  //           })
  //           .catch((e) => {
  //             callback(new Error(e.message));
  //           });
  //       }
  //     })
  //     .catch((e) => {
  //       return { cancel: () => {} };
  //     });

  //   return { cancel: () => {} };
  // };

  // maplibregl.addProtocol('custom', loadFn);

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
  const headerGotoMapsButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <HeaderBackButton {...props_} labelVisible={false} onPress={gotoMaps} />
    ),
    [gotoMaps]
  );
  const headerGotoHomeButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <HeaderBackButton {...props_} labelVisible={false} onPress={gotoHome} />
    ),
    [gotoHome]
  );
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

  const getStyleFromLocal = useCallback(async (tileMap: TileMapType) => {
    const style = (await db.pmtiles.get(tileMap.id))?.style;
    if (style) {
      const layerStyles = JSON.parse(style).layers as LineLayerSpecification[] | FillLayerSpecification[];
      if (Array.isArray(layerStyles)) return layerStyles;
    }
    return [];
  }, []);

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

  const updateVectorStyle = useCallback(
    async (tileMap: TileMapType) => {
      if (!mapViewRef.current) return;
      const map = (mapViewRef.current as MapRef).getMap();
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
          return;
        }
      }

      layerStyles.forEach(
        (layerStyle: LineLayerSpecification | FillLayerSpecification | BackgroundLayerSpecification, index: number) => {
          layerStyle.id = `${tileMap.id}_${index}`;
          if (layerStyle.type !== 'background' && layerStyle.source) {
            layerStyle.source = `${tileMap.id}`;
          }

          if (layerStyle.type === 'fill' && layerStyle.paint) {
            if (layerStyle.paint['fill-opacity'] && typeof layerStyle.paint['fill-opacity'] === 'number') {
              layerStyle.paint['fill-opacity'] = layerStyle.paint['fill-opacity'] * (1 - tileMap.transparency);
            } else {
              layerStyle.paint['fill-opacity'] = 1 - tileMap.transparency;
            }
          } else if (layerStyle.type === 'background' && layerStyle.paint) {
            if (layerStyle.paint['background-opacity'] && typeof layerStyle.paint['background-opacity'] === 'number') {
              layerStyle.paint['background-opacity'] =
                layerStyle.paint['background-opacity'] * (1 - tileMap.transparency);
            } else {
              layerStyle.paint['background-opacity'] = 1 - tileMap.transparency;
            }
          }
          map.addLayer(layerStyle);
        }
      );
    },

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mapViewRef.current]
  );

  useEffect(() => {
    (async () => {
      //起動時にpmtilesのURLを更新
      await updatePmtilesURL();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      for (const tileMap of tileMaps) {
        try {
          if (
            tileMap.url &&
            (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles') || tileMap.url.includes('.pbf'))
          ) {
            if (tileMap.isVector) await updateVectorStyle(tileMap);
          }
        } catch (e) {
          console.log(e);
        }
      }
    })();
  }, [tileMaps, updateVectorStyle, updatePmtilesURL]);

  useEffect(() => {
    if (isPointRecordType(selectedRecord?.record)) return;
    selectFeatureWeb(selectedRecord);
  }, [selectFeatureWeb, selectedRecord]);

  useEffect(() => {
    //console.log('#useeffect3');
    if (downloadMode) {
      navigation.setOptions({
        title: t('Home.navigation.download', '地図のダウンロード'),
        headerShown: true,
        headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerGotoMapsButton(props_),
        headerRight: () => headerRightButton(),
      });
    } else if (exportPDFMode) {
      navigation.setOptions({
        title: t('Home.navigation.exportPDF', 'PDFの出力'),
        headerShown: true,
        headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerGotoHomeButton(props_),
        headerRight: () => headerRightButton(),
      });
    } else {
      navigation.setOptions({ headerShown: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadMode, exportPDFMode, isDownloading, downloadProgress, savedTileSize]);

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

  const onMapLoad = (evt: any) => {
    //最初のロードだけ呼ばれる
    const map = evt.target;
    map.touchPitch.enable();
    if (!map.getSource('rasterdem')) map.addSource('rasterdem', rasterdem);

    //二回目以降の設定
    map.on('style.load', function () {
      if (!map.getSource('rasterdem')) map.addSource('rasterdem', rasterdem);
      map.setTerrain({ source: 'rasterdem', exaggeration: 1 });
    });
  };

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
          } else if (tileMap.url.endsWith('.pdf') || tileMap.url.startsWith('pdf://')) {
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

    const layers_: AnyLayer[] = tileMaps
      .slice(0)
      .reverse()
      .map((tileMap: TileMapType) => {
        if (tileMap.visible && !tileMap.isGroup) {
          if (
            tileMap.url &&
            (tileMap.url.startsWith('pmtiles://') ||
              tileMap.url.includes('.pmtiles') ||
              tileMap.url.includes('.pbf')) &&
            tileMap.isVector
          ) {
            return null;
          } else if (tileMap.url) {
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
        } else {
          return null;
        }
      })
      .filter((v): v is AnyLayer => !!v);

    return {
      version: 8,
      glyphs: 'https://map.ecoris.info/glyphs/{fontstack}/{range}.pbf',
      //glyphs: 'https://gsi-cyberjapan.github.io/optimal_bvmap/glyphs/{fontstack}/{range}.pbf',
      //sprite: 'https://gsi-cyberjapan.github.io/optimal_bvmap/sprite/std',
      sources: { ...sources, rasterdem: rasterdem },
      layers: [...layers_],
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

            <View
              style={styles.map}
              {...(isMapMemoDrawTool(currentMapMemoTool) ||
              isPolygonTool(currentDrawTool) ||
              isLineTool(currentDrawTool) ||
              isPointTool(currentDrawTool) ||
              currentDrawTool === 'SELECT' ||
              currentDrawTool === 'DELETE_POINT' ||
              isInfoToolActive
                ? panResponder.panHandlers
                : {})}
            >
              <Map
                //@ts-ignore
                mapLib={maplibregl}
                ref={mapViewRef as React.MutableRefObject<MapRef>}
                {...mapRegion}
                style={{ width: '100%', height: '100%' }}
                //@ts-ignore
                mapStyle={mapStyle}
                maxPitch={85}
                onMove={(e) => onRegionChangeMapView(e.viewState)}
                onLoad={onMapLoad}
                cursor={currentDrawTool === 'PLOT_POINT' ? 'crosshair' : 'auto'}
                //interactiveLayerIds={interactiveLayerIds} //ラインだけに限定する場合
                onClick={onPressMapView}
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

          {isShowingProjectButtons && <HomeProjectButtons />}
          {projectName === undefined || downloadMode ? null : (
            <HomeProjectLabel name={projectName} onPress={pressProjectLabel} />
          )}

          {!FUNC_LOGIN || downloadMode ? null : <HomeAccountButton />}

          {!(downloadMode || exportPDFMode || editPositionMode) && <HomeInfoToolButton />}
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
        <BottomSheetView
          style={{
            flex: 1,
          }}
        >
          <SplitScreen />
        </BottomSheetView>
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
