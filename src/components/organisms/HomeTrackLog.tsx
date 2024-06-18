import React from 'react';
import { Polyline } from 'react-native-maps';

import { COLOR } from '../../constants/AppConstants';
import { TrackLogType } from '../../types';

interface Props {
  data: TrackLogType;
}

export const TrackLog = React.memo((props: Props) => {
  const { data } = props;
  if (data === undefined) return null;

  return (
    <Polyline
      tappable={false}
      coordinates={data.trackLog}
      strokeColor={COLOR.TRACK}
      strokeWidth={4}
      lineCap="butt"
      zIndex={101}
    />
  );
});
