import React from 'react';
import { View } from 'react-native';

import { Polygon, Polyline } from 'react-native-maps';

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

// 保存済みは従来のオレンジ。未完了（ダウンロード中・一時停止）は一部しか保存されていないので、
// 保存済みと誤認しないよう灰色の塗りと破線の枠で描く。Polygon の破線は Google Maps（iOS）と
// Android の新アーキテクチャで効かないため、枠は破線の Polyline を重ねて描く
const SAVED_FILL_COLOR = 'rgba(255,165,0,0.2)';
const INCOMPLETE_FILL_COLOR = 'rgba(128,128,128,0.25)';
const INCOMPLETE_DASH_PATTERN = [8, 6];

const SavedArea = (props: Props_SavedArea) => {
  const { savedArea } = props;

  return (
    <>
      {savedArea.map((region, regionIndex) =>
        region.status !== undefined ? (
          <View key={region.id || regionIndex}>
            <Polygon
              coordinates={region.coords}
              strokeColor={'transparent'}
              fillColor={INCOMPLETE_FILL_COLOR}
              strokeWidth={0}
              zIndex={100}
            />
            <Polyline
              coordinates={[...region.coords, region.coords[0]]}
              strokeColor={'black'}
              strokeWidth={2}
              lineDashPattern={INCOMPLETE_DASH_PATTERN}
              zIndex={100}
            />
          </View>
        ) : (
          <View key={region.id || regionIndex}>
            <Polygon
              coordinates={region.coords}
              strokeColor={'black'}
              fillColor={SAVED_FILL_COLOR}
              strokeWidth={2}
              zIndex={100}
            />
          </View>
        )
      )}
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
