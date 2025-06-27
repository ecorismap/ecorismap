import React, { useMemo, useEffect, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Path, G, Line } from 'react-native-svg';
import { Marker } from 'react-native-maps';
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
  // Compare azimuth with a tolerance of 3 degrees
  const azimuthChanged = Math.abs(prevProps.azimuth - nextProps.azimuth) > 3;
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

  useEffect(() => {
    if (markerRef.current) {
      //@ts-ignore
      markerRef.current.redraw();
    }
  }, [markerAngle]);

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
      onPress={onPress}
    >
      <View
        style={{
          transform: [{ rotate: `${markerAngle}deg` }],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg
          height={showDirectionLine ? '1000' : '50'}
          width={showDirectionLine ? '1000' : '50'}
          viewBox={showDirectionLine ? '-475 -475 1000 1000' : '0 0 50 50'}
        >
          <G stroke="white" strokeWidth="2" strokeLinejoin="round">
            {showDirectionLine && (
              <Line x1="25" y1="25" x2="25" y2="-475" stroke="#FF0000" strokeWidth="2" strokeDasharray="10,5" />
            )}
            <Path d="M25 1 L40 33 L25 25 L10 33 Z" fill={fillColor} />
          </G>
        </Svg>
      </View>
    </Marker>
  );
}, areEqual);
