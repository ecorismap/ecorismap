import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, Platform, Text } from 'react-native';
import type { PointRecordType, LineRecordType, PolygonRecordType } from '../../types';
import MapView, { PMTile, PROVIDER_GOOGLE, UrlTile } from 'react-native-maps';
// @ts-ignore
import ScaleBar from 'react-native-scale-bar';
import { COLOR, FUNC_LOGIN, TILE_FOLDER } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { HomeButtons } from '../organisms/HomeButtons';
import { CurrentMarker } from '../organisms/HomeCurrentMarker';
import { Point } from '../organisms/HomePoint';
import { Line } from '../organisms/HomeLine';
import { Polygon } from '../organisms/HomePolygon';
import { DownloadArea } from '../organisms/HomeDownloadArea';
import { HomeZoomButton } from '../organisms/HomeZoomButton';
import { HomeAttributionText } from '../organisms/HomeAttributionText';
import { HomeDrawTools } from '../organisms/HomeDrawTools';

import { HomeCompassButton } from '../organisms/HomeCompassButton';
import { HomeAccountButton } from '../organisms/HomeAccountButton';

import { HomeGPSButton } from '../organisms/HomeGPSButton';
import { MemberMarker } from '../organisms/HomeMemberMarker';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { SvgView } from '../organisms/HomeSvgView';
import { HomeProjectButtons } from '../organisms/HomeProjectButtons';
import SplitScreen from '../../routes/split';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { useWindow } from '../../hooks/useWindow';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { isMapMemoDrawTool } from '../../utils/General';
import { TileMapType, PaperOrientationType, PaperSizeType, ScaleType } from '../../types';
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
import HomeProjectLabel from '../organisms/HomeProjectLabel';
import { HomeMapMemoTools } from '../organisms/HomeMapMemoTools';
import { MapMemoView } from '../organisms/HomeMapMemoView';
import { HomePopup } from '../organisms/HomePopup';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, useSharedValue, interpolate, ReduceMotion } from 'react-native-reanimated';
import { PDFArea } from '../organisms/HomePDFArea';
import { HomePDFButtons } from '../organisms/HomePDFButtons';
import { HomeModalColorPicker } from '../organisms/HomeModalColorPicker';
import { HomeInfoToolButton } from '../organisms/HomeInfoToolButton';
import { TrackLog } from '../organisms/HomeTrackLog';
import { HomeDownloadButtons } from '../organisms/HomeDownloadButtons';
import { Pressable } from '../atoms/Pressable';
import { useViewportBounds } from '../../hooks/useViewportBounds';

export default function HomeScreen() {
  //console.log('render HomeScreen');

  // Local state for direction line visibility
  const [showDirectionLine, setShowDirectionLine] = useState(false);

  // TileManagementContext
  const {
    downloadMode,
    tileMaps,
    savedTileSize,
    isDownloading,
    downloadArea,
    savedArea,
    downloadProgress,
    pressDownloadTiles,
    pressStopDownloadTiles,
    pressDeleteTiles,
  } = useContext(TileManagementContext);

  // MapMemoContext
  const {
    currentMapMemoTool,
    visibleMapMemoColor,
    penColor,
    isPencilModeActive,
    setVisibleMapMemoColor,
    selectPenColor,
  } = useContext(MapMemoContext);

  // DataSelectionContext
  const { pointDataSet, lineDataSet, polygonDataSet, selectedRecord, isEditingRecord } =
    useContext(DataSelectionContext);

  // AppStateContext
  const { isOffline, restored, attribution, isLoading, gotoMaps, gotoHome, bottomSheetRef, onCloseBottomSheet } =
    useContext(AppStateContext);

  // SVGDrawingContext
  const { isPencilTouch, mapMemoEditingLine } = useContext(SVGDrawingContext);

  // MapViewContext
  const {
    mapViewRef,
    mapType,
    gpsState,
    currentLocation,
    azimuth,
    headingUp,
    zoom,
    zoomDecimal,
    onRegionChangeMapView,
    onPressMapView,
    onDragMapView,
    pressZoomIn,
    pressZoomOut,
    pressCompass,
    pressGPS,
    panResponder,
    isPinch,
    isDrawLineVisible,
  } = useContext(MapViewContext);

  // DrawingToolsContext
  const { featureButton, currentDrawTool, onDragEndPoint, editingLineId } = useContext(DrawingToolsContext);

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
  const { trackingState, memberLocations, editPositionMode, editPositionLayer, editPositionRecord } =
    useContext(LocationTrackingContext);

  // ProjectContext
  const { projectName, isSynced, isShowingProjectButtons, pressProjectLabel } = useContext(ProjectContext);
  //console.log(Platform.Version);
  const layers = useSelector((state: RootState) => state.layers);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { mapRegion, windowHeight, isLandscape, windowWidth } = useWindow();
  const trackLog = useSelector((state: RootState) => state.trackLog);
  const { bounds } = useViewportBounds(mapRegion);

  const navigationHeaderHeight = useMemo(
    () => (downloadMode || exportPDFMode ? 56 + insets.top : 0),
    [downloadMode, exportPDFMode, insets.top]
  );

  const scrollEnabled = useMemo(
    () =>
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
          (isPencilModeActive && !isPencilTouch))),
    [currentDrawTool, currentMapMemoTool, isPencilModeActive, isPencilTouch, isPinch, mapMemoEditingLine.length]
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
  const toggleDirectionLine = useCallback(() => {
    setShowDirectionLine((prev) => !prev);
  }, []);

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
        <View style={[styles.headerRight, { marginRight: -10 }]}>
          <Button name="cog" onPress={pressPDFSettingsOpen} labelText={t('Home.label.pdfsettings')} />
        </View>
      );
    } else {
      return (
        <View style={styles.headerRight}>
          <View style={{ width: 80, alignItems: 'flex-end' }}>
            <Text style={{ marginHorizontal: 5 }}>{savedTileSize}MB</Text>
          </View>
          <Button name="delete" onPress={pressDeleteTiles} size={13} backgroundColor={COLOR.DARKRED} />
        </View>
      );
    }
  }, [
    isDownloading,
    exportPDFMode,
    styles.headerRight,
    pressStopDownloadTiles,
    downloadProgress,
    pressPDFSettingsOpen,
    savedTileSize,
    pressDeleteTiles,
  ]);

  const snapPoints = useMemo(() => ['10%', '50%', '100%'], []);
  const animatedIndex = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(
        animatedIndex.value,
        [0, 1, 2],
        [
          (windowHeight - 20 - insets.top - insets.bottom) / 10,
          (windowHeight - 20 - insets.top - insets.bottom) / 2,
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
        {!isEditingRecord && (
          <Pressable
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: 60,
              height: 25,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={onCloseBottomSheet}
          >
            <Text style={{ fontSize: 35, color: COLOR.GRAY4, lineHeight: 33 }}>×</Text>
          </Pressable>
        )}
      </View>
    );
  }, [isEditingRecord, onCloseBottomSheet]);

  const customHeaderDownload = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 56 + insets.top,
          paddingTop: insets.top,
          backgroundColor: COLOR.MAIN,
        }}
      >
        <View style={{ flex: 1.5, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton {...props_} labelVisible={true} onPress={gotoMaps} style={{ marginLeft: 10 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('Home.navigation.download', '地図のダウンロード')}</Text>
        </View>
        <View
          style={{
            flex: 1.5,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingRight: 10,
          }}
        >
          {headerRightButton()}
        </View>
      </View>
    ),
    [gotoMaps, headerRightButton, insets.top]
  );

  const customHeaderPDF = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 56 + insets.top,
          paddingTop: insets.top,
          backgroundColor: COLOR.MAIN,
        }}
      >
        <View style={{ flex: 1.5, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton {...props_} labelVisible={true} onPress={gotoHome} style={{ marginLeft: 10 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('Home.navigation.exportPDF', 'PDF')}</Text>
        </View>
        <View
          style={{
            flex: 1.5,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingRight: 10,
          }}
        >
          {headerRightButton()}
        </View>
      </View>
    ),
    [gotoHome, headerRightButton, insets.top]
  );

  useEffect(() => {
    //console.log('#useeffect3');
    if (downloadMode) {
      navigation.setOptions({
        headerShown: true,
        header: customHeaderDownload,
      });
    } else if (exportPDFMode) {
      navigation.setOptions({
        headerShown: true,
        header: customHeaderPDF,
      });
    } else {
      navigation.setOptions({ headerShown: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    downloadMode,
    exportPDFMode,
    customHeaderDownload,
    customHeaderPDF,
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
          {/************** Member Location ****************** */}
          {isSynced &&
            memberLocations.map((memberLocation) => (
              <MemberMarker key={memberLocation.uid} memberLocation={memberLocation} />
            ))}
          <Loading visible={isLoading} text="" />
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

          <MapView
            ref={mapViewRef as React.RefObject<MapView>}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={mapRegion}
            onRegionChangeComplete={onRegionChangeMapView}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
            rotateEnabled={false} //表示スピードに関係ある？
            pitchEnabled={false}
            zoomEnabled={scrollEnabled}
            scrollEnabled={scrollEnabled}
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
                azimuth={azimuth}
                headingUp={headingUp}
                onPress={toggleDirectionLine}
                showDirectionLine={showDirectionLine}
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
                  data={d.data as PointRecordType[]}
                  layer={layer}
                  zoom={zoom}
                  editPositionMode={editPositionMode}
                  editPositionLayer={editPositionLayer}
                  editPositionRecord={editPositionRecord}
                  currentDrawTool={currentDrawTool}
                  selectedRecord={selectedRecord}
                  onDragEndPoint={onDragEndPoint}
                  bounds={bounds}
                />
              );
            })}

            <TrackLog data={trackLog} />
            {lineDataSet.map((d) => {
              const layer = layers.find((v) => v.id === d.layerId);
              if (!layer?.visible) return null;

              return (
                <Line
                  key={`${d.layerId}-${d.userId}`}
                  data={d.data as LineRecordType[]}
                  layer={layer}
                  zoom={zoom}
                  zIndex={101}
                  selectedRecord={selectedRecord}
                  editingLineId={editingLineId}
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
                tileMap.visible && !tileMap.isGroup && tileMap.url ? (
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
                      maximumNativeZ={
                        //offlineで通常のタイルの場合、ダウンロードしたレベルの16にセットする.
                        //vectorタイルなら18
                        isOffline && tileMap.overzoomThreshold > 16 && !tileMap.isVector
                          ? 16
                          : isOffline && tileMap.overzoomThreshold > 18 && tileMap.isVector
                          ? 18
                          : tileMap.overzoomThreshold
                      }
                      tileCachePath={`${TILE_FOLDER}/${tileMap.id}`}
                      //tileCacheMaxAge={604800}
                      offlineMode={isOffline}
                      isVector={tileMap.isVector}
                    />
                  ) : (
                    <UrlTile
                      key={Platform.OS === 'ios' ? `${tileMap.id}-${isOffline}-${tileMap.redraw}` : `${tileMap.id}`} //オンラインとオフラインでキーを変更しないとキャッシュがクリアされない。
                      urlTemplate={
                        tileMap.url.endsWith('.pdf') || tileMap.url.startsWith('pdf://')
                          ? 'file://dummy/{z}/{x}/{y}.png'
                          : tileMap.url
                      }
                      flipY={tileMap.flipY}
                      opacity={1 - tileMap.transparency}
                      tileSize={tileMap.tileSize ? tileMap.tileSize : 256}
                      minimumZ={tileMap.minimumZ}
                      maximumZ={tileMap.maximumZ}
                      zIndex={mapIndex}
                      doubleTileSize={tileMap.highResolutionEnabled}
                      maximumNativeZ={
                        //offlineで通常のタイルの場合、ダウンロードしたレベルの16にセットする
                        isOffline &&
                        !(tileMap.url.endsWith('.pdf') || tileMap.url.startsWith('pdf://')) &&
                        tileMap.overzoomThreshold > 16
                          ? 16
                          : tileMap.overzoomThreshold
                      }
                      tileCachePath={`${TILE_FOLDER}/${tileMap.id}`}
                      offlineMode={isOffline}
                    />
                  )
                ) : null
              )}
            {/************* download mode ******************** */}
            {downloadMode && (
              <DownloadArea
                downloadArea={downloadArea as any}
                savedArea={savedArea as any}
                onPress={pressDownloadTiles}
              />
            )}
            {/************* exportPDF mode ******************** */}
            {exportPDFMode && <PDFArea pdfArea={pdfArea} />}
          </MapView>
          {mapRegion && (
            <View style={[isLandscape ? styles.scaleBarLandscape : styles.scaleBar, { bottom: 65 + insets.bottom }]}>
              <ScaleBar zoom={zoomDecimal - 1} latitude={mapRegion.latitude} left={0} bottom={0} />
            </View>
          )}

          <HomeZoomButton zoom={zoom} left={10} zoomIn={pressZoomIn} zoomOut={pressZoomOut} />

          {isShowingProjectButtons && <HomeProjectButtons />}
          {projectName === undefined || downloadMode ? null : (
            <HomeProjectLabel name={projectName} onPress={pressProjectLabel} />
          )}

          {!FUNC_LOGIN || downloadMode ? null : <HomeAccountButton />}

          <HomeCompassButton azimuth={azimuth} headingUp={headingUp} onPressCompass={pressCompass} />
          <HomeGPSButton gpsState={gpsState} onPressGPS={pressGPS} />

          {<HomeAttributionText bottom={1 + insets.bottom} attribution={attribution} />}
          {!(downloadMode || exportPDFMode || editPositionMode) && <HomeInfoToolButton />}
          {!(downloadMode || exportPDFMode) && featureButton !== 'NONE' && featureButton !== 'MEMO' && (
            <HomeDrawTools />
          )}
          {!(downloadMode || exportPDFMode) && featureButton === 'MEMO' && <HomeMapMemoTools />}
          {!(downloadMode || exportPDFMode || editPositionMode) && <HomeButtons />}
          {downloadMode && <HomeDownloadButtons zoom={zoom} downloading={isDownloading} onPress={pressDownloadTiles} />}
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
        animateOnMount={true}
        animatedIndex={animatedIndex}
        onClose={onCloseBottomSheet}
        handleComponent={customHandle}
        enableDynamicSizing={false}
        overrideReduceMotion={ReduceMotion.Always}
        style={[
          {
            marginLeft: isLandscape ? '50%' : '0%',
            width: isLandscape ? '50%' : '100%',
          },
          customHandlePadding,
        ]}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <Animated.View style={animatedStyle}>
            <SplitScreen />
          </Animated.View>
        </BottomSheetView>
      </BottomSheet>
    </GestureHandlerRootView>
  );
}
