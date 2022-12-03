import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';

// @ts-ignore
import ScaleBar from 'react-native-scale-bar';
import { COLOR, FUNC_LOGIN, FUNC_MAPBOX } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { HomeButtons } from '../organisms/HomeButtons';
import { HomeDownloadButton } from '../organisms/HomeDownloadButton';
import { HomeLineTools } from '../organisms/HomeLineTools';
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
import { HomeProps } from './Home';
import { MemberMarker } from '../organisms/HomeMemberMarker';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { HomePointTools } from '../organisms/HomePointTools';
import { isDrawTool } from '../../utils/General';
import { SvgLine } from '../organisms/HomeSvgLine';
import mapboxgl, { AnyLayer } from 'mapbox-gl';
import { HomeModalDrawToolsSettings } from '../organisms/HomeModalDrawToolsSettings';
import DataRoutes from '../../routes/DataRoutes';
import { HomeZoomLevel } from '../organisms/HomeZoomLevel';
import { HomeProjectButtons } from '../organisms/HomeProjectButtons';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { mapboxToken, maptilerKey } from '../../../config';
import 'mapbox-gl/dist/mapbox-gl.css';
//import mapStyle3D from '../../../style.json';
import { useDropzone } from 'react-dropzone';

export default function HomeScreen({
  pointDataSet,
  lineDataSet,
  polygonDataSet,
  layers,
  isSynced,
  memberLocations,
  isDownloadPage,
  downloadProgress,
  savedTileSize,
  restored,
  mapViewRef,
  mapRegion,
  gpsState,
  trackingState,
  currentLocation,
  zoom,
  zoomDecimal,
  isEdited,
  drawLine,
  modifiedLine,
  tileMaps,
  isDownloading,
  projectName,
  user,
  featureButton,
  pointTool,
  lineTool,
  drawLineTool,
  selectedRecord,
  hisyouzuToolEnabled,
  panResponder,
  draggablePoint,
  isDrawToolsSettingsOpen,
  drawToolsSettings,
  isDataOpened,
  isShowingProjectButtons,
  isLoading,
  isSettingProject,
  onRegionChangeMapView,
  onPressMapView,
  onDragEndPoint,
  onPressPoint,
  onPressLine,
  onPressPolygon,
  onDrop,
  pressStopDownloadTiles,
  pressLogout,
  pressDeleteTiles,
  pressTracking,
  pressUndoEditLine,
  pressSaveEditLine,
  pressDeleteLine,
  pressDrawToolsSettings,
  pressDrawToolsSettingsOK,
  pressDrawToolsSettingsCancel,
  pressSyncPosition,
  pressJumpProject,
  pressUploadData,
  pressDownloadData,
  pressCloseProject,
  pressProjectLabel,
  pressSaveProjectSetting,
  pressDiscardProjectSetting,
  gotoLogin,
  gotoProjects,
  gotoAccount,
  gotoMaps,
  gotoSettings,
  gotoLayers,
  selectPointTool,
  selectLineTool,
  selectFeatureButton,
}: HomeProps) {
  //console.log('render Home');

  const window = useWindowDimensions();
  const navigation = useNavigation();
  const { getRootProps, getInputProps } = useDropzone({ onDrop, noClick: true });

  const hoverFeatureId = useRef<
    | {
        source: string;
        id: number;
      }
    | undefined
  >();
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

  const onMouseMove = useCallback(
    (event) => {
      const map = (mapViewRef.current as MapRef).getMap();
      //console.log(hoverFeatureId.current);
      if (hoverFeatureId.current !== undefined) {
        //console.log('WWW', hoverFeatureId.current);
        map.removeFeatureState(hoverFeatureId.current, 'hover');
      }
      const hoverFeature = map.queryRenderedFeatures([event.point.x, event.point.y])[0];
      //console.log(clickedFeature);
      if (hoverFeature && typeof hoverFeature.id === 'number') {
        hoverFeatureId.current = {
          source: hoverFeature.source,
          id: hoverFeature.id,
        };
        map.setFeatureState(hoverFeatureId.current, {
          hover: true,
        });
      } else {
        hoverFeatureId.current = undefined;
      }
      if (featureButton === 'NONE') {
        map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
      }
    },
    [featureButton, mapViewRef]
  );

  const onClick = useCallback(
    (event) => {
      const map = (mapViewRef.current as MapRef).getMap();
      //console.log(event);
      if (selectedRecord && selectedRecord.record !== undefined) {
        //console.log('WWW', selectedRecord.record.userId);
        map.removeFeatureState({
          source: `${selectedRecord.layerId}_${selectedRecord.record.userId ?? ''}`,
        });
      }
      const clickedFeature = map.queryRenderedFeatures([event.point.x, event.point.y])[0];
      //console.log(clickedFeature);
      if (clickedFeature && typeof clickedFeature.id === 'number') {
        map.setFeatureState(
          {
            source: clickedFeature.source,
            id: clickedFeature.id,
          },
          {
            clicked: true,
          }
        );
        const [layerId, userId] = clickedFeature.layer.id.split('_');

        const layer = layers.find((n) => n.id === layerId);
        if (layer === undefined) return;
        if (clickedFeature.layer.type === 'line') {
          const data = lineDataSet.find(
            (d) => d.layerId === layerId && (d.userId === undefined ? userId === '' : d.userId === userId)
          );
          const feature = data?.data.find((record) => record.id === clickedFeature.properties!._id);
          if (feature === undefined) return;
          onPressLine(layer, feature);
        } else if (clickedFeature.layer.type === 'fill') {
          //console.log('layer:', layerId, ' user:', userId);
          const data = polygonDataSet.find(
            (d) => d.layerId === layerId && (d.userId === undefined ? userId === '' : d.userId === userId)
          );
          //console.log('data:', data);
          const feature = data?.data.find((record) => record.id === clickedFeature.properties!._id);
          //console.log(feature);
          if (feature === undefined) return;
          onPressPolygon(layer, feature);
        }
      } else {
        //@ts-ignore
        onPressMapView({ nativeEvent: { coordinate: { longitude: event.lngLat.lng, latitude: event.lngLat.lat } } });
      }
      //BUGS 3D表示の場合はホバーやクリックのスタイル変更を反映しないので、以下の呼び出しが必要
      if (featureButton === 'NONE') {
        map.setTerrain({ source: 'rasterdem', exaggeration: 1.5 });
      }
    },
    [
      featureButton,
      layers,
      lineDataSet,
      mapViewRef,
      onPressLine,
      onPressMapView,
      onPressPolygon,
      polygonDataSet,
      selectedRecord,
    ]
  );

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
          if (tileMap.url) {
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
    <View style={[styles.container, { flexDirection: window.width > window.height ? 'row' : 'column' }]}>
      <View
        style={{
          display: isDataOpened === 'closed' ? 'none' : 'flex',
          height: '100%',
          width: isDataOpened === 'expanded' ? window.width : isDataOpened === 'opened' ? window.width / 2 : '0%',
        }}
      >
        <DataRoutes />
      </View>
      <View
        style={{
          height: '100%',
          width: isDataOpened === 'expanded' ? 0 : isDataOpened === 'opened' ? window.width / 2 : window.width,
          justifyContent: 'flex-end',
          zIndex: 0,
          elevation: 0,
        }}
      >
        <Loading visible={isLoading} text="" />
        {(isDrawTool(lineTool) ||
          (lineTool === 'SELECT' && selectedRecord.record !== undefined) ||
          lineTool === 'MOVE') && (
          <SvgLine
            panResponder={panResponder}
            drawLine={drawLine}
            modifiedLine={modifiedLine.current}
            hisyouzuToolEnabled={hisyouzuToolEnabled}
            selectedRecord={selectedRecord}
          />
        )}
        <div {...getRootProps({ className: 'dropzone' })}>
          <input {...getInputProps()} />

          <View style={styles.map}>
            <Map
              mapLib={FUNC_MAPBOX ? undefined : maplibregl}
              ref={mapViewRef as React.MutableRefObject<MapRef>}
              {...mapRegion}
              style={{ width: '100%', height: '100%' }}
              mapStyle={mapStyle}
              //mapStyle="mapbox://styles/mapbox/outdoors-v11"
              //mapStyle={mapStyle3D}
              maxPitch={85}
              onMove={(e) => onRegionChangeMapView(e.viewState)}
              mapboxAccessToken={mapboxToken}
              onLoad={onMapLoad}
              cursor={featureButton === 'POINT' ? 'crosshair' : 'auto'}
              //interactiveLayerIds={interactiveLayerIds} //ラインだけに限定する場合
              onClick={onClick}
              onMouseMove={onMouseMove}
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

              {/* @ts-ignore */}
              {FUNC_MAPBOX && (
                <Layer
                  {...{
                    id: 'sky',
                    type: 'sky',
                    paint: {
                      'sky-type': 'gradient',
                      // the sky will be lightest in the center and get darker moving radially outward
                      // this simulates the look of the sun just below the horizon
                      'sky-gradient': [
                        'interpolate',
                        ['linear'],
                        ['sky-radial-progress'],
                        0.8,
                        'rgba(135, 206, 235, 1.0)',
                        1,
                        'rgba(0,0,0,0.1)',
                      ],
                      'sky-gradient-center': [0, 0],
                      'sky-gradient-radius': 90,
                      'sky-opacity': ['interpolate', ['exponential', 0.1], ['zoom'], 5, 0, 22, 1],
                    },
                  }}
                />
              )}

              {/************** Current Marker ****************** */}
              {(gpsState !== 'off' || trackingState !== 'off') && currentLocation && (
                <CurrentMarker
                  currentLocation={currentLocation}
                  //angle={magnetometer && northUp ? magnetometer!.trueHeading : 0}
                />
              )}
              {/************** Member Location ****************** */}
              {isSynced &&
                memberLocations.map((memberLocation) => (
                  <MemberMarker key={memberLocation.uid} memberLocation={memberLocation} />
                ))}
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
                      draggable={draggablePoint}
                      selectedRecord={selectedRecord}
                      onDragEndPoint={onDragEndPoint}
                      onPressPoint={(layer_, feature) => onPressPoint(layer_, feature)}
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
                      onPressLine={(layer_, feature) => onPressLine(layer_, feature)}
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
                      onPressPolygon={(layer_, feature) => onPressPolygon(layer_, feature)}
                      zIndex={100}
                    />
                  )
                );
              })}
            </Map>
          </View>
        </div>
        {mapRegion && isDataOpened !== 'expanded' && (
          <View
            style={{
              left: 50,
              position: 'absolute',
              bottom: 80,
            }}
          >
            <ScaleBar zoom={zoomDecimal - 1} latitude={mapRegion.latitude} left={0} bottom={0} />
          </View>
        )}
        {projectName === undefined ||
        (!isShowingProjectButtons && !isSettingProject) ||
        isDataOpened === 'expanded' ? null : (
          <HomeProjectButtons
            isSettingProject={isSettingProject}
            isSynced={isSynced}
            onPressJumpProject={pressJumpProject}
            onPressDownloadData={pressDownloadData}
            onPressUploadData={pressUploadData}
            onPressSyncPosition={pressSyncPosition}
            onPressCloseProject={pressCloseProject}
            onPressSaveProjectSetting={pressSaveProjectSetting}
            onPressDiscardProjectSetting={pressDiscardProjectSetting}
          />
        )}
        {projectName === undefined || isDownloadPage || isDataOpened === 'expanded' ? null : (
          <HomeProjectLabel name={projectName} onPress={pressProjectLabel} />
        )}

        {/* <HomeZoomButton zoom={zoom} top={60} left={10} zoomIn={pressZoomIn} zoomOut={pressZoomOut} />
     
        <HomeGPSButton gpsState={gpsState} onPressGPS={pressGPS} /> */}
        {!FUNC_LOGIN || isDownloadPage || isDataOpened === 'expanded' ? null : (
          <HomeAccountButton
            userInfo={user}
            onPressLogin={gotoLogin}
            onPressChangeProject={gotoProjects}
            onPressShowAccount={gotoAccount}
            onPressLogout={pressLogout}
          />
        )}

        {isDownloadPage ? (
          <HomeDownloadButton onPress={pressDeleteTiles} />
        ) : (
          <>
            {!isDownloadPage && featureButton === 'LINE' && isDataOpened !== 'expanded' && (
              <HomeLineTools
                isEdited={isEdited}
                isSelected={(lineTool === 'SELECT' || lineTool === 'MOVE') && selectedRecord.record !== undefined}
                openDisabled={selectedRecord.record === undefined || !hisyouzuToolEnabled || !isEdited}
                lineTool={lineTool}
                drawLineTool={drawLineTool}
                selectLineTool={selectLineTool}
                pressUndoEditLine={pressUndoEditLine}
                pressSaveEditLine={pressSaveEditLine}
                pressDeleteLine={pressDeleteLine}
                pressDrawToolsSettings={pressDrawToolsSettings}
              />
            )}
            {!isDownloadPage && featureButton === 'POINT' && isDataOpened !== 'expanded' && (
              <HomePointTools pointTool={pointTool} selectPointTool={selectPointTool} />
            )}

            {isDataOpened !== 'expanded' && (
              <HomeButtons
                featureButton={featureButton}
                trackingState={trackingState}
                showMap={gotoMaps}
                showSettings={gotoSettings}
                onPressTracking={pressTracking}
                showLayer={gotoLayers}
                selectFeatureButton={selectFeatureButton}
              />
            )}
          </>
        )}
        <HomeModalDrawToolsSettings
          visible={isDrawToolsSettingsOpen}
          settings={drawToolsSettings}
          pressOK={pressDrawToolsSettingsOK}
          pressCancel={pressDrawToolsSettingsCancel}
        />
      </View>
    </View>
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