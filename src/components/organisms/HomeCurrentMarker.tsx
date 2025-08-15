import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { Marker, Polyline, Circle } from 'react-native-maps';
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
  const fillColor = accuracy > 30 ? '#bbbbbbaa' : accuracy > 15 ? '#ff9900aa' : '#ff0000aa';

  // Low-pass filter to smooth azimuth values
  const filteredAzimuthRef = useRef(azimuth);
  const [filteredAzimuth, setFilteredAzimuth] = useState(azimuth);
  const ALPHA = 0.2; // Lower value for more smoothing to reduce hand shake

  // Marker reference (将来拡張用 / redraw は行わない)
  const markerRef = useRef<any>(null);

  // --- 一時的 tracksViewChanges 制御: 外観(色)変化時のみ再キャプチャ ---
  const [trackViewChanges, setTrackViewChanges] = useState(true); // 初回は true でキャプチャ
  const prevFillColorRef = useRef(fillColor);

  // 色が変わった (精度リング色も含む) 場合に一時的に true
  useEffect(() => {
    if (prevFillColorRef.current !== fillColor) {
      prevFillColorRef.current = fillColor;
      setTrackViewChanges(true);
    }
  }, [fillColor]);

  // true にした後 350ms で false へ戻しキャッシュ利用
  useEffect(() => {
    if (trackViewChanges) {
      const id = setTimeout(() => setTrackViewChanges(false), 350);
      return () => clearTimeout(id);
    }
  }, [trackViewChanges]);

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
        ref={markerRef}
        coordinate={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }}
        rotation={markerAngle}
        anchor={{ x: 0.5, y: 0.5 }}
        style={{ zIndex: 1001 }}
        tracksViewChanges={trackViewChanges}
        onPress={onPress}
      >
        <View
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            width: 80,
            height: 80,
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
