import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { PointRecordType } from '../../types';
import Svg, { Text } from 'react-native-svg';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';
import { getMapMemoSymbolScaleAtZoom } from '../../utils/Layer';
import { hasStampSymbol, StampSymbol } from './HomeStampSymbol';

interface Props {
  feature: PointRecordType;
  lineColor: string;
  selected: boolean;
  zoom: number;
  //数字・英字・文字スタンプが描く文字列。レイヤのラベル設定から生成した値を呼び出し側が渡す
  label?: string;
}

export const HomeMapMemoStamp = React.memo((props: Props) => {
  //console.log('render Point');

  const { feature, lineColor, selected, zoom, label } = props;
  //console.log('feature', feature);

  const stamp = useMemo(() => feature.field._stamp as string, [feature.field]);

  if (feature.coords === undefined) return null;
  // tracksViewChangesはfalse固定（trueだとiOSで毎フレーム再描画され、重なりの点滅と電池消費の原因）。
  // 見た目に影響する値をkeyに含め、変更時はremountで再描画する
  //描画時よりズームアウトしたら線幅と同様に縮小表示する
  const scale = getMapMemoSymbolScaleAtZoom(feature, zoom);
  const size = 20 * scale;
  const markerKey = `stamp-${selected}-${stamp}-${lineColor}-${size}-${label ?? ''}`;
  // 同一zIndexのマーカーは重なると描画順が不定で点滅するため、idハッシュで一意にする
  const zIndex = Platform.OS === 'ios' ? markerZIndex(MARKER_BAND.MAPMEMO, feature.id) : undefined;
  switch (stamp) {
    //数字・英字・文字はレイヤのラベル設定の値を描く。ラベルが「なし」なら描くものが無い
    case 'NUMBERS':
    case 'ALPHABETS':
    case 'TEXT': {
      if (label === undefined || label === '') return null;
      //文字は桁数が多くなるので横長の枠にする
      const isText = stamp === 'TEXT';
      const boxWidth = (isText ? 80 : 20) * scale;
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
          <View style={{ width: boxWidth, height: size }}>
            <Svg height={size} width={boxWidth} viewBox={isText ? '0 0 80 20' : '0 0 20 20'}>
              <Text
                x={isText ? '40' : '10'}
                y={isText ? '15' : '14'}
                fontSize={isText ? '12' : '16'}
                fontWeight="bold"
                fill={lineColor}
                textAnchor="middle"
              >
                {label}
              </Text>
            </Svg>
          </View>
        </Marker>
      );
    }
    default: {
      //記号は保存後とプレビューで同じ図形を使う（HomeStampSymbol）
      if (!hasStampSymbol(stamp)) return null;
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
              <StampSymbol stamp={stamp} lineColor={lineColor} />
            </Svg>
          </View>
        </Marker>
      );
    }
  }
});
