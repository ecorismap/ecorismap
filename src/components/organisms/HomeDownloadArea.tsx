import React from 'react';
import { View } from 'react-native';

import { Polygon } from 'react-native-maps';

import { TileRegionType } from '../../types';

interface Props_ProgressArea {
  downloadArea: TileRegionType;
  onPress: () => void;
}

interface Props_SavedArea {
  savedArea: TileRegionType[];
}

type Props = Props_ProgressArea & Props_SavedArea;

export const DownloadArea = React.memo((props: Props) => {
  const { downloadArea, savedArea, onPress } = props;
  return (
    <>
      <SavedArea savedArea={savedArea} />
      <ProgressArea downloadArea={downloadArea} onPress={onPress} />
    </>
  );
});

const SavedArea = (props: Props_SavedArea) => {
  const { savedArea } = props;

  return (
    <>
      {savedArea.map(({ coords }, regionIndex) => (
        <View key={regionIndex}>
          <Polygon
            coordinates={coords}
            strokeColor={'black'}
            fillColor={'rgba(255,165,0,0.2)'}
            strokeWidth={2}
            zIndex={100}
          />
        </View>
      ))}
    </>
  );
};

const ProgressArea = (props: Props_ProgressArea) => {
  const { downloadArea } = props;

  return (
    <Polygon
      coordinates={downloadArea.coords}
      strokeColor={'black'}
      fillColor={'rgba(255,0,0,0.2)'}
      strokeWidth={2}
      zIndex={100}
    />
  );
};
