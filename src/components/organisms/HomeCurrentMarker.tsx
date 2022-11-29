import React from 'react';
import { FontAwesome } from '@expo/vector-icons';

import { Marker } from 'react-native-maps';
import { LocationType } from '../../types';

interface Props {
  currentLocation: LocationType;
  angle: number;
}

export const CurrentMarker = (props: Props) => {
  const { currentLocation, angle } = props;

  //console.log(angle);

  return (
    <Marker
      coordinate={{
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      }}
      //rotation={angle ? angle - 45 : -45}
      opacity={0.9}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={true}
    >
      <FontAwesome
        name="location-arrow"
        size={20}
        style={{
          transform: [{ rotate: `${angle ? angle - 45 : -45}deg` }],
        }}
        color={currentLocation.accuracy && currentLocation.accuracy > 10 ? 'orange' : 'red'}
      />
    </Marker>
  );
};
