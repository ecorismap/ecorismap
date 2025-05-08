import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Marker, LatLng } from 'react-native-maps';

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

  return (
    <Marker anchor={{ x: 1, y: 1 }} coordinate={coordinate} tracksViewChanges={Platform.OS === 'ios'} zIndex={9999}>
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
