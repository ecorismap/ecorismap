import React, { useCallback, useContext, useEffect, useMemo } from 'react';
import { StyleSheet, View, Platform, Text, TouchableOpacity } from 'react-native';
import MapView, { PMTile, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
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
import SplitScreen from '../../routes/split';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';
import { useSelector } from 'react-redux';
import { AppState } from '../../modules';
import { isMapMemoDrawTool, nearDegree } from '../../utils/General';
import { TileMapType } from '../../types';
import { HomeContext } from '../../contexts/Home';
import { HomeCommonTools } from '../organisms/HomeCommonTools';
import { HomeMapMemoTools } from '../organisms/HomeMapMemoTools';
import { MapMemoView } from '../organisms/HomeMapMemoView';
import { HomePopup } from '../organisms/HomePopup';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useSharedValue, interpolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PDFArea } from '../organisms/HomePDFArea';
import { HomePDFButtons } from '../organisms/HomePDFButtons';
import { HomeMapMemoColorPicker } from '../organisms/HomeMapMemoColorPicker';

export default function HomeScreen() {
  //console.log('render HomeScreen');
  const {
    pointDataSet,
    lineDataSet,
    polygonDataSet,
    isDownloadPage,
    isExportPDFPage,
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
    pdfArea,
    pdfOrientation,
    pdfPaperSize,
    pdfScale,
    pdfTileMapZoomLevel,
    savedArea,
    attribution,
    featureButton,
    currentDrawTool,
    selectedRecord,
    isLoading,
    currentMapMemoTool,
    visibleMapMemoColor,
    penColor,
    onRegionChangeMapView,
    onPressMapView,
    onDragMapView,
    onDragEndPoint,
    pressDownloadTiles,
    pressExportPDF,
    pressStopDownloadTiles,
    pressZoomIn,
    pressZoomOut,
    pressCompass,
    pressDeleteTiles,
    pressGPS,
    gotoMaps,
    gotoHome,
    setVisibleMapMemoColor,
    selectPenColor,
    panResponder,
    isPinch,
    isDrawLineVisible,
    mapMemoEditingLine,
    bottomSheetRef,
    onCloseBottomSheet,
    isPencilModeActive,
    isPencilTouch,
    pressPDFSettingsOpen,
  } = useContext(HomeContext);
  //console.log(Platform.Version);
  const layers = useSelector((state: AppState) => state.layers);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { mapRegion, windowHeight, windowWidth, isLandscape } = useWindow();

  const navigationHeaderHeight = useMemo(
    () => (isDownloadPage || isExportPDFPage ? 56 : 0),
    [isDownloadPage, isExportPDFPage]
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
    } else if (isExportPDFPage) {
      return (
        <View style={[styles.headerRight, { marginRight: -10 }]}>
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
  }, [
    downloadProgress,
    isDownloading,
    isExportPDFPage,
    pressPDFSettingsOpen,
    pressStopDownloadTiles,
    savedTileSize,
    styles.headerRight,
  ]);

  const snapPoints = useMemo(() => ['10%', '50%', '100%'], []);
  const animatedIndex = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(
        animatedIndex.value,
        [0, 1, 2],
        [
          (windowHeight - 20 - insets.top) / 10 - insets.bottom,
          (windowHeight - 20 - insets.top) / 2 - insets.bottom,
          windowHeight - 20 - insets.top - insets.bottom,
        ]
      ),
    };
  });
  const customHandlePadding = useAnimatedStyle(() => {
    return {
      paddingTop: interpolate(animatedIndex.value, [0, 1, 2], [0, 0, insets.top]),
    };
  });

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
        <TouchableOpacity
          style={{
            position: 'absolute',
            right: 16,
            top: 0,
            width: 25,
            height: 25,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => bottomSheetRef.current?.close()}
        >
          <Text style={{ fontSize: 40, color: COLOR.GRAY4, lineHeight: 35 }}>×</Text>
        </TouchableOpacity>
      </View>
    );
  }, [bottomSheetRef]);

  useEffect(() => {
    //console.log('#useeffect3');
    if (isDownloadPage) {
      navigation.setOptions({
        title: t('Home.navigation.download', '地図のダウンロード'),
        headerShown: true,
        headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerGotoMapsButton(props_),
        headerRight: () => headerRightButton(),
      });
    } else if (isExportPDFPage) {
      navigation.setOptions({
        title: t('Home.navigation.exportPDF', 'PDF'),
        headerShown: true,
        headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerGotoHomeButton(props_),
        headerRight: () => headerRightButton(),
      });
    } else {
      navigation.setOptions({ headerShown: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDownloadPage,
    isExportPDFPage,
    isDownloading,
    downloadProgress,
    savedTileSize,
    pdfPaperSize,
    pdfScale,
    pdfOrientation,
  ]);

  //console.log('isPencilTouch', isPencilTouch);
  //console.log('isFinger', isMapMemoDrawTool(currentMapMemoTool) && isPencilModeActive && !isPencilTouch);
  //console.log(mapMemoEditingLine.length);
  return !restored ? null : (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { flexDirection: isLandscape ? 'row' : 'column' }]}>
        <View
          style={{
            justifyContent: 'center',
            zIndex: 0,
            elevation: 0,
            height: windowHeight - navigationHeaderHeight,
            width: windowWidth,
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
            zoomEnabled={mapMemoEditingLine.length === 0} //isPinchだとズームができない
            scrollEnabled={
              isPinch ||
              (isMapMemoDrawTool(currentMapMemoTool) &&
                isPencilModeActive &&
                !isPencilTouch &&
                mapMemoEditingLine.length === 0) ||
              (currentMapMemoTool === 'NONE' &&
                (currentDrawTool === 'NONE' ||
                  currentDrawTool === 'MOVE' ||
                  currentDrawTool.includes('INFO') ||
                  currentDrawTool === 'MOVE_POINT' ||
                  (isPencilModeActive && !isPencilTouch)))
            }
            moveOnMarkerPress={false}
            //@ts-ignore
            mapType={mapType}
            onPress={onPressMapView}
            onPanDrag={onDragMapView}
            {...panResponder.panHandlers}
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
              if (!layer?.visible) return null;

              return (
                <Point
                  key={`${d.layerId}-${d.userId}`}
                  data={d.data}
                  layer={layer}
                  zoom={zoom}
                  selectedRecord={selectedRecord}
                  draggable={currentDrawTool === 'MOVE_POINT'}
                  onDragEndPoint={onDragEndPoint}
                />
              );
            })}

            {lineDataSet.map((d) => {
              const layer = layers.find((v) => v.id === d.layerId);
              if (!layer?.visible) return null;
              return (
                <Line
                  key={`${d.layerId}-${d.userId}`}
                  data={d.data}
                  layer={layer}
                  zoom={zoom}
                  zIndex={101}
                  selectedRecord={selectedRecord}
                />
              );
            })}

            {polygonDataSet.map((d) => {
              const layer = layers.find((v) => v.id === d.layerId);
              if (!layer?.visible) return null;
              return (
                <Polygon
                  key={`${d.layerId}-${d.userId}`}
                  data={d.data}
                  layer={layer}
                  zoom={zoom}
                  zIndex={100}
                  selectedRecord={selectedRecord}
                />
              );
            })}

            {/************* TILE MAP ******************** */}

            {tileMaps
              .slice(0)
              .reverse()
              .map((tileMap: TileMapType, mapIndex: number) =>
                tileMap.visible && tileMap.url ? (
                  tileMap.url.startsWith('pmtiles://') ||
                  tileMap.url.includes('.pmtiles') ||
                  tileMap.url.includes('.pbf') ? (
                    <PMTile
                      key={
                        Platform.OS === 'ios'
                          ? `${tileMap.url}-${isOffline}-${tileMap.styleURL}`
                          : `${tileMap.id}-${tileMap.styleURL}`
                      } //オンラインとオフラインでキーを変更しないとキャッシュがクリアされない。urlの変更でキーを変更すると、キャッシュがクリアされる。
                      urlTemplate={tileMap.url.replace('pmtiles://', '')}
                      styleURL={tileMap.styleURL}
                      flipY={false}
                      opacity={1 - tileMap.transparency}
                      //tileSize={256} rasterは256、vectorは512で固定
                      minimumZ={0}
                      maximumZ={22}
                      zIndex={mapIndex}
                      doubleTileSize={false}
                      maximumNativeZ={tileMap.overzoomThreshold}
                      tileCachePath={`${TILE_FOLDER}/${tileMap.id}`}
                      tileCacheMaxAge={604800}
                      offlineMode={isOffline}
                      isVector={tileMap.isVector}
                    />
                  ) : (
                    <UrlTile
                      key={Platform.OS === 'ios' ? `${tileMap.id}-${isOffline}` : `${tileMap.id}`} //オンラインとオフラインでキーを変更しないとキャッシュがクリアされない。
                      urlTemplate={tileMap.url}
                      flipY={tileMap.flipY}
                      opacity={1 - tileMap.transparency}
                      tileSize={tileMap.tileSize ? tileMap.tileSize : 256}
                      minimumZ={tileMap.minimumZ}
                      maximumZ={tileMap.maximumZ}
                      zIndex={mapIndex}
                      doubleTileSize={tileMap.highResolutionEnabled}
                      maximumNativeZ={tileMap.overzoomThreshold}
                      tileCachePath={`${TILE_FOLDER}/${tileMap.id}`}
                      tileCacheMaxAge={604800}
                      offlineMode={isOffline}
                    />
                  )
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
            {/************* exportPDF mode ******************** */}
            {isExportPDFPage && <PDFArea pdfArea={pdfArea} />}
          </MapView>
          {mapRegion && (
            <View style={isLandscape ? styles.scaleBarLandscape : styles.scaleBar}>
              <ScaleBar zoom={zoomDecimal - 1} latitude={mapRegion.latitude} left={0} bottom={0} />
            </View>
          )}

          <HomeZoomButton zoom={zoom} left={10} zoomIn={pressZoomIn} zoomOut={pressZoomOut} />

          <HomeCompassButton magnetometer={magnetometer} headingUp={headingUp} onPressCompass={pressCompass} />

          <HomeGPSButton gpsState={gpsState} onPressGPS={pressGPS} />

          {<HomeAttributionText bottom={8} attribution={attribution} />}
          {!(isDownloadPage || isExportPDFPage) && <HomeCommonTools />}
          {!(isDownloadPage || isExportPDFPage) && featureButton !== 'NONE' && featureButton !== 'MEMO' && (
            <HomeDrawTools />
          )}
          {!(isDownloadPage || isExportPDFPage) && featureButton === 'MEMO' && <HomeMapMemoTools />}
          {!(isDownloadPage || isExportPDFPage) && <HomeButtons />}
          {isDownloadPage && <HomeDownloadButton onPress={pressDeleteTiles} />}
          {isExportPDFPage && (
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
        animateOnMount={false}
        animatedIndex={animatedIndex}
        onClose={onCloseBottomSheet}
        handleComponent={customHandle}
        style={[{ marginLeft: isLandscape ? '50%' : '0%', width: isLandscape ? '50%' : '100%' }, customHandlePadding]}
      >
        <Animated.View style={animatedStyle}>
          <SplitScreen />
        </Animated.View>
      </BottomSheet>
    </GestureHandlerRootView>
  );
}
