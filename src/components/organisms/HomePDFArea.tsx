import React from 'react';

import { Polygon } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { TileRegionType } from '../../types';
import { hex2rgba } from '../../utils/Color';

interface Props_ProgressArea {
  pdfArea: TileRegionType;
}

type Props = Props_ProgressArea;

export const PDFArea = (props: Props) => {
  const { pdfArea } = props;

  return (
    <>
      <Polygon
        coordinates={pdfArea.coords}
        strokeColor={'black'}
        fillColor={hex2rgba(COLOR.RED, 0.2)}
        strokeWidth={2}
        zIndex={100}
      />
    </>
  );
};
