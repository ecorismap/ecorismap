import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';

import { Marker, Callout } from 'react-native-maps';
import { LocationType } from '../../types';

// Helper function to convert decimal degrees to DMS (degrees, minutes, seconds)
const decimalToDMS = (coord: number) => {
  const absolute = Math.abs(coord);
  const degrees = Math.floor(absolute);
  const minutesNotTruncated = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesNotTruncated);
  const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(2);
  return `${degrees}° ${minutes}' ${seconds}"`;
};

interface Props {
  currentLocation: LocationType;
  angle: number;
}

export const CurrentMarker = (props: Props) => {
  const { currentLocation, angle } = props;

  const accuracy = currentLocation.accuracy ?? 0;

  return (
    <Marker
      coordinate={{
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={true}
    >
      <View
        style={{
          transform: [{ rotate: `${angle ? angle : 0}deg` }],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg height="50" width="50">
          <G stroke="white" strokeWidth="2" strokeLinejoin="round">
            <Path d="M25 1 L40 33 L25 25 L10 33 Z" fill="#ff0000aa" />
          </G>
        </Svg>
      </View>

      <Callout>
        <View style={styles.calloutStyle}>
          <Text>Latitude: {decimalToDMS(currentLocation.latitude)}</Text>
          <Text>Longitude: {decimalToDMS(currentLocation.longitude)}</Text>
          <Text>Altitude: {currentLocation.altitude} m</Text>
          <Text>Accuracy: {Math.floor(accuracy)} m</Text>
        </View>
      </Callout>
    </Marker>
  );
};

const styles = StyleSheet.create({
  calloutStyle: {
    borderRadius: 5,
    borderWidth: 2,
    padding: 5,
    width: 200,
  },
});
