import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Platform, Text, PanResponderInstance, useWindowDimensions, StatusBar } from 'react-native';
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
import { HomeLineTools } from '../organisms/HomeLineTools';

import {
  DataType,
  RecordType,
  LayerType,
  LocationType,
  MapType,
  MemberLocationType,
  RegionType,
  TileMapType,
  TileRegionType,
  PointToolType,
  LineToolType,
  FeatureButtonType,
  DrawLineToolType,
  TrackingStateType,
} from '../../types';
import { HomeCompassButton } from '../organisms/HomeCompassButton';

import { HomeGPSButton } from '../organisms/HomeGPSButton';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { HomePointTools } from '../organisms/HomePointTools';
import { Position } from '@turf/turf';
import { SvgLine } from '../organisms/HomeSvgLine';
import { isDrawTool, nearDegree } from '../../utils/General';
import { MapRef, ViewState } from 'react-map-gl';
import DataRoutes from '../../routes/DataRoutes';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { HomeModalTermsOfUse } from '../organisms/HomeModalTermsOfUse';

export interface HomeProps {
  pointDataSet: DataType[];
  lineDataSet: DataType[];
  polygonDataSet: DataType[];
  layers: LayerType[];
  memberLocations: MemberLocationType[];
  mapRegion: RegionType;
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
  isEdited: boolean;
  drawLine: {
    id: string;
    coords: Position[];
    properties: (DrawLineToolType | '')[];
    arrow: number;
  }[];
  modifiedLine: React.MutableRefObject<{
    start: Position;
    coords: Position[];
  }>;
  isDownloading: boolean;
  downloadArea: TileRegionType;
  savedArea: TileRegionType[];
  attribution: string;
  featureButton: FeatureButtonType;
  pointTool: PointToolType;
  lineTool: LineToolType;
  drawLineTool: DrawLineToolType;
  selectedRecord: {
    layerId: string;
    record: RecordType | undefined;
  };
  panResponder: PanResponderInstance;
  draggablePoint: boolean;
  isTermsOfUseOpen: boolean;
  drawToolsSettings: { hisyouzuTool: { active: boolean; layerId: string | undefined } };
  isDataOpened: 'opened' | 'closed' | 'expanded';
  isLoading: boolean;
  onRegionChangeMapView: (region: Region | ViewState) => void;
  onPressMapView: (e: MapEvent<{}>) => void;
  onDragMapView: () => void;
  onDragEndPoint: (e: MapEvent<{}>, layer: LayerType, feature: RecordType) => void;
  onPressPoint: (layer: LayerType, feature: RecordType) => void;
  onPressLine: (layer: LayerType, feature: RecordType) => void;
  onPressPolygon: (layer: LayerType, feature: RecordType) => void;
  onDrop?: (<T extends File>(acceptedFiles: T[], fileRejections: any[], event: any) => void) | undefined;
  pressZoomIn: () => void;
  pressZoomOut: () => void;
  pressCompass: () => void;
  pressDeleteTiles: () => Promise<void>;
  pressGPS: () => Promise<void>;
  pressTracking: () => void;
  pressDownloadTiles: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressUndoEditLine: () => void;
  pressSaveEditLine: () => void;
  pressDeleteLine: () => void;
  pressTermsOfUseOK: () => void;
  pressTermsOfUseCancel: () => void;
  gotoMaps: () => void;
  gotoSettings: () => void;
  gotoLayers: () => void;
  gotoBack: () => void;
  selectFeatureButton: (value: FeatureButtonType) => void;
  selectPointTool: (value: PointToolType) => void;
  selectLineTool: (value: LineToolType) => void;
}

export default function HomeScreen({
  pointDataSet,
  lineDataSet,
  polygonDataSet,
  layers,
  isDownloadPage,
  downloadProgress,
  savedTileSize,
  restored,
  mapViewRef,
  mapRegion,
  mapType,
  gpsState,
  trackingState,
  currentLocation,
  magnetometer,
  headingUp,
  zoom,
  zoomDecimal,
  isEdited,
  drawLine,
  modifiedLine,
  tileMaps,
  isOffline,
  isDownloading,
  downloadArea,
  savedArea,
  attribution,
  featureButton,
  pointTool,
  lineTool,
  drawLineTool,
  selectedRecord,
  panResponder,
  draggablePoint,
  isTermsOfUseOpen,
  isDataOpened,
  isLoading,
  onRegionChangeMapView,
  onPressMapView,
  onDragMapView,
  onDragEndPoint,
  onPressPoint,
  onPressLine,
  onPressPolygon,
  pressDownloadTiles,
  pressStopDownloadTiles,
  pressZoomIn,
  pressZoomOut,
  pressCompass,
  pressDeleteTiles,
  pressGPS,
  pressTracking,
  pressUndoEditLine,
  pressSaveEditLine,
  pressDeleteLine,
  pressTermsOfUseOK,
  pressTermsOfUseCancel,
  gotoMaps,
  gotoSettings,
  gotoLayers,
  selectPointTool,
  selectLineTool,
  selectFeatureButton,
}: HomeProps) {
  //console.log(Platform.Version);
  const navigation = useNavigation();
  const window = useWindowDimensions();
  const windowHeight = useMemo(() => {
    const navigationHeaderHeight = isDownloadPage ? 56 : 0;
    return StatusBar.currentHeight &&
      ((Platform.OS === 'android' && Platform.Version < 30) || window.height < window.width)
      ? window.height - StatusBar.currentHeight - navigationHeaderHeight
      : window.height - navigationHeaderHeight;
  }, [isDownloadPage, window.height, window.width]);
  //const windowHeight = useMemo(() => window.height, [window.height]);
  const windowWidth = useMemo(() => window.width, [window.width]);

  const dataStyle = useMemo(() => {
    if (windowWidth > windowHeight) {
      return {
        height: windowHeight,
        width: isDataOpened === 'expanded' ? windowWidth : isDataOpened === 'opened' ? windowWidth / 2 : '0%',
      };
    } else {
      return {
        width: windowWidth,
        height: isDataOpened === 'expanded' ? windowHeight : isDataOpened === 'opened' ? windowHeight / 2 : '0%',
      };
    }
  }, [isDataOpened, windowHeight, windowWidth]);

  const mapStyle = useMemo(() => {
    if (windowWidth > windowHeight) {
      return {
        height: windowHeight,
        width: isDataOpened === 'expanded' ? '0%' : isDataOpened === 'opened' ? windowWidth / 2 : windowWidth,
      };
    } else {
      return {
        width: windowWidth,
        height: isDataOpened === 'expanded' ? '0%' : isDataOpened === 'opened' ? windowHeight / 2 : windowHeight,
      };
    }
  }, [isDataOpened, windowHeight, windowWidth]);
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
    <View style={[styles.container, { flexDirection: windowWidth > windowHeight ? 'row' : 'column' }]}>
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
        {(isDrawTool(lineTool) ||
          (lineTool === 'SELECT' && selectedRecord.record !== undefined) ||
          lineTool === 'MOVE') && (
          <SvgLine
            panResponder={panResponder}
            drawLine={drawLine}
            modifiedLine={modifiedLine.current}
            selectedRecord={selectedRecord}
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
          <View
            style={{
              left: 50,
              position: 'absolute',
              bottom: 85,
            }}
          >
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
            {!isDownloadPage && featureButton === 'LINE' && (
              <HomeLineTools
                isEdited={isEdited}
                isSelected={(lineTool === 'SELECT' || lineTool === 'MOVE') && selectedRecord.record !== undefined}
                openDisabled={selectedRecord.record === undefined || !isEdited}
                lineTool={lineTool}
                drawLineTool={drawLineTool}
                selectLineTool={selectLineTool}
                pressUndoEditLine={pressUndoEditLine}
                pressSaveEditLine={pressSaveEditLine}
                pressDeleteLine={pressDeleteLine}
              />
            )}
            {!isDownloadPage && featureButton === 'POINT' && (
              <HomePointTools pointTool={pointTool} selectPointTool={selectPointTool} />
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

        <HomeModalTermsOfUse
          visible={isTermsOfUseOpen}
          pressOK={pressTermsOfUseOK}
          pressCancel={pressTermsOfUseCancel}
        />
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
});
