import React from 'react';
import { View, Text } from 'react-native';
import { Marker, LatLng } from 'react-native-maps';
import { LocationType } from '../../types';

interface Props {
  arrow: { coords: LocationType; deg: number };
  coordinate: LatLng;
  label: string;
  size: number;
  color: string;
  borderColor: string;
}

const LineLabel = React.memo((props: Props) => {
  const { arrow, label, size, color, borderColor } = props;
  //console.log(arrow.deg);
  return (
    <Marker
      style={
        {
          //transform: [{ rotate: `${arrow.deg}deg` }],
        }
      }
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={arrow.coords}
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
        {/* <Circle fill="black" /> */}
        {/*Textのcolorにcolorを適用しないとなぜかマーカーの色も変わらない*/}
        {/**** 矢印****** */}
        {/* <View
              style={{
                width: 0,
                height: 0,
                backgroundColor: "transparent",
                borderStyle: "solid",
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderBottomWidth: 2,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderBottomColor: { color },
              }}
            /> */}
      </View>
    </Marker>
  );
});

export default LineLabel;
