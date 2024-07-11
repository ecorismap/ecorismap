import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Marker, Callout } from 'react-native-maps';
import { LocationType } from '../../types';
import { t } from '../../i18n/config';

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
  azimuth: number;
  headingUp: boolean;
  distance: number;
}

const areEqual = (prevProps: Props, nextProps: Props) => {
  // Compare azimuth with a tolerance of 3 degrees
  const azimuthChanged = Math.abs(prevProps.azimuth - nextProps.azimuth) > 3;
  const locationChanged =
    prevProps.currentLocation.latitude !== nextProps.currentLocation.latitude ||
    prevProps.currentLocation.longitude !== nextProps.currentLocation.longitude;
  const headingUpChanged = prevProps.headingUp !== nextProps.headingUp;

  return !azimuthChanged && !locationChanged && !headingUpChanged;
};

export const CurrentMarker = React.memo((props: Props) => {
  const { currentLocation, azimuth, headingUp, distance } = props;
  const accuracy = currentLocation.accuracy ?? 0;
  const fillColor = accuracy > 30 ? '#bbbbbb' : accuracy > 15 ? '#ff9900aa' : '#ff0000aa';
  const markerAngle = useMemo(() => {
    return headingUp ? 0 : azimuth;
  }, [azimuth, headingUp]);

  // State to force marker redraw
  const markerRef = useRef(null);

  useEffect(() => {
    if (markerRef.current) {
      //@ts-ignore
      markerRef.current.redraw();
    }
  }, [azimuth, currentLocation, headingUp]);

  return (
    <Marker
      ref={markerRef}
      coordinate={{
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      }}
      anchor={{ x: 0.5, y: 0.5 }}
      style={{ zIndex: 1001 }}
      tracksViewChanges={false}
    >
      <View
        style={{
          transform: [{ rotate: `${markerAngle}deg` }],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg height="50" width="50">
          <G stroke="white" strokeWidth="2" strokeLinejoin="round">
            <Path d="M25 1 L40 33 L25 25 L10 33 Z" fill={fillColor} />
          </G>
        </Svg>
      </View>
      <Callout>
        <View style={styles.calloutStyle}>
          <Text>Latitude: {decimalToDMS(currentLocation.latitude)}</Text>
          <Text>Longitude: {decimalToDMS(currentLocation.longitude)}</Text>
          <Text>Accuracy: {Math.floor(accuracy)} m</Text>
          <Text>{`${t('common.distance')}: ${distance === 0 ? ' - ' : distance.toFixed(2)}km`}</Text>
        </View>
      </Callout>
    </Marker>
  );
}, areEqual);

const styles = StyleSheet.create({
  calloutStyle: {
    borderRadius: 5,
    borderWidth: 2,
    height: 95,
    padding: 5,
    width: 200,
  },
});
