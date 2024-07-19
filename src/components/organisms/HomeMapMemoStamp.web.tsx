import React, { useMemo } from 'react';
import { View } from 'react-native';
import { PointRecordType } from '../../types';
import { Marker } from 'react-map-gl/maplibre';

import Svg, { Circle, Line, Polygon, Rect, Text } from 'react-native-svg';

interface Props {
  feature: PointRecordType;
  lineColor: string;
  selected: boolean;
}
export const HomeMapMemoStamp = React.memo((props: Props) => {
  const { feature, lineColor } = props;

  const stamp = useMemo(() => feature.field._stamp as string, [feature.field]);

  if (feature.coords === undefined) return null;
  switch (stamp) {
    case 'NUMBERS':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Text x="10" y="14" fontSize="16" fontWeight="bold" fill="black" textAnchor="middle">
                1
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'ALPHABETS':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Text x="10" y="14" fontSize="16" fontWeight="bold" fill="black" textAnchor="middle">
                A
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'TEXT':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 80, height: 20 }}>
            <Svg height="20" width="80" viewBox="0 0 80 20">
              <Text x="40" y="15" fontSize="12" fontWeight="bold" fill="black" textAnchor="middle">
                クマタカ
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'TOMARI':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              {/* {selected && (
                  <Rect x="0" y="0" width="20" height="20" stroke={COLOR.ORANGE} strokeWidth="4" fill="none" />
                )} */}
              <Circle cx="10" cy="10" r="4" stroke={'#ffffffaa'} strokeWidth="1" fill={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    case 'KARI':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Line x1="6" y1="6" x2="14" y2="14" stroke={lineColor} strokeWidth="2" />
              <Line x1="14" y1="6" x2="6" y2="14" stroke={lineColor} strokeWidth="2" />
            </Svg>
          </View>
        </Marker>
      );
    case 'HOVERING':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="7" stroke={lineColor} strokeWidth="1" fill="#ffffffaa" />
              <Text x="10" y="14" fontSize="12" fontWeight="bold" fill={lineColor} textAnchor="middle">
                H
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'SQUARE':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Rect x="4" y="4" width="12" height="12" stroke={lineColor} strokeWidth="2" fill={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    case 'CIRCLE':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="6" stroke={lineColor} strokeWidth="3" fill={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    case 'TRIANGLE':
      return (
        <Marker key={`${feature.id}-${feature.redraw}`} {...feature.coords} anchor={'center'} draggable={false}>
          <View style={{ width: 20, height: 20 }}>
            <Svg height="20" width="20" viewBox="0 0 20 20">
              <Polygon points="10,3.68 2,18 18,18" stroke={lineColor} strokeWidth="0" fill={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    default:
      return null;
  }
});
