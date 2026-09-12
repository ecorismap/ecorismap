import React from 'react';
import { View } from 'react-native';
import { LineRecordType } from '../../types';
import Svg from 'react-native-svg';
import { BrushSymbol } from './HomeBrushSymbol';

import { interpolateLineString, latLonObjectsToLatLonArray } from '../../utils/Coords';
import { Marker } from 'react-map-gl/maplibre';
import { getMapMemoSymbolScaleAtZoom } from '../../utils/Layer';

interface Props {
  lineColor: string;
  feature: LineRecordType;
  zoom: number;
  selected: boolean;
}

export const HomeMapMemoBrush = React.memo((props: Props) => {
  const { lineColor, feature, zoom } = props;
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
          key={idx}
          longitude={point.coordinates[0]}
          latitude={point.coordinates[1]}
          anchor={'center'}
          rotation={point.angle}
          draggable={false}
        >
          {/* <Marker
          tracksViewChanges={Platform.OS === 'ios' ? true : selected} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
          coordinate={{ latitude: point.coordinates[1], longitude: point.coordinates[0] }}
          opacity={1}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={point.angle}
          style={{ zIndex: -1, alignItems: 'center' }}
          key={idx}
        > */}
          <View style={{ width: size, height: size }}>
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <BrushSymbol strokeStyle={String(feature.field._strokeStyle ?? '')} lineColor={lineColor} />
            </Svg>
          </View>
        </Marker>
      ))}
    </>
  );
});
