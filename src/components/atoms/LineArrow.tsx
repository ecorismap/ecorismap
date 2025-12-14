import React from 'react';
import { View, Platform } from 'react-native';
import { Marker, LatLng } from 'react-native-maps';
import Svg, { Path } from 'react-native-svg';
import { bearing } from '@turf/turf';
import * as turf from '@turf/helpers';
import { ArrowStyleType } from '../../types';

interface Props {
  coordinates: LatLng[];
  strokeColor: string;
  strokeWidth: number;
  arrowStyle: ArrowStyleType;
}

const LineArrow = React.memo((props: Props) => {
  const { coordinates, strokeColor, strokeWidth, arrowStyle } = props;

  if (arrowStyle === 'NONE') return null;
  const p0 = [coordinates[0].longitude, coordinates[0].latitude];
  const p1 = [coordinates[1].longitude, coordinates[1].latitude];
  const p2 = [coordinates[coordinates.length - 2].longitude, coordinates[coordinates.length - 2].latitude];
  const p3 = [coordinates[coordinates.length - 1].longitude, coordinates[coordinates.length - 1].latitude];
  const bearingEnd = bearing(turf.point(p2), turf.point(p3));
  const angleEnd = (bearingEnd + 360) % 360;
  const bearingStart = bearing(turf.point(p1), turf.point(p0));
  const angleStart = (bearingStart + 360) % 360;
  const scale = Math.sqrt(strokeWidth - 1);
  const originalSize = 20;
  // scaleに基づいた新しいサイズを計算
  const size = originalSize * scale;

  // Pathのd属性をscaleに基づいて調整
  const scaledPath = `M${10 * scale} ${7 * scale} L${5 * scale} ${20 * scale} L${10 * scale} ${18 * scale} L${
    15 * scale
  } ${20 * scale} Z`;

  return (
    <>
      <Marker
        tracksViewChanges={Platform.OS === 'ios'}
        coordinate={coordinates[coordinates.length - 1]}
        opacity={1}
        anchor={{ x: 0.5, y: 0.5 }}
        rotation={angleEnd}
        style={{ zIndex: -1, alignItems: 'center' }}
      >
        <View style={{ width: size, height: size }}>
          <Svg height={size.toString()} width={size.toString()} viewBox={`0 0 ${size} ${size}`}>
            <Path d={scaledPath} fill={strokeColor} stroke="white" />
          </Svg>
        </View>
      </Marker>
      {arrowStyle === 'ARROW_BOTH' && (
        <Marker
          tracksViewChanges={Platform.OS === 'ios'}
          coordinate={coordinates[0]}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={angleStart}
          style={{ zIndex: -1, alignItems: 'center' }}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size.toString()} width={size.toString()} viewBox={`0 0 ${size} ${size}`}>
              <Path d={scaledPath} fill={strokeColor} stroke="white" />
            </Svg>
          </View>
        </Marker>
      )}
    </>
  );
});

export default LineArrow;
