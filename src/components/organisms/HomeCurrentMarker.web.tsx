import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { LocationType } from '../../types';
import { Marker } from 'react-map-gl/maplibre';

interface Props {
  currentLocation: LocationType;
  // キャッシュ由来の古い位置（衛星捕捉中）。灰色で表示する。
  isStale?: boolean;
  //angle: number;
}

export const CurrentMarker = (props: Props) => {
  const { currentLocation, isStale } = props;

  //console.log(angle);

  return (
    <Marker {...currentLocation} offset={[-24 / 2, -15.72 / 2]} anchor={'top-left'}>
      <div
        style={{
          transform: 'rotate(-45deg)',
        }}
      >
        <FontAwesome name="location-arrow" size={20} color={isStale ? '#888888' : 'red'} />
      </div>
    </Marker>
  );
};
