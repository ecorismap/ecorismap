import React, { useEffect, useState } from 'react';

import { Geojson } from 'react-native-maps';
import RNFetchBlob from 'rn-fetch-blob';
import Pbf from 'pbf';
import { Buffer } from 'buffer';
import VectorTile from '@mapbox/vector-tile';
import { Feature, GeoJsonProperties, Geometry } from 'geojson';
import * as turf from '@turf/turf';

interface Props {
  z: number;
  x: number;
  y: number;
}

export const VectorPolygon = React.memo((prop: Props) => {
  const { z, x, y } = prop;
  const [features, setFeatures] = useState<Feature<Geometry, GeoJsonProperties>[]>([]);
  //const LAYER_NAME = 'RdCL';
  const LAYER_NAME = 'AdmArea';
  useEffect(() => {
    //console.log('zxy', z, x, y);
    RNFetchBlob.fetch('GET', `https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/${z}/${x}/${y}.pbf`)
      .then((response) => {
        const base64Data = response.data;
        const binaryData = Buffer.from(base64Data, 'base64');
        const pbf = new Pbf(binaryData);
        const layer = new VectorTile.VectorTile(pbf).layers[LAYER_NAME];
        //console.log(layer);
        const features_ = layer
          ? Array.from({ length: layer.length }, (_, i) => layer.feature(i).toGeoJSON(x, y, z))
          : [];
        //console.log(features_);
        setFeatures(features_);
      })
      .catch((error) => {
        //console.error(error));
      });
  }, [x, y, z]);

  const geojson = {
    type: 'FeatureCollection' as const,
    features: features,
  };

  return <Geojson geojson={geojson} zIndex={100} strokeColor="red" fillColor="#00000000" strokeWidth={2} />;
});
