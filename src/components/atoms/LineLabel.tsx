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
  //console.log(arrow.deg);
  return (
    <Marker
      anchor={{ x: 1, y: 1 }}
      coordinate={coordinate}
      tracksViewChanges={Platform.OS === 'ios' ? true : false}
      zIndex={9999}
    >
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
            textShadowColor: borderColor,
          }}
        >
          {label}
        </Text>
      </View>
    </Marker>
  );
});

export default LineLabel;
