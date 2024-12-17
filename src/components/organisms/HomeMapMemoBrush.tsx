import React from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { LineRecordType } from '../../types';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import { interpolateLineString, latLonObjectsToLatLonArray } from '../../utils/Coords';

interface Props {
  lineColor: string;
  feature: LineRecordType;
  zoom: number;
  selected: boolean;
}

export const HomeMapMemoBrush = React.memo((props: Props) => {
  const { lineColor, feature, zoom, selected } = props;
  if (feature.coords === undefined) return null;
  const latlon = latLonObjectsToLatLonArray(feature.coords);
  const points = interpolateLineString(latlon, 1 / 2 ** (zoom - 10));
  //turfで
  return (
    <>
      {points.map((point, idx) => (
        <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={{ latitude: point.coordinates[1], longitude: point.coordinates[0] }}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={point.angle}
          style={{ zIndex: -1, alignItems: 'center' }}
          key={idx}
        >
          <View style={{ width: 20, height: 20 }}>
            {feature.field._strokeStyle === 'PLUS' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                <Path d="M5,10 L15,10" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'CROSS' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                <Path d="M10,10 L20,10" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'SENKAI' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                <Circle cx="15" cy="10" r="4" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'SENJYOU' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                <Circle cx="15" cy="10" r="4" stroke={lineColor} strokeWidth="1.5" fill="none" />
                <Circle cx="15" cy="10" r="2" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'KOUGEKI' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                <Polygon points="10,4 20,10 10,16" stroke={lineColor} strokeWidth="0" fill={lineColor} />
              </Svg>
            )}
            {feature.field._strokeStyle === 'DISPLAY' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                <Path d="M4,19 L16,13 L4,7 L16,1" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}

            {feature.field._strokeStyle === 'KYUKOKA' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                {/* 上のくさび型 */}
                <Path d="M5 7 L10 2 L15 7" stroke={lineColor} strokeWidth="1.5" fill="none" />
                {/* 中央のくさび型 */}
                <Path d="M5 12 L10 7 L15 12" stroke={lineColor} strokeWidth="1.5" fill="none" />
                {/* 下のくさび型 */}
                <Path d="M5 17 L10 12 L15 17" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'TANJI' && (
              <Svg height="20" width="20" viewBox="0 0 20 20">
                <Path d="M10 10 L2 6 V14 L10 10 Z" stroke={lineColor} strokeWidth="0" fill={lineColor} />
                <Path d="M10 10 L18 6 V14 L10 10 Z" stroke={lineColor} strokeWidth="0" fill={lineColor} />
              </Svg>
            )}
          </View>
        </Marker>
      ))}
    </>
  );
});
