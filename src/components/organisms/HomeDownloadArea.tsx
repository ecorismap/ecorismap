import React from 'react';
import { View } from 'react-native';

import { Marker, Polygon } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { TileRegionType } from '../../types';
import { hex2rgba } from '../../utils/Color';

interface Props_ProgressArea {
  zoom: number;
  downloading: boolean;
  downloadArea: TileRegionType;
  onPress: () => void;
}

interface Props_SavedArea {
  savedArea: TileRegionType[];
}

type Props = Props_ProgressArea & Props_SavedArea;

export const DownloadArea = (props: Props) => {
  const { zoom, downloading, downloadArea, savedArea, onPress } = props;
  return (
    <>
      <SavedArea savedArea={savedArea} />
      <ProgressArea zoom={zoom} downloading={downloading} downloadArea={downloadArea} onPress={onPress} />
    </>
  );
};

const SavedArea = (props: Props_SavedArea) => {
  const { savedArea } = props;

  return (
    <>
      {savedArea.map(({ coords }, regionIndex) => (
        <View key={regionIndex}>
          <Polygon
            coordinates={coords}
            strokeColor={'black'}
            fillColor={hex2rgba(COLOR.ORANGE, 0.2)}
            strokeWidth={2}
            zIndex={100}
          />
        </View>
      ))}
    </>
  );
};

const ProgressArea = (props: Props_ProgressArea) => {
  const { zoom, downloading, downloadArea, onPress } = props;
  //console.log(downloadArea);

  return (
    <>
      {zoom >= 11 && zoom <= 14 && !downloading && (
        <Marker anchor={{ x: 0.5, y: 0.5 }} coordinate={downloadArea.centroid} onPress={onPress} zIndex={10000}>
          <Button size={30} name="download" backgroundColor={COLOR.RED} />
        </Marker>
      )}

      <Polygon
        coordinates={downloadArea.coords}
        strokeColor={'black'}
        fillColor={hex2rgba(COLOR.RED, 0.2)}
        strokeWidth={2}
        zIndex={100}
      />
    </>
  );
};
