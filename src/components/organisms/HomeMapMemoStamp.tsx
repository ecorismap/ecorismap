import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { PointRecordType } from '../../types';
import Svg, { Circle, Line, Polygon, Rect, Text } from 'react-native-svg';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';
import { getMapMemoSymbolScaleAtZoom } from '../../utils/Layer';

interface Props {
  feature: PointRecordType;
  lineColor: string;
  selected: boolean;
  zoom: number;
}

export const HomeMapMemoStamp = React.memo((props: Props) => {
  //console.log('render Point');

  const { feature, lineColor, selected, zoom } = props;
  //console.log('feature', feature);

  const stamp = useMemo(() => feature.field._stamp as string, [feature.field]);

  if (feature.coords === undefined) return null;
  // tracksViewChangesはfalse固定（trueだとiOSで毎フレーム再描画され、重なりの点滅と電池消費の原因）。
  // 見た目に影響する値をkeyに含め、変更時はremountで再描画する
  //描画時よりズームアウトしたら線幅と同様に縮小表示する
  const scale = getMapMemoSymbolScaleAtZoom(feature, zoom);
  const size = 20 * scale;
  const markerKey = `stamp-${selected}-${stamp}-${lineColor}-${size}`;
  // 同一zIndexのマーカーは重なると描画順が不定で点滅するため、idハッシュで一意にする
  const zIndex = Platform.OS === 'ios' ? markerZIndex(MARKER_BAND.MAPMEMO, feature.id) : undefined;
  switch (stamp) {
    case 'NUMBERS':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Text x="10" y="14" fontSize="16" fontWeight="bold" fill="black" textAnchor="middle">
                1
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'ALPHABETS':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Text x="10" y="14" fontSize="16" fontWeight="bold" fill="black" textAnchor="middle">
                A
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'TEXT':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: 80 * scale, height: size }}>
            <Svg height={size} width={80 * scale} viewBox="0 0 80 20">
              <Text x="40" y="15" fontSize="12" fontWeight="bold" fill="black" textAnchor="middle">
                クマタカ
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'TOMARI':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
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
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="7" stroke={lineColor} strokeWidth="1" fill="#ffffffaa" />
              <Line x1="5" y1="5" x2="15" y2="15" stroke={lineColor} strokeWidth="1.5" />
              <Line x1="15" y1="5" x2="5" y2="15" stroke={lineColor} strokeWidth="1.5" />
            </Svg>
          </View>
        </Marker>
      );
    case 'HOVERING':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="7" stroke={lineColor} strokeWidth="1" fill="#ffffffaa" />
              <Text x="10" y="14" fontSize="12" fontWeight="bold" fill={lineColor} textAnchor="middle">
                H
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'VOICE':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="8" stroke={lineColor} strokeWidth="1" fill="#ffffffaa" />
              <Text x="10" y="15" fontSize="11" fontWeight="bold" fill={lineColor} textAnchor="middle">
                Vo
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'KOUBI':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Text x="9" y="14" fontSize="18" fontWeight="bold" fill={lineColor} textAnchor="middle">
                ★
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    case 'SQUARE':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Rect x="4" y="4" width="12" height="12" stroke={lineColor} strokeWidth="2" fill={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    case 'CIRCLE':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Circle cx="10" cy="10" r="6" stroke={lineColor} strokeWidth="3" fill={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    case 'TRIANGLE':
      return (
        <Marker
          tracksViewChanges={false}
          key={markerKey}
          coordinate={feature.coords}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          style={{ zIndex: -1, alignItems: 'center' }}
          zIndex={zIndex}
        >
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <Polygon points="10,3.68 2,18 18,18" stroke={lineColor} strokeWidth="0" fill={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    default:
      return null;
  }
});
