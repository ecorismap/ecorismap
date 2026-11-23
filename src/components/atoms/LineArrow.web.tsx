import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { bearing } from '@turf/turf';
import * as turf from '@turf/helpers';
import { ArrowStyleType } from '../../types';
import { Marker } from 'react-map-gl/maplibre';
import { LatLng } from 'react-native-maps';

interface Props {
  coordinates: LatLng[];
  strokeColor: string;
  strokeWidth: number;
  //記号と大きさを揃えるための倍率（飛翔線のように線幅がズームで変わらない線で使う）
  sizeScale?: number;
  arrowStyle: ArrowStyleType;
}

const LineArrow = React.memo((props: Props) => {
  const { coordinates, strokeColor, strokeWidth, arrowStyle, sizeScale = 1 } = props;

  if (arrowStyle === 'NONE') return null;
  const p0 = [coordinates[0].longitude, coordinates[0].latitude];
  const p1 = [coordinates[1].longitude, coordinates[1].latitude];
  const p2 = [coordinates[coordinates.length - 2].longitude, coordinates[coordinates.length - 2].latitude];
  const p3 = [coordinates[coordinates.length - 1].longitude, coordinates[coordinates.length - 1].latitude];
  const bearingEnd = bearing(turf.point(p2), turf.point(p3));
  const angleEnd = (bearingEnd + 360) % 360;
  const bearingStart = bearing(turf.point(p1), turf.point(p0));
  const angleStart = (bearingStart + 360) % 360;
  // ズームアウトでstrokeWidthが1未満に縮むと負の平方根でNaNになるため下限をクランプ（最小でもscale=0.5で矢印を維持）
  const scale = Math.sqrt(Math.max(strokeWidth - 1, 0.25)) * sizeScale;
  const originalSize = 20;
  // scaleに基づいた新しいサイズを計算
  const size = originalSize * scale;

  // Pathのd属性をscaleに基づいて調整
  const scaledPath = `M${10 * scale} ${7 * scale} L${5 * scale} ${20 * scale} L${10 * scale} ${18 * scale} L${
    15 * scale
  } ${20 * scale} Z`;

  // 角度は北基準の方位。既定(auto)だとrotationが画面基準になり、地図を回転したときに向きがずれる。
  // ネイティブのflatと同じく、地図に寝かせて回転・傾きに追従させる
  return (
    <>
      {arrowStyle !== 'ARROW_START' && (
        <Marker
          {...coordinates[coordinates.length - 1]}
          anchor={'center'}
          draggable={false}
          rotation={angleEnd}
          rotationAlignment="map"
          pitchAlignment="map"
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size.toString()} width={size.toString()} viewBox={`0 0 ${size} ${size}`}>
              <Path d={scaledPath} fill={strokeColor} stroke="white" />
            </Svg>
          </View>
        </Marker>
      )}
      {(arrowStyle === 'ARROW_BOTH' || arrowStyle === 'ARROW_START') && (
        <Marker
          {...coordinates[0]}
          anchor={'center'}
          draggable={false}
          rotation={angleStart}
          rotationAlignment="map"
          pitchAlignment="map"
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
