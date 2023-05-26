import React, { useContext, useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { latLonArrayToXYArray, pointsToSvg } from '../../utils/Coords';
import { HomeContext } from '../../contexts/Home';
import { useWindow } from '../../hooks/useWindow';
import { AppState } from '../../modules';
import { View } from 'react-native';
import { useSelector } from 'react-redux';
import booleanIntersects from '@turf/boolean-intersects';
import * as turf from '@turf/helpers';

//React.Memoすると描画が更新されない

export const MapMemoView = () => {
  const {
    mapViewRef,
    penColor,
    penWidth,
    mapMemoEditingLine,
    currentMapMemoTool,
    panResponder,
    zoom: currentZoom,
  } = useContext(HomeContext);

  const { mapSize, mapRegion } = useWindow();
  const drawLine = useSelector((state: AppState) => state.mapMemo.drawLine);

  const regionArea = useMemo(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const topleft = [longitude - longitudeDelta / 2, latitude + latitudeDelta / 2];
    const topright = [longitude + longitudeDelta / 2, latitude + latitudeDelta / 2];
    const bottomright = [longitude + longitudeDelta / 2, latitude - latitudeDelta / 2];
    const bottomleft = [longitude - longitudeDelta / 2, latitude - latitudeDelta / 2];
    return turf.polygon([[topleft, topright, bottomright, bottomleft, topleft]]);
  }, [mapRegion]);

  return (
    <View
      style={{
        zIndex: 1,
        elevation: 1,
        position: 'absolute',
        height: '100%',
        width: '100%',
      }}
      pointerEvents={currentMapMemoTool === 'NONE' ? 'none' : 'auto'}
      {...panResponder.panHandlers}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        {drawLine.map(({ latlon, strokeColor, strokeWidth, zoom }, idx: number) => {
          if (!booleanIntersects(regionArea, turf.lineString(latlon))) return null;
          const xy = latLonArrayToXYArray(latlon, mapRegion, mapSize, mapViewRef.current);

          return (
            <Path
              key={`path${idx}`}
              d={pointsToSvg(xy)}
              stroke={strokeColor}
              strokeWidth={strokeWidth * (currentZoom / zoom) ** 5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={'none'}
            />
          );
        })}

        <Path
          d={pointsToSvg(mapMemoEditingLine)}
          stroke={currentMapMemoTool === 'ERASER' ? 'white' : penColor}
          strokeWidth={currentMapMemoTool === 'ERASER' ? 10 : penWidth}
          strokeDasharray={'none'}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={'none'}
        />
      </Svg>
    </View>
  );
};
