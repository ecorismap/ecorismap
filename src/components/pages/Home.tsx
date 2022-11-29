import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, Platform, Text, PanResponderInstance, useWindowDimensions, StatusBar } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region, MapEvent, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
// @ts-ignore
import ScaleBar from 'react-native-scale-bar';
import { COLOR, DEGREE_INTERVAL, FUNC_LOGIN, TILE_FOLDER } from '../../constants/AppConstants';
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

import HomeProjectLabel from '../organisms/HomeProjectLabel';

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
  UserType,
  PointToolType,
  LineToolType,
  FeatureButtonType,
  DrawLineToolType,
  TrackingStateType,
} from '../../types';
import { HomeCompassButton } from '../organisms/HomeCompassButton';
import { HomeAccountButton } from '../organisms/HomeAccountButton';

import { HomeGPSButton } from '../organisms/HomeGPSButton';
import { MemberMarker } from '../organisms/HomeMemberMarker';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { HomePointTools } from '../organisms/HomePointTools';
import { Position } from '@turf/turf';
import { SvgLine } from '../organisms/HomeSvgLine';
import { isDrawTool, nearDegree } from '../../utils/General';
import { MapRef, ViewState } from 'react-map-gl';
import { HomeModalDrawToolsSettings } from '../organisms/HomeModalDrawToolsSettings';
import DataRoutes from '../../routes/DataRoutes';
import { HomeProjectButtons } from '../organisms/HomeProjectButtons';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { HomeModalTermsOfUse } from '../organisms/HomeModalTermsOfUse';

export interface HomeProps {
  pointDataSet: DataType[];
  lineDataSet: DataType[];
  polygonDataSet: DataType[];
  layers: LayerType[];
  isSynced: boolean;
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
  projectName: string | undefined;
  user: UserType;
  attribution: string;
  featureButton: FeatureButtonType;
  pointTool: PointToolType;
  lineTool: LineToolType;
  drawLineTool: DrawLineToolType;
  selectedRecord: {
    layerId: string;
    record: RecordType | undefined;
  };
  hisyouzuToolEnabled: boolean;
  panResponder: PanResponderInstance;
  draggablePoint: boolean;
  isDrawToolsSettingsOpen: boolean;
  isTermsOfUseOpen: boolean;
  drawToolsSettings: { hisyouzuTool: { active: boolean; layerId: string | undefined } };
  isDataOpened: 'opened' | 'closed' | 'expanded';
  isShowingProjectButtons: boolean;
  isLoading: boolean;
  isSettingProject: boolean;
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
  pressLogout: () => Promise<void>;
  pressDeleteTiles: () => Promise<void>;
  pressGPS: () => Promise<void>;
  pressTracking: () => void;
  pressDownloadTiles: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressUndoEditLine: () => void;
  pressSaveEditLine: () => void;
  pressDeleteLine: () => void;
  pressDrawToolsSettings: () => void;
  pressDrawToolsSettingsOK: (drawToolsSettings: {
    hisyouzuTool: { active: boolean; layerId: string | undefined };
  }) => void;
  pressDrawToolsSettingsCancel: () => void;
  pressTermsOfUseOK: () => void;
  pressTermsOfUseCancel: () => void;
  pressSyncPosition: () => void;
  pressJumpProject: () => void;
  pressUploadData: () => void;
  pressDownloadData: () => void;
  pressCloseProject: () => void;
  pressProjectLabel: () => void;
  pressSaveProjectSetting: () => void;
  pressDiscardProjectSetting: () => void;
  gotoLogin: () => void;
  gotoProjects: () => Promise<void>;
  gotoAccount: () => Promise<void>;
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
  isSynced,
  memberLocations,
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
  projectName,
  user,
  attribution,
  featureButton,
  pointTool,
  lineTool,
  drawLineTool,
  selectedRecord,
  hisyouzuToolEnabled,
  panResponder,
  draggablePoint,
  isDrawToolsSettingsOpen,
  isTermsOfUseOpen,
  drawToolsSettings,
  isDataOpened,
  isShowingProjectButtons,
  isLoading,
  isSettingProject,
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
  pressLogout,
  pressDeleteTiles,
  pressGPS,
  pressTracking,
  pressUndoEditLine,
  pressSaveEditLine,
  pressDeleteLine,
  pressDrawToolsSettings,
  pressDrawToolsSettingsOK,
  pressDrawToolsSettingsCancel,
  pressTermsOfUseOK,
  pressTermsOfUseCancel,
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
  //console.log(Platform.Version);

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
  const navigation = useNavigation();
  useEffect(() => {
    //console.log('#useeffect3');
    if (isDownloadPage) {
      navigation.setOptions({
        title: t('Home.navigation.download', '地図のダウンロード'),
        headerShown: true,
        headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
          <HeaderBackButton {...props} onPress={gotoMaps} />
        ),
        headerRight: () =>
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
            hisyouzuToolEnabled={hisyouzuToolEnabled}
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
          {/************** Member Location ****************** */}
          {isSynced &&
            memberLocations.map((memberLocation) => (
              <MemberMarker key={memberLocation.uid} memberLocation={memberLocation} />
            ))}

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

        {isShowingProjectButtons && isDataOpened !== 'expanded' && (
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

        <HomeCompassButton magnetometer={magnetometer} headingUp={headingUp} onPressCompass={pressCompass} />

        <HomeGPSButton gpsState={gpsState} onPressGPS={pressGPS} />
        {!FUNC_LOGIN || isDownloadPage || isDataOpened === 'expanded' ? null : (
          <HomeAccountButton
            userInfo={user}
            onPressLogin={gotoLogin}
            onPressChangeProject={gotoProjects}
            onPressShowAccount={gotoAccount}
            onPressLogout={pressLogout}
          />
        )}
        {isDataOpened !== 'expanded' && <HomeAttributionText bottom={12} attribution={attribution} />}
        {isDownloadPage ? (
          <HomeDownloadButton onPress={pressDeleteTiles} />
        ) : (
          <>
            {!isDownloadPage && featureButton === 'LINE' && (
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
        <HomeModalDrawToolsSettings
          visible={isDrawToolsSettingsOpen}
          settings={drawToolsSettings}
          pressOK={pressDrawToolsSettingsOK}
          pressCancel={pressDrawToolsSettingsCancel}
        />
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
