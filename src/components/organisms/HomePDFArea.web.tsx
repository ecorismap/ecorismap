import React from 'react';
import { View } from 'react-native';
import { Layer, Source } from 'react-map-gl/maplibre';
import { TileRegionType } from '../../types';

interface Props {
  pdfArea: TileRegionType;
}

export const PDFArea = React.memo((props: Props) => {
  const { pdfArea } = props;
  const coordinates = pdfArea.coords.map((coord) => [coord.longitude, coord.latitude]);
  //pdfAreaを単純に描画する
  const features = {
    type: 'FeatureCollection',
    name: 'pdfArea',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      },
    ],
  };

  return (
    <View>
      {/*// @ts-ignore*/}
      <Source id="pdfArea" type="geojson" data={features}>
        <Layer
          id="pdfArea"
          type="fill"
          source="pdfArea"
          paint={{
            'fill-color': '#ff0000',
            'fill-opacity': 0.2,
          }}
        />
      </Source>
    </View>
  );
});
