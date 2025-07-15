import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Marker, Polyline } from 'react-native-maps';
import { LocationType } from '../../types';

interface Props {
  currentLocation: LocationType;
  azimuth: number;
  headingUp: boolean;
  onPress?: () => void;
  showDirectionLine?: boolean;
}

const areEqual = (prevProps: Props, nextProps: Props) => {
  // Balance between performance and smooth rotation
  const azimuthThreshold = 2.0; // Increased to reduce jitter from hand movement
  const azimuthChanged = Math.abs(prevProps.azimuth - nextProps.azimuth) > azimuthThreshold;

  // Add location threshold to reduce GPS jitter
  const locationThreshold = 0.000005; // Approximately 0.5 meters
  const locationChanged =
    Math.abs(prevProps.currentLocation.latitude - nextProps.currentLocation.latitude) > locationThreshold ||
    Math.abs(prevProps.currentLocation.longitude - nextProps.currentLocation.longitude) > locationThreshold;

  const headingUpChanged = prevProps.headingUp !== nextProps.headingUp;
  const showDirectionLineChanged = prevProps.showDirectionLine !== nextProps.showDirectionLine;

  // Re-render if any significant change occurred
  return !azimuthChanged && !locationChanged && !headingUpChanged && !showDirectionLineChanged;
};

export const CurrentMarker = React.memo((props: Props) => {
  const { currentLocation, azimuth, headingUp, onPress, showDirectionLine } = props;
  const accuracy = currentLocation.accuracy ?? 0;
  const fillColor = accuracy > 30 ? '#bbbbbb' : accuracy > 15 ? '#ff9900' : '#ff0000';

  // Low-pass filter to smooth azimuth values
  const filteredAzimuthRef = useRef(azimuth);
  const [filteredAzimuth, setFilteredAzimuth] = useState(azimuth);
  const ALPHA = 0.2; // Lower value for more smoothing to reduce hand shake

  // Marker reference for manual redraw
  const markerRef = useRef<any>(null);

  useEffect(() => {
    // Apply low-pass filter with angle wrapping
    let delta = azimuth - filteredAzimuthRef.current;

    // Handle angle wrapping (e.g., 359 to 1 should be +2, not -358)
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const newFilteredValue = filteredAzimuthRef.current + ALPHA * delta;

    // Normalize to 0-360 range
    const normalizedValue = ((newFilteredValue % 360) + 360) % 360;

    filteredAzimuthRef.current = normalizedValue;
    setFilteredAzimuth(normalizedValue);
  }, [azimuth]);

  const markerAngle = useMemo(() => {
    return headingUp ? 0 : filteredAzimuth;
  }, [headingUp, filteredAzimuth]);

  // Manually redraw marker when markerAngle or fillColor changes
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.redraw();
    }
  }, [markerAngle, fillColor]);

  // Calculate line coordinates for Polyline
  const lineCoordinates = useMemo(() => {
    if (!showDirectionLine) return [];

    // When headingUp is true, the map rotates by azimuth degrees
    // So the line should point in the azimuth direction (geographic)
    // which will appear as pointing up on the rotated map
    const lineAngle = headingUp ? filteredAzimuth : markerAngle;
    const angleRad = ((90 - lineAngle) * Math.PI) / 180;

    // Calculate the end point (far away)
    const lineDistance = 10; // 10 degrees
    const endLat = currentLocation.latitude + lineDistance * Math.sin(angleRad);
    const endLon =
      currentLocation.longitude +
      (lineDistance * Math.cos(angleRad)) / Math.cos((currentLocation.latitude * Math.PI) / 180);

    return [
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      },
      {
        latitude: endLat,
        longitude: endLon,
      },
    ];
  }, [currentLocation, markerAngle, showDirectionLine, headingUp, filteredAzimuth]);

  return (
    <>
      {showDirectionLine && lineCoordinates.length > 0 && (
        <Polyline coordinates={lineCoordinates} strokeColor="#000000" strokeWidth={1} zIndex={1000} />
      )}
      <Marker
        ref={markerRef}
        coordinate={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }}
        anchor={{ x: 0.5, y: 0.5 }}
        style={{ zIndex: 1001 }}
        tracksViewChanges={false}
        onPress={onPress}
      >
        <View
          style={{
            transform: [{ rotate: `${markerAngle}deg` }],
            alignItems: 'center',
            justifyContent: 'center',
            width: 80,
            height: 80,
            overflow: 'visible',
          }}
        >
          <Svg height="80" width="80" viewBox="0 0 80 80">
            <G stroke="white" strokeWidth="2" strokeLinejoin="round">
              <Path d="M40 40 L55 72 L40 64 L25 72 Z" fill={fillColor} />
            </G>
          </Svg>
        </View>
      </Marker>
    </>
  );
}, areEqual);
