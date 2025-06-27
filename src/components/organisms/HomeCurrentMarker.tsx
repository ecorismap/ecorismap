import React, { useMemo, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Marker, Polyline } from 'react-native-maps';
import { LocationType } from '../../types';

interface Props {
  currentLocation: LocationType;
  azimuth: number;
  headingUp: boolean;
  distance: number;
  onPress?: () => void;
  showDirectionLine?: boolean;
}

const areEqual = (prevProps: Props, nextProps: Props) => {
  // Compare azimuth with a smaller tolerance for smoother rotation
  const azimuthChanged = Math.abs(prevProps.azimuth - nextProps.azimuth) > 0.5;
  const locationChanged =
    prevProps.currentLocation.latitude !== nextProps.currentLocation.latitude ||
    prevProps.currentLocation.longitude !== nextProps.currentLocation.longitude;
  const headingUpChanged = prevProps.headingUp !== nextProps.headingUp;
  const showDirectionLineChanged = prevProps.showDirectionLine !== nextProps.showDirectionLine;

  // Don't check mapBounds changes as they change frequently
  // We only care about azimuth, location, headingUp, and showDirectionLine for re-rendering

  return !azimuthChanged && !locationChanged && !headingUpChanged && !showDirectionLineChanged;
};

export const CurrentMarker = React.memo((props: Props) => {
  const { currentLocation, azimuth, headingUp, onPress, showDirectionLine } = props;
  const accuracy = currentLocation.accuracy ?? 0;
  const fillColor = accuracy > 30 ? '#bbbbbb' : accuracy > 15 ? '#ff9900aa' : '#ff0000aa';
  const markerAngle = useMemo(() => {
    return headingUp ? 0 : azimuth;
  }, [azimuth, headingUp]);

  // State to force marker redraw
  const markerRef = useRef(null);

  // Calculate line coordinates for Polyline
  const lineCoordinates = useMemo(() => {
    if (!showDirectionLine) return [];

    // Important: Start from the arrow tip, not the marker center
    // The arrow tip is 24 pixels above the center in the 50x50 SVG
    // Need to calculate this offset in degrees based on current map zoom
    // This is a rough approximation - adjust as needed
    const tipOffset = 0.00015;

    const angleRad = ((90 - markerAngle) * Math.PI) / 180;

    // Calculate the arrow tip position
    const startLat = currentLocation.latitude + tipOffset * Math.sin(angleRad);
    const startLon =
      currentLocation.longitude +
      (tipOffset * Math.cos(angleRad)) / Math.cos((currentLocation.latitude * Math.PI) / 180);

    // Calculate the end point (far away)
    const distance = 10; // 10 degrees
    const endLat = currentLocation.latitude + distance * Math.sin(angleRad);
    const endLon =
      currentLocation.longitude +
      (distance * Math.cos(angleRad)) / Math.cos((currentLocation.latitude * Math.PI) / 180);

    return [
      {
        latitude: startLat,
        longitude: startLon,
      },
      {
        latitude: endLat,
        longitude: endLon,
      },
    ];
  }, [currentLocation, markerAngle, showDirectionLine]);

  return (
    <>
      {showDirectionLine && lineCoordinates.length > 0 && (
        <Polyline
          coordinates={lineCoordinates}
          strokeColor="#FF0000"
          strokeWidth={2}
          lineDashPattern={[10, 5]}
          zIndex={1000}
        />
      )}
      <Marker
        ref={markerRef}
        coordinate={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }}
        anchor={{ x: 0.5, y: 0.5 }}
        style={{ zIndex: 1001 }}
        tracksViewChanges={true}
        onPress={onPress}
      >
        <View
          style={{
            transform: [{ rotate: `${markerAngle}deg` }],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg height="50" width="50" viewBox="0 0 50 50">
            <G stroke="white" strokeWidth="2" strokeLinejoin="round">
              <Path d="M25 1 L40 33 L25 25 L10 33 Z" fill={fillColor} />
            </G>
          </Svg>
        </View>
      </Marker>
    </>
  );
}, areEqual);
