import React from 'react';
import { View } from 'react-native';
import { Layer, Source } from 'react-map-gl/maplibre';
import { RecordType, LayerType } from '../../types';
import { generateGeoJson } from '../../utils/Geometry';
import { getDataStylePolygon, getDataStylePolygonOutline, getLabelStyle } from '../../utils/MapGl.web';

interface Props {
  data: RecordType[];
  layer: LayerType;
  zoom: number;
  zIndex: number;
}

export const Polygon = React.memo((props: Props) => {
  const { data, layer, zoom } = props;
  const displayName = data.length === 0 ? '' : data[0].displayName ? data[0].displayName : '';
  const userId = data.length === 0 ? '' : data[0].userId ? data[0].userId : '';

  const labelStyle = getLabelStyle(layer, userId, displayName);
  const dataStylePolygon = getDataStylePolygon(layer, userId, displayName);

  const dataStyleOutline = getDataStylePolygonOutline(layer, userId, displayName);

  if (data === undefined || data.length === 0) return null;

  const geojsonData = generateGeoJson(data, layer.field, 'POLYGON', layer.name);
  const geojsonLabel = generateGeoJson(data, layer.field, 'CENTROID', layer.name);
  //console.log(geojsonData);
  return (
    <View>
      {zoom >= 11 && (
        //@ts-ignore
        <Source type="geojson" data={geojsonLabel}>
          {/*// @ts-ignore*/}
          <Layer {...labelStyle} />
        </Source>
      )}
      {/*// @ts-ignore*/}
      <Source type="geojson" data={geojsonData}>
        {/*// @ts-ignore*/}
        <Layer {...dataStyleOutline} />
      </Source>
      {/*// @ts-ignore*/}
      <Source id={`${layer.id}_${userId}`} type="geojson" data={geojsonData} promoteId={'_id'}>
        {/*// @ts-ignore*/}
        <Layer {...dataStylePolygon} />
      </Source>
    </View>
  );
});
