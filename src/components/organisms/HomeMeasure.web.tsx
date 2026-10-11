import React, { useContext, useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { COLOR } from '../../constants/AppConstants';
import { MeasureContext } from '../../contexts/Measure';
import { LocationType } from '../../types';

// 二点間距離測定の線・端点マーカー（Web版）。距離の数値は上部のバナー（HomeMeasureBanner）に出す
export const HomeMeasure = React.memo(() => {
  const { measureA, measureB } = useContext(MeasureContext);

  const lineGeojson = useMemo(() => {
    if (!measureA || !measureB) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [measureA.longitude, measureA.latitude],
          [measureB.longitude, measureB.latitude],
        ],
      },
    };
  }, [measureA, measureB]);

  if (!measureA) return null;

  return (
    <>
      {lineGeojson && (
        <Source id="measure-line" type="geojson" data={lineGeojson}>
          {/* 白い縁取りを下に敷き、その上にオレンジの破線を重ねる（どの背景地図でも線が埋もれないように） */}
          <Layer
            id="measure-line-halo-layer"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': COLOR.WHITE, 'line-width': 6 }}
          />
          <Layer
            id="measure-line-layer"
            type="line"
            paint={{ 'line-color': COLOR.ORANGE, 'line-width': 3, 'line-dasharray': [2.5, 2] }}
          />
        </Source>
      )}
      <MeasurePointMarker coordinate={measureA} />
      {measureB && <MeasurePointMarker coordinate={measureB} />}
    </>
  );
});

const MeasurePointMarker = React.memo(({ coordinate }: { coordinate: LocationType }) => (
  <Marker longitude={coordinate.longitude} latitude={coordinate.latitude} anchor="center">
    <div
      style={{
        backgroundColor: COLOR.ORANGE,
        border: `2px solid ${COLOR.WHITE}`,
        borderRadius: 7,
        boxSizing: 'border-box',
        height: 14,
        width: 14,
      }}
    />
  </Marker>
));
