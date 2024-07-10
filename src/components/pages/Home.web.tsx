import React, { useCallback, useEffect, useMemo, useContext } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';

import { COLOR, FUNC_LOGIN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { HomeButtons } from '../organisms/HomeButtons';
import { HomeDownloadButton } from '../organisms/HomeDownloadButton';
import HomeProjectLabel from '../organisms/HomeProjectLabel';
import { HomeAccountButton } from '../organisms/HomeAccountButton';
import Map, { AnyLayer, GeolocateControl, MapRef, NavigationControl, ScaleControl } from 'react-map-gl';
import maplibregl, { LayerSpecification, RequestParameters, ResponseCallback } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Point } from '../organisms/HomePoint';
import { CurrentMarker } from '../organisms/HomeCurrentMarker.web';
import { Polygon } from '../organisms/HomePolygon.web';
import { Line } from '../organisms/HomeLine';
import { TileMapType } from '../../types';
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
import { AppState } from '../../modules';
import { HomeContext } from '../../contexts/Home';
import { MemberMarker } from '../organisms/HomeMemberMarker';
import { useFeatureSelectionWeb } from '../../hooks/useFeatureSelectionWeb';
import { isPointRecordType } from '../../utils/Data';
import * as pmtiles from 'pmtiles';
import { MapMemoView } from '../organisms/HomeMapMemoView';
import { HomeMapMemoTools } from '../organisms/HomeMapMemoTools';
import { HomePopup } from '../organisms/HomePopup';
import { isInfoTool, isLineTool, isMapMemoDrawTool, isPointTool, isPolygonTool } from '../../utils/General';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet from '@gorhom/bottom-sheet';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { schemeSet3 } from 'd3-scale-chromatic';
import { PMTiles } from '../../utils/pmtiles';
import { PDFArea } from '../organisms/HomePDFArea';
import { HomePDFButtons } from '../organisms/HomePDFButtons';
import { HomeMapMemoColorPicker } from '../organisms/HomeMapMemoColorPicker';
import Dexie from 'dexie';
import { HomeInfoToolButton } from '../organisms/HomeInfoToolButton';

export default function HomeScreen() {
  const {
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    downloadMode,
    exportPDFMode,
    pdfArea,
    pdfOrientation,
    pdfPaperSize,
    pdfScale,
    pdfTileMapZoomLevel,
    downloadProgress,
    savedTileSize,
    restored,
    mapViewRef,
    gpsState,
    trackingState,
    currentLocation,
    zoom,
    tileMaps,
    isDownloading,
    featureButton,
    currentDrawTool,
    selectedRecord,
    isLoading,
    isSynced,
    memberLocations,
    isShowingProjectButtons,
    isSettingProject,
    projectName,
    pressProjectLabel,
    currentMapMemoTool,
    visibleMapMemoColor,
    penColor,
    currentInfoTool,
    editPositionMode,
    editPositionRecord,
    editPositionLayer,
    onRegionChangeMapView,
    onDrop,
    pressStopDownloadTiles,
    pressDeleteTiles,
    gotoMaps,
    gotoHome,
    onDragEndPoint,
    setVisibleMapMemoColor,
    selectPenColor,
    pressExportPDF,
    panResponder,
    isDrawLineVisible,
    mapMemoEditingLine,
    isPinch,
    onPressMapView,
    bottomSheetRef,
    onCloseBottomSheet,
    pressPDFSettingsOpen,
    isEditingRecord,
  } = useContext(HomeContext);
  //console.log('render Home');
  const layers = useSelector((state: AppState) => state.layers);
  const { mapRegion, windowWidth, isLandscape, windowHeight } = useWindow();
  const navigation = useNavigation();
  const { getRootProps, getInputProps } = useDropzone({ onDrop, noClick: true });
  const { selectFeatureWeb } = useFeatureSelectionWeb(mapViewRef.current);
  const snapPoints = useMemo(() => ['10%', '50%', '100%'], []);
  const animatedIndex = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(
        animatedIndex.value,
        [0, 1, 2],
        [(windowHeight - 20) / 10, (windowHeight - 20) / 2, windowHeight - 20]
      ),
    };
  });

  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  // データベースの定義
  const db = new Dexie('TilesDatabase');
  db.version(1).stores({
    tiles: 'url, blob', // Blobデータとして画像を保存
  });

  // IndexedDBに画像をBlobとして保存
  const saveImageToIndexedDB = async (url: string, blob: Blob) => {
    //@ts-ignore
    await db.tiles.put({ url, blob });
    //console.log('IndexedDBに保存', url);
  };

  const getLocalTile = async (url: string) => {
    //@ts-ignore
    const tile = await db.tiles.get(url);
    if (tile?.blob) {
      //console.log('IndexedDBから取得', url);
      return tile.blob.arrayBuffer(); // BlobをArrayBufferに変換
    }
    return null;
  };

  maplibregl.addProtocol('custom', (params: RequestParameters, callback: ResponseCallback<any>) => {
    getLocalTile(params.url).then((tileBuffer) => {
      if (tileBuffer) {
        callback(null, tileBuffer, null, null);
      } else {
        fetch(`https://${params.url.split('://')[2]}`)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`Tile fetch error: ${response.statusText}`);
            }
            const blob = await response.blob();
            saveImageToIndexedDB(params.url, blob); // Blobとして保存
            const arrayBuffer = await blob.arrayBuffer();
            callback(null, arrayBuffer, null, null);
          })
          .catch((e) => {
            callback(new Error(e.message));
          });
      }
    });
    return { cancel: () => {} };
  });

  //console.log('Home');
  const headerGotoMapsButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoMaps} />,
    [gotoMaps]
  );
  const headerGotoHomeButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoHome} />,
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
          <Button name="cog" onPress={pressPDFSettingsOpen} />
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

  const vectorStyle = async (file: PMTiles) => {
    const metadata = await file.getMetadata();
    const header = await file.getHeader();
    let layers_: LayerSpecification[] = [];
    const baseOpacity = 0.7;
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
      for (const [i, layer] of vector_layers.entries()) {
        layers_.push({
          id: layer.id + '_fill',
          type: 'fill',
          source: 'source',
          'source-layer': layer.id,
          paint: {
            'fill-color': schemeSet3[i % 12],
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], baseOpacity, baseOpacity - 0.15],
            'fill-outline-color': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              'hsl(0,100%,90%)',
              'rgba(0,0,0,0.2)',
            ],
          },
          filter: ['==', ['geometry-type'], 'Polygon'],
        });
        layers_.push({
          id: layer.id + '_stroke',
          type: 'line',
          source: 'source',
          'source-layer': layer.id,
          paint: {
            'line-color': schemeSet3[i % 12],
            'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0.5],
          },
          filter: ['==', ['geometry-type'], 'LineString'],
        });
        layers_.push({
          id: layer.id + '_point',
          type: 'circle',
          source: 'source',
          'source-layer': layer.id,
          paint: {
            'circle-color': schemeSet3[i % 12],
            'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 6, 5],
          },
          filter: ['==', ['geometry-type'], 'Point'],
        });
      }
    }

    return { styles: layers_, header: header };
  };

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
          <TouchableOpacity
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
          </TouchableOpacity>
        )}
      </View>
    );
  }, [isEditingRecord, onCloseBottomSheet]);

  useEffect(() => {
    if (!mapViewRef.current) return;
    const map = (mapViewRef.current as MapRef).getMap();

    for (const tileMap of tileMaps) {
      //console.log(tileMap);
      try {
        if (
          tileMap.url &&
          (tileMap.url.startsWith('pmtiles://') || (tileMap.url.includes('.pmtiles') && tileMap.isVector))
        ) {
          (async () => {
            const pmtile = new PMTiles(tileMap.url.replace('pmtiles://', ''));
            const { styles, header } = await vectorStyle(pmtile);

            let layerStyles;
            const url = tileMap.styleURL ?? tileMap.url.replace('pmtiles://', '').replace('.pmtiles', '.json');
            const response = await fetch(url);
            let hasStyleJson = false;
            if (response.ok) {
              const json = await response.json();
              if (json) {
                layerStyles = json.layers;
                hasStyleJson = true;
              } else {
                layerStyles = styles;
              }
            } else {
              layerStyles = styles;
            }
            if (!Array.isArray(layerStyles)) return;
            layerStyles.forEach((layerStyle: any, index: number) => {
              //console.log(layerStyle);
              layerStyle.id = `${tileMap.id}_${index}`;
              layerStyle.source = tileMap.id;
              if (layerStyle.paint['fill-opacity']) {
                layerStyle.paint['fill-opacity'] = layerStyle.paint['fill-opacity'] * (1 - tileMap.transparency);
              }
              if (!hasStyleJson) {
                const source = map.getSource(tileMap.id) as mapboxgl.VectorSource;
                source.minzoom = header.minZoom;
                source.maxzoom = header.maxZoom;
              }
              map.addLayer(layerStyle);
            });
          })();

          // 外部からレイヤーとそのスタイルを非同期に読み込む
        } else if (tileMap.url && tileMap.url.includes('.pbf') && tileMap.isVector) {
          (async () => {
            const url = tileMap.styleURL;
            if (!url) return;
            const response = await fetch(url);
            if (!response.ok) return;
            const json = await response.json();
            if (!json) return;
            const layerStyles = json.layers;
            //arrayかどうかチェック
            if (!Array.isArray(layerStyles)) return;

            layerStyles.forEach((layerStyle: any, index: number) => {
              layerStyle.id = `${tileMap.id}_${index}`;
              layerStyle.source = tileMap.id;
              if (layerStyle.paint['fill-opacity']) {
                layerStyle.paint['fill-opacity'] = layerStyle.paint['fill-opacity'] * (1 - tileMap.transparency);
              }

              //console.log(layerStyle);

              map.addLayer(layerStyle);
            });
          })();
        }
      } catch (e) {
        console.log(e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapViewRef.current, tileMaps]);

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
    map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });

    //二回目以降の設定
    map.on('style.load', function () {
      if (!map.getSource('rasterdem')) map.addSource('rasterdem', rasterdem);
      map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
    });
  };

  const mapStyle: string | mapboxgl.Style | undefined = useMemo(() => {
    const sources = tileMaps
      .slice(0)
      .reverse()
      .reduce((result: any, tileMap: TileMapType) => {
        if (tileMap.visible) {
          if (tileMap.url && (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles'))) {
            return {
              ...result,
              [tileMap.id]: {
                type: tileMap.isVector ? 'vector' : 'raster',
                url: tileMap.url.startsWith('pmtiles://') ? tileMap.url : 'pmtiles://' + tileMap.url,
                minzoom: tileMap.minimumZ,
                maxzoom: tileMap.maximumZ,
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
    //console.log('#&&&', sources);
    const layers_: AnyLayer[] = tileMaps
      .slice(0)
      .reverse()
      .map((tileMap: TileMapType) => {
        if (tileMap.visible) {
          if (
            tileMap.url &&
            (tileMap.url.startsWith('pmtiles://') ||
              tileMap.url.includes('.pmtiles') ||
              tileMap.url.includes('.pbf')) &&
            tileMap.isVector
          ) {
            return null;
          } else if (tileMap.url.endsWith('.pdf')) {
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
      sources: { ...sources, rasterdem: rasterdem },
      layers: [...layers_],
      terrain: {
        source: 'rasterdem',
        exaggeration: 1.5,
      },
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
          <Loading visible={isLoading} text="" />
          <HomeMapMemoColorPicker
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
              isInfoTool(currentInfoTool)
                ? panResponder.panHandlers
                : {})}
            >
              <Map
                //@ts-ignore
                mapLib={maplibregl}
                ref={mapViewRef as React.MutableRefObject<MapRef>}
                {...mapRegion}
                style={{ width: '100%', height: '100%' }}
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
              >
                <HomeZoomLevel zoom={zoom} top={20} left={10} />
                <NavigationControl
                  style={{ position: 'absolute', top: 50, left: 0 }}
                  position="top-left"
                  visualizePitch={true}
                />
                <GeolocateControl
                  style={{ position: 'absolute', top: 160, left: 0 }}
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
                  return (
                    layer!.visible && (
                      <Point
                        key={`${d.layerId}-${d.userId}`}
                        data={d.data}
                        layer={layer!}
                        zoom={zoom}
                        selectedRecord={selectedRecord}
                        onDragEndPoint={onDragEndPoint}
                        currentDrawTool={currentDrawTool}
                        editPositionMode={editPositionMode}
                        editPositionLayer={editPositionLayer}
                        editPositionRecord={editPositionRecord}
                      />
                    )
                  );
                })}
                {lineDataSet.map((d) => {
                  const layer = layers.find((v) => v.id === d.layerId);
                  return (
                    layer!.visible && (
                      <Line
                        key={`${d.layerId}-${d.userId}`}
                        data={d.data}
                        layer={layer!}
                        zoom={zoom}
                        zIndex={101}
                        selectedRecord={selectedRecord}
                      />
                    )
                  );
                })}

                {polygonDataSet.map((d) => {
                  const layer = layers.find((v) => v.id === d.layerId);
                  return (
                    layer!.visible && (
                      <Polygon key={`${d.layerId}-${d.userId}`} data={d.data} layer={layer!} zoom={zoom} zIndex={100} />
                    )
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
          {downloadMode && <HomeDownloadButton onPress={pressDeleteTiles} />}
          {exportPDFMode && (
            <HomePDFButtons
              pdfTileMapZoomLevel={pdfTileMapZoomLevel}
              pdfOrientation={pdfOrientation}
              pdfPaperSize={pdfPaperSize}
              pdfScale={pdfScale}
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
        onClose={onCloseBottomSheet}
        handleComponent={customHandle}
        style={{ marginLeft: isLandscape ? '50%' : '0%', width: isLandscape ? '50%' : '100%' }}
      >
        <Animated.View style={animatedStyle}>
          <SplitScreen />
        </Animated.View>
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
