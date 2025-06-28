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
  // Only prevent re-render if location and key props haven't changed
  // Allow all azimuth changes to pass through for smooth rotation
  const locationChanged =
    prevProps.currentLocation.latitude !== nextProps.currentLocation.latitude ||
    prevProps.currentLocation.longitude !== nextProps.currentLocation.longitude;
  const headingUpChanged = prevProps.headingUp !== nextProps.headingUp;
  const showDirectionLineChanged = prevProps.showDirectionLine !== nextProps.showDirectionLine;

  return !locationChanged && !headingUpChanged && !showDirectionLineChanged;
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

    // Now the marker anchor is at the arrow tip, so we start from the current location
    const angleRad = ((90 - markerAngle) * Math.PI) / 180;

    // Calculate the end point (far away)
    const distance = 10; // 10 degrees
    const endLat = currentLocation.latitude + distance * Math.sin(angleRad);
    const endLon =
      currentLocation.longitude +
      (distance * Math.cos(angleRad)) / Math.cos((currentLocation.latitude * Math.PI) / 180);

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
        style={{ zIndex: 1001, overflow: 'visible' }}
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
