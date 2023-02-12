import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { StyleSheet, View, Platform, Text } from 'react-native';
import MapView, { PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';

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

import { HomeCompassButton } from '../organisms/HomeCompassButton';

import { HomeGPSButton } from '../organisms/HomeGPSButton';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { SvgView } from '../organisms/HomeSvgView';
import DataRoutes from '../../routes/DataRoutes';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';
import { useSelector } from 'react-redux';
import { AppState } from '../../modules';
import { nearDegree } from '../../utils/General';
import { TileMapType } from '../../types';
import { HomeContext } from '../../contexts/Home';
import { HomeCommonTools } from '../organisms/HomeCommonTools';

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
    mapType,
    gpsState,
    trackingState,
    currentLocation,
    magnetometer,
    headingUp,
    zoom,
    zoomDecimal,
    tileMaps,
    isOffline,
    isDownloading,
    downloadArea,
    savedArea,
    attribution,
    featureButton,
    currentDrawTool,
    selectedRecord,
    screenState,
    isLoading,
    onRegionChangeMapView,
    onPressMapView,
    onDragMapView,
    pressDownloadTiles,
    pressStopDownloadTiles,
    pressZoomIn,
    pressZoomOut,
    pressCompass,
    pressDeleteTiles,
    pressGPS,
    gotoMaps,
  } = useContext(HomeContext);
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
            width: screenState === 'expanded' ? windowWidth : screenState === 'opened' ? windowWidth / 2 : '0%',
          }
        : {
            width: windowWidth - navigationHeaderHeight,
            height:
              screenState === 'expanded'
                ? windowHeight - navigationHeaderHeight
                : screenState === 'opened'
                ? windowHeight / 2
                : '0%',
          },
    [screenState, isLandscape, navigationHeaderHeight, windowHeight, windowWidth]
  );

  const mapStyle = useMemo(
    () =>
      isLandscape
        ? {
            height: windowHeight - navigationHeaderHeight,
            width: screenState === 'expanded' ? '0%' : screenState === 'opened' ? windowWidth / 2 : windowWidth,
          }
        : {
            width: windowWidth,
            height:
              screenState === 'expanded'
                ? '0%'
                : screenState === 'opened'
                ? windowHeight / 2
                : windowHeight - navigationHeaderHeight,
          },
    [screenState, isLandscape, navigationHeaderHeight, windowHeight, windowWidth]
  );

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
      left: 65,
      position: 'absolute',
    },
    scaleBarLandscape: {
      bottom: 60,
      left: 65,
      position: 'absolute',
    },
  });
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
    [downloadProgress, isDownloading, pressStopDownloadTiles, savedTileSize, styles.headerRight]
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
        {currentDrawTool !== 'NONE' && currentDrawTool !== 'ADD_LOCATION_POINT' && <SvgView />}

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
        {mapRegion && screenState !== 'expanded' && (
          <View style={isLandscape ? styles.scaleBarLandscape : styles.scaleBar}>
            <ScaleBar zoom={zoomDecimal - 1} latitude={mapRegion.latitude} left={0} bottom={0} />
          </View>
        )}

        <HomeZoomButton zoom={zoom} left={10} zoomIn={pressZoomIn} zoomOut={pressZoomOut} />

        <HomeCompassButton magnetometer={magnetometer} headingUp={headingUp} onPressCompass={pressCompass} />

        <HomeGPSButton gpsState={gpsState} onPressGPS={pressGPS} />

        {screenState !== 'expanded' && <HomeAttributionText bottom={8} attribution={attribution} />}
        {screenState !== 'expanded' && !isDownloadPage && <HomeCommonTools />}
        {screenState !== 'expanded' && !isDownloadPage && featureButton !== 'NONE' && <HomeDrawTools />}
        {screenState !== 'expanded' && !isDownloadPage && <HomeButtons />}
        {isDownloadPage && <HomeDownloadButton onPress={pressDeleteTiles} />}
      </View>
    </View>
  );
}
