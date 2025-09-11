import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Marker, Polyline, Circle } from 'react-native-maps';
import { LocationType } from '../../types';

interface Props {
  currentLocation: LocationType;
  azimuth: number;
  headingUp: boolean;
  onPress?: () => void;
  showDirectionLine?: boolean;
}

export const CurrentMarker = (props: Props) => {
  const { currentLocation, azimuth, headingUp, onPress, showDirectionLine } = props;
  const accuracy = currentLocation.accuracy ?? 0;
  const fillColor = accuracy > 30 ? '#bbbbbbaa' : accuracy > 15 ? '#ff9900aa' : '#ff0000aa';

  // マーカー画像の選択
  const markerImage = useMemo(() => {
    if (accuracy > 30) return require('../../assets/marker_gray.png');
    if (accuracy > 15) return require('../../assets/marker_orange.png');
    return require('../../assets/marker_red.png');
  }, [accuracy]);

  // Low-pass filter to smooth azimuth values
  const filteredAzimuthRef = useRef(azimuth);
  const [filteredAzimuth, setFilteredAzimuth] = useState(azimuth);
  const ALPHA = 0.2; // Lower value for more smoothing to reduce hand shake

  useEffect(() => {
    // Apply low-pass filter with angle wrapping
    let delta = azimuth - filteredAzimuthRef.current;

    // Handle angle wrapping (e.g., 359 to 1 should be +2, not -358)
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    // 微小揺れは無視して不要な再レンダー抑制
    if (Math.abs(delta) < 0.05) return;

    const newFilteredValue = filteredAzimuthRef.current + ALPHA * delta;

    // Normalize to 0-360 range
    const normalizedValue = ((newFilteredValue % 360) + 360) % 360;

    filteredAzimuthRef.current = normalizedValue;
    setFilteredAzimuth(normalizedValue);
  }, [azimuth]);

  const markerAngle = useMemo(() => {
    return headingUp ? 0 : filteredAzimuth;
  }, [headingUp, filteredAzimuth]);

  // redraw() は使用しない (iOS での初動ちらつき軽減)

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
      {accuracy > 0 && (
        <Circle
          center={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }}
          radius={accuracy}
          fillColor={fillColor.replace('aa', '33')} // More transparent fill
          strokeColor={fillColor}
          strokeWidth={1}
          zIndex={999}
        />
      )}
      {showDirectionLine && lineCoordinates.length > 0 && (
        <Polyline coordinates={lineCoordinates} strokeColor="#000000" strokeWidth={1} zIndex={1000} />
      )}
      <Marker
        coordinate={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }}
        rotation={markerAngle}
        anchor={{ x: 0.5, y: 0.5 }}
        style={{ zIndex: 1001 }}
        onPress={onPress}
        image={markerImage}
      />
    </>
  );
};
