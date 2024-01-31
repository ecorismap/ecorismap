import React, { useMemo } from 'react';
import { Platform, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { LayerType, PointRecordType } from '../../types';
import { PointView } from '../atoms';
import { getColor } from '../../utils/Layer';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  feature: PointRecordType;
  layer: LayerType;
}

export const Point2 = React.memo((props: Props) => {
  //console.log('render Point');

  const { feature, layer } = props;
  //console.log(feature.field[layer.label]);

  const color = useMemo(() => getColor(layer, feature, 0), [feature, layer]);

  const pointColor = useMemo(() => color, [color]);
  const borderColor = useMemo(() => COLOR.WHITE, []);

  return (
    <Marker
      tracksViewChanges={Platform.OS === 'ios' ? true : false} //ラベル変更と色変更を反映するため.androidは常にtrueだとパフォーマンスが落ちるため選択時のみtrue
      coordinate={feature.coords}
      opacity={0.8}
      anchor={{ x: 0.5, y: 0.5 }}
      style={{ zIndex: -1, alignItems: 'center' }}
    >
      {/* <PointView size={15} color={pointColor} borderColor={borderColor} /> */}
      <View style={{ width: 20, height: 20 }}>
        <Svg height="20" width="20" viewBox="0 0 20 20">
          <Circle cx="10" cy="10" r="8" stroke="black" strokeWidth="3" fill="none" />
          <Circle cx="10" cy="10" r="4" stroke="black" strokeWidth="3" fill="none" />
        </Svg>
      </View>
    </Marker>
  );
});
