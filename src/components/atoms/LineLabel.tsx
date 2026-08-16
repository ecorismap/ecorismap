import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Marker, LatLng } from 'react-native-maps';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';

interface Props {
  coordinate: LatLng;
  label: string;
  size: number;
  color: string;
  borderColor: string;
}

const LineLabel = React.memo((props: Props) => {
  const { coordinate, label, size, color, borderColor } = props;
  const isWeb = Platform.OS === 'web';

  // tracksViewChangesはfalse固定（trueだとiOSで毎フレーム再描画され、重なりの点滅と電池消費の原因）。
  // 見た目に影響する値をkeyに含め、変更時はremountで再描画する。
  // iOSのzIndexは、同一値のマーカー同士が重なると描画順が不定で点滅するため、座標ハッシュで一意にする
  // （ラベルバンドは従来のzIndex=9999と同様に他マーカーより前面）
  return (
    <Marker
      anchor={{ x: 1, y: 1 }}
      key={`${label}|${size}|${color}|${borderColor}`}
      coordinate={coordinate}
      tracksViewChanges={false}
      zIndex={
        Platform.OS === 'ios'
          ? markerZIndex(MARKER_BAND.LINE_LABEL, `${label}:${coordinate.latitude}:${coordinate.longitude}`)
          : 9999
      }
    >
      <View style={{ alignItems: 'center' }}>
        <Text
          style={{
            fontSize: size,
            color,
            ...(isWeb
              ? { textShadow: `1px 1px 1px ${borderColor}` }
              : {
                  textShadowOffset: { width: 1, height: 1 },
                  textShadowRadius: 1,
                  textShadowColor: borderColor,
                }),
          }}
        >
          {label}
        </Text>
      </View>
    </Marker>
  );
});

export default LineLabel;
