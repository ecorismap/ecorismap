import React, { useContext, useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { latLonArrayToXYArray, latLonObjectsToLatLonArray, pointsToSvg } from '../../utils/Coords';
import { HomeContext } from '../../contexts/Home';
import { useWindow } from '../../hooks/useWindow';
import { View } from 'react-native';
import booleanIntersects from '@turf/boolean-intersects';
import * as turf from '@turf/helpers';
import { LineRecordType } from '../../types';

//React.Memoすると描画が更新されない
interface Props {
  data: LineRecordType[];
}

export const MapMemoView = React.memo((props: Props) => {
  const { data } = props;

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

  const regionArea = useMemo(() => {
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const topleft = [longitude - longitudeDelta / 2, latitude + latitudeDelta / 2];
    const topright = [longitude + longitudeDelta / 2, latitude + latitudeDelta / 2];
    const bottomright = [longitude + longitudeDelta / 2, latitude - latitudeDelta / 2];
    const bottomleft = [longitude - longitudeDelta / 2, latitude - latitudeDelta / 2];
    return turf.polygon([[topleft, topright, bottomright, bottomleft, topleft]]);
  }, [mapRegion]);

  if (data === undefined) return null;
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
        {/* {data.map(({ id, coords, field, visible }) => {
          const strokeWidth = (field.strokeWidth as number) ?? 2;
          const strokeColor = (field.strokeColor as string) ?? '#0000008b';
          const zoom = (field.zoom as number) ?? currentZoom;
          const latlonArray = latLonObjectsToLatLonArray(coords);
          if (currentZoom > zoom + 2) return null;
          if (currentZoom < zoom - 4) return null;
          if (!visible) return null;
          if (!booleanIntersects(regionArea, turf.lineString(latlonArray))) return null;
          const xy = latLonArrayToXYArray(latlonArray, mapRegion, mapSize, mapViewRef.current);

          return (
            <Path
              key={id}
              d={pointsToSvg(xy)}
              stroke={strokeColor}
              strokeWidth={strokeWidth * (currentZoom / zoom) ** 5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={'none'}
            />
          );
        })} */}

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
});
