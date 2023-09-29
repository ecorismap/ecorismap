import React, { useCallback, useEffect, useMemo, useContext } from 'react';
import { StyleSheet, View, Text } from 'react-native';

// @ts-ignore
import ScaleBar from 'react-native-scale-bar';
import { COLOR, FUNC_LOGIN, FUNC_MAPBOX } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { HomeButtons } from '../organisms/HomeButtons';
import { HomeDownloadButton } from '../organisms/HomeDownloadButton';
import HomeProjectLabel from '../organisms/HomeProjectLabel';
import { HomeAccountButton } from '../organisms/HomeAccountButton';
import Map, { GeolocateControl, MapRef, Layer, NavigationControl } from 'react-map-gl';
import maplibregl from 'maplibre-gl';
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
import { HomeZoomButton } from '../organisms/HomeZoomButton';
import { useFeatureSelectionWeb } from '../../hooks/useFeatureSelectionWeb';
import { HomeCommonTools } from '../organisms/HomeCommonTools';
import { isPointRecordType } from '../../utils/Data';
import * as pmtiles from 'pmtiles';
import { MapMemoView } from '../organisms/HomeMapMemoView';
import { ModalColorPicker } from '../organisms/ModalColorPicker';
import { HomeMapMemoTools } from '../organisms/HomeMapMemoTools';
import { AnyLayer } from 'react-map-gl/dist/esm/types';
import { HomePopup } from '../organisms/HomePopup';
import { isMapMemoDrawTool } from '../../utils/General';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet from '@gorhom/bottom-sheet';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export default function HomeScreen() {
  const {
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    isDownloadPage,
    downloadProgress,
    savedTileSize,
    restored,
    mapViewRef,
    gpsState,
    trackingState,
    currentLocation,
    zoom,
    zoomDecimal,
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
    onRegionChangeMapView,
    onDrop,
    pressStopDownloadTiles,
    pressDeleteTiles,
    gotoMaps,
    pressZoomIn,
    pressZoomOut,
    onDragEndPoint,
    setVisibleMapMemoColor,
    selectPenColor,
    panResponder,
    isDrawLineVisible,
    mapMemoEditingLine,
    isPinch,
    onPressMapView,
    bottomSheetRef,
    onCloseBottomSheet,
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

  // const hoverFeatureId = useRef<
  //   | {
  //       source: string;
  //       id: number;
  //     }
  //   | undefined
  // >();
  // const lineAndPolygonLayerIds = useMemo(() => {
  //   const lineIds = lineDataSet.flatMap((d) => {
  //     const layer = layers.find((v) => v.id === d.layerId);
  //     return d.data.length > 0 && layer!.visible ? `${d.layerId}_${d.userId ?? ''}` : [];
  //   });
  //   const polygonIds = polygonDataSet.flatMap((d) => {
  //     const layer = layers.find((v) => v.id === d.layerId);
  //     return d.data.length > 0 && layer!.visible ? `${d.layerId}_${d.userId ?? ''}` : [];
  //   });
  //   return [...lineIds, ...polygonIds];
  // }, [layers, lineDataSet, polygonDataSet]);

  // const lineLayerIds = useMemo(
  //   () =>
  //     lineDataSet.flatMap((d) => {
  //       const layer = layers.find((v) => v.id === d.layerId);
  //       return d.data.length > 0 && layer!.visible ? `${d.layerId}_${d.userId ?? ''}` : [];
  //     }),
  //   [layers, lineDataSet]
  // );
  // const polygonLayerIds = useMemo(
  //   () =>
  //     polygonDataSet.flatMap((d) => {
  //       const layer = layers.find((v) => v.id === d.layerId);
  //       d.data.length > 0 && layer!.visible ? `${d.layerId}_${d.userId}` : [];
  //     }),
  //   [layers, polygonDataSet]
  // );

  // const interactiveLayerIds = useMemo(() => {
  //   //console.log(featureButton);
  //   if (featureButton === 'POINT') {
  //     return undefined;
  //   } else if (featureButton === 'LINE') {
  //     if (lineTool === 'SELECT' || lineTool === 'NONE') {
  //       return lineLayerIds;
  //     } else {
  //       return undefined;
  //     }
  //   } else {
  //     return lineAndPolygonLayerIds;
  //   }
  // }, [featureButton, lineAndPolygonLayerIds, lineLayerIds, lineTool]);

  //console.log('Home');
  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoMaps} />,
    [gotoMaps]
  );
  const headerRightButton = useCallback(
    () =>
      isDownloading ? (
        <View style={styles.headerRight}>
          <Button name="pause" onPress={pressStopDownloadTiles} backgroundColor={COLOR.DARKRED} />

          <Text style={{ marginHorizontal: 10 }}>{downloadProgress}%</Text>
        </View>
      ) : (
        <View style={styles.headerRight}>
          <Text style={{ marginHorizontal: 10 }}>{savedTileSize}MB</Text>
        </View>
      ),
    [downloadProgress, isDownloading, pressStopDownloadTiles, savedTileSize]
  );

  useEffect(() => {
    if (!mapViewRef.current) return;
    const map = (mapViewRef.current as MapRef).getMap();

    for (const tileMap of tileMaps) {
      //console.log(tileMap);
      if (
        tileMap.url &&
        (tileMap.url.startsWith('pmtiles://') || (tileMap.url.includes('.pmtiles') && tileMap.isVector))
      ) {
        // 外部からレイヤーとそのスタイルを非同期に読み込む

        const url = tileMap.styleURL ?? tileMap.url.replace('pmtiles://', '').replace('.pmtiles', '.json');
        //console.log('url', url);
        fetch(url)
          .then((response) => response.json())
          .then((layerStyles) => {
            layerStyles.forEach((layerStyle: any, index: number) => {
              layerStyle.id = `${tileMap.id}_${index}`;
              layerStyle.source = tileMap.id;
              //console.log(layerStyle);
              map.addLayer(layerStyle);
            });
          })
          .catch((error) => {
            console.log('!!!!', error);
          });
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
    if (isDownloadPage) {
      navigation.setOptions({
        title: t('Home.navigation.download', '地図のダウンロード'),
        headerShown: true,
        headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props_),
        headerRight: () => headerRightButton(),
      });
    } else {
      navigation.setOptions({ headerShown: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDownloadPage, isDownloading, downloadProgress, savedTileSize]);

  const mapboxdem = {
    type: 'raster-dem',
    url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    tileSize: 512,
    maxzoom: 14,
  };

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

  const rasterdem = FUNC_MAPBOX ? mapboxdem : maptilerdem;

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

  // const onMouseMove = useCallback(
  //   (event) => {
  //     const map = (mapViewRef.current as MapRef).getMap();
  //     //console.log(hoverFeatureId.current);
  //     if (hoverFeatureId.current !== undefined) {
  //       //console.log('WWW', hoverFeatureId.current);
  //       map.removeFeatureState(hoverFeatureId.current, 'hover');
  //     }
  //     const hoverFeature = map.queryRenderedFeatures([event.point.x, event.point.y])[0];
  //     //console.log(clickedFeature);
  //     if (hoverFeature && typeof hoverFeature.id === 'number') {
  //       hoverFeatureId.current = {
  //         source: hoverFeature.source,
  //         id: hoverFeature.id,
  //       };
  //       map.setFeatureState(hoverFeatureId.current, {
  //         hover: true,
  //       });
  //     } else {
  //       hoverFeatureId.current = undefined;
  //     }
  //     if (featureButton === 'NONE') {
  //       map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
  //     }
  //   },
  //   [featureButton, mapViewRef]
  // );

  //hoverは使いにくいからやめ
  // const onMouseMove = useCallback(() => {}, []);

  // const onClick = useCallback(
  //   (event) => {
  //     const map = (mapViewRef.current as MapRef).getMap();
  //     //console.log(event);
  //     if (selectedRecord !== undefined && selectedRecord.record !== undefined) {
  //       //console.log('WWW', selectedRecord.record.userId);
  //       map.removeFeatureState({
  //         source: `${selectedRecord.layerId}_${selectedRecord.record.userId ?? ''}`,
  //       });
  //     }
  //     const clickedFeature = map.queryRenderedFeatures([event.point.x, event.point.y])[0];
  //     //console.log(clickedFeature);
  //     if (clickedFeature && typeof clickedFeature.id === 'number') {
  //       map.setFeatureState(
  //         {
  //           source: clickedFeature.source,
  //           id: clickedFeature.id,
  //         },
  //         {
  //           clicked: true,
  //         }
  //       );
  //       const [layerId, userId] = clickedFeature.layer.id.split('_');

  //       const layer = layers.find((n) => n.id === layerId);
  //       if (layer === undefined) return;
  //       if (clickedFeature.layer.type === 'line') {
  //         const data = lineDataSet.find(
  //           (d) => d.layerId === layerId && (d.userId === undefined ? userId === '' : d.userId === userId)
  //         );
  //         const feature = data?.data.find((record) => record.id === clickedFeature.properties!._id);
  //         if (feature === undefined) return;
  //         //onPressLine(layer, feature);
  //       } else if (clickedFeature.layer.type === 'fill') {
  //         //console.log('layer:', layerId, ' user:', userId);
  //         const data = polygonDataSet.find(
  //           (d) => d.layerId === layerId && (d.userId === undefined ? userId === '' : d.userId === userId)
  //         );
  //         //console.log('data:', data);
  //         const feature = data?.data.find((record) => record.id === clickedFeature.properties!._id);
  //         //console.log(feature);
  //         if (feature === undefined) return;
  //         //onPressPolygon(layer, feature);
  //       }
  //     } else {
  //       //@ts-ignore
  //       onPressMapView({ nativeEvent: { coordinate: { longitude: event.lngLat.lng, latitude: event.lngLat.lat } } });
  //     }
  //     //BUGS 3D表示の場合はホバーやクリックのスタイル変更を反映しないので、以下の呼び出しが必要
  //     if (featureButton === 'NONE') {
  //       map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
  //     }
  //   },
  //   [featureButton, layers, lineDataSet, mapViewRef, onPressMapView, polygonDataSet, selectedRecord]
  // );

  const mapStyle: string | mapboxgl.Style = useMemo(() => {
    if (FUNC_MAPBOX && tileMaps.find((tileMap) => tileMap.id === 'standard' && tileMap.visible)) {
      return 'mapbox://styles/mapbox/outdoors-v11';
    }

    const source_streets = {
      'mapbox-streets': {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8',
      },
    };
    const layer_streets: AnyLayer = {
      id: 'water',
      source: 'mapbox-streets',
      'source-layer': 'water',
      type: 'fill',
      paint: {
        'fill-color': '#00ffff',
      },
    };
    //console.log(tileMaps);
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
          } else if (tileMap.url) {
            return {
              ...result,
              [tileMap.id]: {
                type: 'raster',
                tiles: [tileMap.url],
                minzoom: tileMap.minimumZ,
                maxzoom: tileMap.maximumZ,
                scheme: tileMap.flipY ? 'tms' : 'xyz',
                tileSize: 256,
                attribution: tileMap.attribution,
              },
            };
          } else if (tileMap.id === 'hybrid') {
            return FUNC_MAPBOX
              ? {
                  ...result,
                  satellite: {
                    type: 'raster',
                    url: 'mapbox://mapbox.satellite',
                    //tileSize: 256,
                  },
                }
              : {
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
            return FUNC_MAPBOX
              ? {
                  ...result,
                  ...source_streets,
                }
              : {
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
            (tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles')) &&
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
            return FUNC_MAPBOX
              ? layer_streets
              : {
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
            justifyContent: 'flex-end',
            zIndex: 0,
            elevation: 0,
          }}
        >
          <Loading visible={isLoading} text="" />
          <ModalColorPicker
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
                mapLib={maplibregl}
                ref={mapViewRef as React.MutableRefObject<MapRef>}
                {...mapRegion}
                style={{ width: '100%', height: '100%' }}
                mapStyle={mapStyle}
                maxPitch={85}
                onMove={(e) => onRegionChangeMapView(e.viewState)}
                //mapboxAccessToken={mapboxToken}
                onLoad={onMapLoad}
                cursor={featureButton === 'POINT' ? 'crosshair' : 'auto'}
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
                        draggable={currentDrawTool === 'MOVE_POINT'}
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
                        onPressLine={() => null}
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
                      <Polygon
                        key={`${d.layerId}-${d.userId}`}
                        data={d.data}
                        layer={layer!}
                        zoom={zoom}
                        onPressPolygon={() => null}
                        zIndex={100}
                      />
                    )
                  );
                })}
              </Map>
            </View>
          </div>

          <View
            style={{
              left: 50,
              position: 'absolute',
              bottom: 80,
            }}
          >
            <ScaleBar zoom={zoomDecimal - 1} latitude={mapRegion.latitude} left={0} bottom={0} />
          </View>

          {projectName === undefined || (!isShowingProjectButtons && !isSettingProject && <HomeProjectButtons />)}
          {projectName === undefined || isDownloadPage ? null : (
            <HomeProjectLabel name={projectName} onPress={pressProjectLabel} />
          )}

          {!FUNC_LOGIN || isDownloadPage ? null : <HomeAccountButton />}
          <HomeZoomButton zoom={zoom} left={10} zoomIn={pressZoomIn} zoomOut={pressZoomOut} />

          {isShowingProjectButtons && <HomeProjectButtons />}
          {projectName === undefined || isDownloadPage ? null : (
            <HomeProjectLabel name={projectName} onPress={pressProjectLabel} />
          )}

          {!FUNC_LOGIN || isDownloadPage ? null : <HomeAccountButton />}

          {!isDownloadPage && <HomeCommonTools />}
          {!isDownloadPage && featureButton !== 'NONE' && featureButton !== 'MEMO' && <HomeDrawTools />}
          {!isDownloadPage && featureButton === 'MEMO' && <HomeMapMemoTools />}
          {!isDownloadPage && <HomeButtons />}
          {isDownloadPage && <HomeDownloadButton onPress={pressDeleteTiles} />}
        </View>
      </View>

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        animatedIndex={animatedIndex}
        onClose={onCloseBottomSheet}
        style={{ width: '50%' }}
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
