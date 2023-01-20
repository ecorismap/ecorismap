import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Platform, Text, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region, MapEvent, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
// @ts-ignore
import ScaleBar from 'react-native-scale-bar';
import { COLOR, DEGREE_INTERVAL, TILE_FOLDER } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { HomeButtons } from '../organisms/HomeButtons';
import { HomeDownloadButton } from '../organisms/HomeDownloadButton';
import { CurrentMarker } from '../organisms/HomeCurrentMarker';
import { Point } from '../organisms/HomePoint';
import { Line } from '../organisms/HomeLine';
import { Polygon } from '../organisms/HomePolygon';
import { DownloadArea } from '../organisms/HomeDownloadArea';
import { HomeZoomButton } from '../organisms/HomeZoomButton';
import { HomeAttributionText } from '../organisms/HomeAttributionText';
import { HomeDrawTools } from '../organisms/HomeDrawTools';

import {
  RecordType,
  LocationType,
  MapType,
  MemberLocationType,
  TileMapType,
  TileRegionType,
  FeatureButtonType,
  TrackingStateType,
  PointDataType,
  LineDataType,
  PolygonDataType,
  DrawToolType,
  PointToolType,
  LineToolType,
  PolygonToolType,
} from '../../types';
import { HomeCompassButton } from '../organisms/HomeCompassButton';

import { HomeGPSButton } from '../organisms/HomeGPSButton';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { Position } from '@turf/turf';
import { SvgView } from '../organisms/HomeSvgView';
import { MapRef, ViewState } from 'react-map-gl';
import DataRoutes from '../../routes/DataRoutes';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';
import { useSelector } from 'react-redux';
import { AppState } from '../../modules';
import { nearDegree } from '../../utils/General';

export interface HomeProps {
  pointDataSet: PointDataType[];
  lineDataSet: LineDataType[];
  polygonDataSet: PolygonDataType[];
  memberLocations: MemberLocationType[];
  mapType: MapType;
  tileMaps: TileMapType[];
  isOffline: boolean;
  isDownloadPage: boolean;
  downloadProgress: string;
  savedTileSize: string;
  restored: boolean;
  mapViewRef: React.MutableRefObject<MapView | MapRef | null>;
  gpsState: string;
  trackingState: TrackingStateType;
  currentLocation: LocationType | null;
  magnetometer: Location.LocationHeadingObject | null;
  headingUp: boolean;
  zoom: number;
  zoomDecimal: number;
  isEditingLine: boolean;
  drawLine: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[];
  editingLine: {
    start: Position;
    xy: Position[];
  };
  selectLine: Position[];
  isDownloading: boolean;
  downloadArea: TileRegionType;
  savedArea: TileRegionType[];
  attribution: string;
  featureButton: FeatureButtonType;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
  isDataOpened: 'opened' | 'closed' | 'expanded';
  isLoading: boolean;
  onRegionChangeMapView: (region: Region | ViewState) => void;
  onPressMapView: (e: MapEvent<{}>) => void;
  onDragMapView: () => void;
  onDrop?: (<T extends File>(acceptedFiles: T[], fileRejections: any[], event: any) => void) | undefined;
  onPressSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onMoveSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onReleaseSvgView: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  pressZoomIn: () => void;
  pressZoomOut: () => void;
  pressCompass: () => void;
  pressDeleteTiles: () => Promise<void>;
  pressGPS: () => Promise<void>;
  pressTracking: () => void;
  pressDownloadTiles: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressUndoDraw: () => void;
  pressSaveDraw: () => void;
  pressDeleteDraw: () => void;
  gotoMaps: () => void;
  gotoSettings: () => void;
  gotoLayers: () => void;
  gotoBack: () => void;
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
}

export default function HomeScreen({
  pointDataSet,
  lineDataSet,
  polygonDataSet,
  isDownloadPage,
  downloadProgress,
  savedTileSize,
  restored,
  mapViewRef,
  mapType,
  gpsState,
  trackingState,
  currentLocation,
  magnetometer,
  headingUp,
  zoom,
  zoomDecimal,
  isEditingLine,
  drawLine,
  editingLine,
  selectLine,
  tileMaps,
  isOffline,
  isDownloading,
  downloadArea,
  savedArea,
  attribution,
  featureButton,
  currentDrawTool,
  currentPointTool,
  currentLineTool,
  currentPolygonTool,
  selectedRecord,
  isDataOpened,
  isLoading,
  onRegionChangeMapView,
  onPressMapView,
  onDragMapView,
  onPressSvgView,
  onMoveSvgView,
  onReleaseSvgView,
  pressDownloadTiles,
  pressStopDownloadTiles,
  pressZoomIn,
  pressZoomOut,
  pressCompass,
  pressDeleteTiles,
  pressGPS,
  pressTracking,
  pressUndoDraw,
  pressSaveDraw,
  pressDeleteDraw,
  gotoMaps,
  gotoSettings,
  gotoLayers,
  selectDrawTool,
  selectFeatureButton,
  setPointTool,
  setLineTool,
  setPolygonTool,
}: HomeProps) {
  //console.log(Platform.Version);
  const layers = useSelector((state: AppState) => state.layers);
  const navigation = useNavigation();
  const { mapRegion, windowHeight, windowWidth, isLandscape } = useWindow();

  const navigationHeaderHeight = isDownloadPage ? 56 : 0;

  const dataStyle = useMemo(
    () =>
      isLandscape
        ? {
            height: windowHeight - navigationHeaderHeight,
            width: isDataOpened === 'expanded' ? windowWidth : isDataOpened === 'opened' ? windowWidth / 2 : '0%',
          }
        : {
            width: windowWidth - navigationHeaderHeight,
            height:
              isDataOpened === 'expanded'
                ? windowHeight - navigationHeaderHeight
                : isDataOpened === 'opened'
                ? windowHeight / 2
                : '0%',
          },
    [isDataOpened, isLandscape, navigationHeaderHeight, windowHeight, windowWidth]
  );

  const mapStyle = useMemo(
    () =>
      isLandscape
        ? {
            height: windowHeight - navigationHeaderHeight,
            width: isDataOpened === 'expanded' ? '0%' : isDataOpened === 'opened' ? windowWidth / 2 : windowWidth,
          }
        : {
            width: windowWidth,
            height:
              isDataOpened === 'expanded'
                ? '0%'
                : isDataOpened === 'opened'
                ? windowHeight / 2
                : windowHeight - navigationHeaderHeight,
          },
    [isDataOpened, isLandscape, navigationHeaderHeight, windowHeight, windowWidth]
  );

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

  return !restored ? null : (
    <View style={[styles.container, { flexDirection: isLandscape ? 'row' : 'column' }]}>
      <View style={dataStyle}>
        <DataRoutes />
      </View>
      <View
        style={[
          {
            justifyContent: 'flex-end',
            zIndex: 0,
            elevation: 0,
          },
          mapStyle,
        ]}
      >
        <Loading visible={isLoading} text="" />
        {currentDrawTool !== 'NONE' && currentDrawTool !== 'ADD_LOCATION_POINT' && (
          <SvgView
            drawLine={drawLine}
            editingLine={editingLine}
            selectLine={selectLine}
            currentDrawTool={currentDrawTool}
            onPress={onPressSvgView}
            onMove={onMoveSvgView}
            onRelease={onReleaseSvgView}
          />
        )}

        <MapView
          ref={mapViewRef as React.MutableRefObject<MapView>}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={mapRegion}
          onRegionChangeComplete={onRegionChangeMapView}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          rotateEnabled={false} //表示スピードに関係ある？
          pitchEnabled={false}
          scrollEnabled={true}
          moveOnMarkerPress={false}
          //@ts-ignore
          mapType={mapType}
          onPress={onPressMapView}
          onPanDrag={onDragMapView}
          //@ts-ignore
          options={
            Platform.OS === 'web' && {
              zoomControlOptions: {
                //@ts-ignore
                position: window.google.maps.ControlPosition.LEFT_TOP,
              },
              mapTypeControl: true,
              streetViewControl: false,
              fullscreenControl: false,
            }
          }
        >
          {/************** Current Marker ****************** */}
          {(gpsState !== 'off' || trackingState !== 'off') && currentLocation && (
            <CurrentMarker
              currentLocation={currentLocation}
              angle={magnetometer && !headingUp ? nearDegree(magnetometer.trueHeading, DEGREE_INTERVAL) : 0}
            />
          )}

          {/* 表示を正しく更新するには順番とzIndexが重要 */}

          {/************** Point Line Polygon ****************** */}

          {pointDataSet.map((d) => {
            const layer = layers.find((v) => v.id === d.layerId);
            return (
              layer?.visible && (
                <Point
                  key={`${d.layerId}-${d.userId}`}
                  data={d.data}
                  layer={layer!}
                  zoom={zoom}
                  selectedRecord={selectedRecord}
                />
              )
            );
          })}
          {lineDataSet.map((d) => {
            const layer = layers.find((v) => v.id === d.layerId);
            return (
              layer?.visible && (
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
              layer?.visible && (
                <Polygon
                  key={`${d.layerId}-${d.userId}`}
                  data={d.data}
                  layer={layer!}
                  zoom={zoom}
                  onPressPolygon={() => null}
                  zIndex={100}
                  selectedRecord={selectedRecord}
                />
              )
            );
          })}

          {/************* TILE MAP ******************** */}
          {tileMaps
            .slice(0)
            .reverse()
            .map((tileMap: TileMapType, mapIndex: number) =>
              tileMap.visible && tileMap.url ? (
                <UrlTile
                  key={Platform.OS === 'ios' ? `${tileMap.id}-${isOffline}` : `${tileMap.id}`} //オンラインとオフラインでキーを変更しないとキャッシュがクリアされない。
                  urlTemplate={tileMap.url}
                  flipY={tileMap.flipY}
                  opacity={1 - tileMap.transparency}
                  minimumZ={tileMap.minimumZ}
                  maximumZ={tileMap.maximumZ}
                  zIndex={mapIndex}
                  doubleTileSize={tileMap.highResolutionEnabled}
                  maximumNativeZ={tileMap.overzoomThreshold}
                  tileCachePath={`${TILE_FOLDER}/${tileMap.id}`}
                  tileCacheMaxAge={604800}
                  offlineMode={isOffline}
                />
              ) : null
            )}
          {/************* download mode ******************** */}
          {isDownloadPage && (
            <DownloadArea
              zoom={zoom}
              downloading={isDownloading}
              downloadArea={downloadArea}
              savedArea={savedArea}
              onPress={pressDownloadTiles}
            />
          )}
        </MapView>
        {mapRegion && isDataOpened !== 'expanded' && (
          <View style={isLandscape ? styles.scaleBarLandscape : styles.scaleBar}>
            <ScaleBar zoom={zoomDecimal - 1} latitude={mapRegion.latitude} left={0} bottom={0} />
          </View>
        )}

        <HomeZoomButton
          zoom={zoom}
          top={Platform.OS === 'ios' ? 90 : 60}
          left={10}
          zoomIn={pressZoomIn}
          zoomOut={pressZoomOut}
        />

        <HomeCompassButton magnetometer={magnetometer} headingUp={headingUp} onPressCompass={pressCompass} />

        <HomeGPSButton gpsState={gpsState} onPressGPS={pressGPS} />

        {isDataOpened !== 'expanded' && <HomeAttributionText bottom={12} attribution={attribution} />}
        {isDownloadPage ? (
          <HomeDownloadButton onPress={pressDeleteTiles} />
        ) : (
          <>
            {isDataOpened !== 'expanded' &&
              !isDownloadPage &&
              (featureButton === 'POINT' || featureButton === 'LINE' || featureButton === 'POLYGON') && (
                <HomeDrawTools
                  isPositionRight={isDataOpened === 'opened' || isLandscape}
                  isEditing={isEditingLine}
                  isSelected={drawLine.length > 0 && drawLine[0].record !== undefined}
                  featureButton={featureButton}
                  currentDrawTool={currentDrawTool}
                  currentPointTool={currentPointTool}
                  currentLineTool={currentLineTool}
                  currentPolygonTool={currentPolygonTool}
                  selectDrawTool={selectDrawTool}
                  pressUndoDraw={pressUndoDraw}
                  pressSaveDraw={pressSaveDraw}
                  pressDeleteDraw={pressDeleteDraw}
                  setPointTool={setPointTool}
                  setLineTool={setLineTool}
                  setPolygonTool={setPolygonTool}
                />
              )}

            {isDataOpened !== 'expanded' && (
              <HomeButtons
                featureButton={featureButton}
                trackingState={trackingState}
                onPressTracking={pressTracking}
                showMap={gotoMaps}
                showSettings={gotoSettings}
                showLayer={gotoLayers}
                selectFeatureButton={selectFeatureButton}
              />
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },

  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: 10,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    minHeight: 1,
    minWidth: 1,
  },
  scaleBar: {
    bottom: 80,
    left: 50,
    position: 'absolute',
  },
  scaleBarLandscape: {
    bottom: 43,
    left: 10,
    position: 'absolute',
  },
});
