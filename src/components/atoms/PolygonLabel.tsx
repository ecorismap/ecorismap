import React from 'react';
import { View, Text, Platform } from 'react-native';
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
  const isWeb = Platform.OS === 'web';

  return (
    <Marker coordinate={coordinate} tracksViewChanges={Platform.OS === 'ios'}>
      <View style={{ alignItems: 'center' }}>
        <Text
          style={{
            fontSize: size,
            color,
            ...(isWeb
              ? { textShadow: `1px 1px 1px ${COLOR.WHITE}` }
              : {
                  textShadowOffset: { width: 1, height: 1 },
                  textShadowRadius: 1,
                  textShadowColor: COLOR.WHITE,
                }),
          }}
        >
          {label}
        </Text>
      </View>
    </Marker>
  );
});

export default PolygonLabel;
