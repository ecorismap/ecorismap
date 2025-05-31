import React from 'react';

import { Polygon } from 'react-native-maps';
import { TileRegionType } from '../../types';

interface Props_ProgressArea {
  pdfArea: TileRegionType;
}

type Props = Props_ProgressArea;

export const PDFArea = React.memo((props: Props) => {
  const { pdfArea } = props;

  return (
    <>
      <Polygon
        coordinates={pdfArea.coords}
        strokeColor={'black'}
        fillColor={'rgba(255,0,0,0.2)'}
        strokeWidth={2}
        zIndex={100}
      />
    </>
  );
});
