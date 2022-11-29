import React from 'react';
import { View, Text } from 'react-native';
import { LatLng, Marker } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  coordinate: LatLng;
  label: string;
  size: number;
  color: string;
}

const PolygonLabel = React.memo((props: Props) => {
  const { coordinate, label, size, color } = props;
  return (
    <Marker coordinate={coordinate}>
      <View style={{ alignItems: 'center' }}>
        <Text
          style={{
            fontSize: size,
            color: color,
            textShadowOffset: {
              width: 1,
              height: 1,
            },
            textShadowRadius: 1,
            textShadowColor: COLOR.WHITE,
          }}
        >
          {label}
        </Text>
      </View>
    </Marker>
  );
});

export default PolygonLabel;
