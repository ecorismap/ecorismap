import React from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { LineRecordType } from '../../types';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import { interpolateLineString, latLonObjectsToLatLonArray } from '../../utils/Coords';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';
import { getMapMemoSymbolScaleAtZoom } from '../../utils/Layer';

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
  //描画時よりズームアウトしたら記号を線幅と同様に縮小し、間隔も描画時ズーム基準で固定して
  //ストローク全体が地図と一緒に相似縮小されるようにする（ズームイン側は従来どおり画面上の見た目を維持）
  const scale = getMapMemoSymbolScaleAtZoom(feature, zoom);
  const drawnZoom = feature.field._zoom;
  const intervalZoom = scale < 1 && typeof drawnZoom === 'number' ? drawnZoom : zoom;
  const size = 20 * scale;
  const points = interpolateLineString(latlon, 1 / 2 ** (intervalZoom - 10));
  //turfで
  return (
    <>
      {points.map((point, idx) => (
        <Marker
          // tracksViewChangesはfalse固定（trueだとiOSで毎フレーム再描画され、重なりの点滅と電池消費の原因）。
          // 見た目に影響する値をkeyに含め、変更時はremountで再描画する
          tracksViewChanges={false}
          coordinate={{ latitude: point.coordinates[1], longitude: point.coordinates[0] }}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={point.angle}
          style={{ zIndex: -1, alignItems: 'center' }}
          // 同一zIndexのマーカーは重なると描画順が不定で点滅するため、idハッシュで一意にする
          zIndex={Platform.OS === 'ios' ? markerZIndex(MARKER_BAND.MAPMEMO, `${feature.id}:${idx}`) : undefined}
          key={`${idx}-${selected}-${feature.field._strokeStyle}-${lineColor}-${size}`}
        >
          <View style={{ width: size, height: size }}>
            {feature.field._strokeStyle === 'PLUS' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Path d="M5,10 L15,10" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'CROSS' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Path d="M10,10 L20,10" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'SENKAI' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Circle cx="15" cy="10" r="4" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'SENJYOU' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Circle cx="15" cy="10" r="4" stroke={lineColor} strokeWidth="1.5" fill="none" />
                <Circle cx="15" cy="10" r="2" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'KOUGEKI' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Polygon points="10,4 20,10 10,16" stroke={lineColor} strokeWidth="0" fill={lineColor} />
              </Svg>
            )}
            {feature.field._strokeStyle === 'DISPLAY1' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Path d="M4,19 L16,13 L4,7 L16,1" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'DISPLAY2' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Path d="M16,19 L16,1" stroke={lineColor} strokeWidth="2" strokeDasharray={[10, 10]} fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'KYUKOKA' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                {/* 上のくさび型 */}
                <Path d="M5 7 L10 2 L15 7" stroke={lineColor} strokeWidth="1.5" fill="none" />
                {/* 中央のくさび型 */}
                <Path d="M5 12 L10 7 L15 12" stroke={lineColor} strokeWidth="1.5" fill="none" />
                {/* 下のくさび型 */}
                <Path d="M5 17 L10 12 L15 17" stroke={lineColor} strokeWidth="1.5" fill="none" />
              </Svg>
            )}
            {feature.field._strokeStyle === 'TANJI' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Path d="M10 10 L4 4 V16 L10 10 Z" stroke={lineColor} strokeWidth="0" fill={lineColor} />
                <Path d="M10 10 L16 4 V16 L10 10 Z" stroke={lineColor} strokeWidth="0" fill={lineColor} />
              </Svg>
            )}
            {feature.field._strokeStyle === 'ESA' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Circle cx="15" cy="10" r="2" stroke={lineColor} strokeWidth="1.5" fill={lineColor} />
              </Svg>
            )}
            {feature.field._strokeStyle === 'SUZAI' && (
              <Svg height={size} width={size} viewBox="0 0 20 20">
                <Path d="M10 10 H34" stroke={lineColor} strokeWidth="2" fill={lineColor} />
              </Svg>
            )}
          </View>
        </Marker>
      ))}
    </>
  );
});
