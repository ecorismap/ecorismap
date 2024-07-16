import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { LocationType } from '../../types';
import { Marker } from 'react-map-gl/maplibre';

interface Props {
  currentLocation: LocationType;
  //angle: number;
}

export const CurrentMarker = (props: Props) => {
  const { currentLocation } = props;

  //console.log(angle);

  return (
    <Marker {...currentLocation} offset={[-24 / 2, -15.72 / 2]} anchor={'top-left'}>
      <div
        style={{
          transform: 'rotate(-45deg)',
        }}
      >
        <FontAwesome name="location-arrow" size={20} color={'red'} />
      </div>
    </Marker>
  );
};
