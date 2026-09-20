import React from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { LineRecordType } from '../../types';
import Svg from 'react-native-svg';
import { BrushSymbol } from './HomeBrushSymbol';

import { interpolateLineString, latLonObjectsToLatLonArray } from '../../utils/Coords';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';
import { getMapMemoSymbolScaleAtZoom, SYMBOL_BASE_SIZE_PX, SYMBOL_BASE_ZOOM } from '../../utils/Layer';

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
  const scale = getMapMemoSymbolScaleAtZoom(zoom);
  const intervalZoom = scale < 1 ? SYMBOL_BASE_ZOOM : zoom;
  const size = SYMBOL_BASE_SIZE_PX * scale;
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
            <Svg height={size} width={size} viewBox="0 0 20 20">
              <BrushSymbol strokeStyle={String(feature.field._strokeStyle ?? '')} lineColor={lineColor} />
            </Svg>
          </View>
        </Marker>
      ))}
    </>
  );
});
