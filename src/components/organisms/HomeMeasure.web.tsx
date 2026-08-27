import React, { useContext, useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { COLOR } from '../../constants/AppConstants';
import { MeasureContext } from '../../contexts/Measure';
import { haversineKm, formatDistanceKm } from '../../utils/Location';
import { LocationType } from '../../types';

// 二点間距離測定の線・端点マーカー・距離ラベル（Web版）
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

  // 中点ラベル座標。経度180度跨ぎでは単純平均が反対側に出るが実用上許容
  const midPoint: LocationType | null = useMemo(() => {
    if (!measureA || !measureB) return null;
    return {
      latitude: (measureA.latitude + measureB.latitude) / 2,
      longitude: (measureA.longitude + measureB.longitude) / 2,
    };
  }, [measureA, measureB]);

  const distanceLabel = useMemo(() => {
    if (!measureA || !measureB) return '';
    return formatDistanceKm(haversineKm(measureA, measureB));
  }, [measureA, measureB]);

  if (!measureA) return null;

  return (
    <>
      {lineGeojson && (
        <Source id="measure-line" type="geojson" data={lineGeojson}>
          <Layer
            id="measure-line-layer"
            type="line"
            paint={{ 'line-color': COLOR.ORANGE, 'line-width': 2, 'line-dasharray': [2, 2] }}
          />
        </Source>
      )}
      <MeasurePointMarker coordinate={measureA} />
      {measureB && <MeasurePointMarker coordinate={measureB} />}
      {midPoint && (
        <Marker longitude={midPoint.longitude} latitude={midPoint.latitude} anchor="bottom" offset={[0, -10]}>
          <div
            style={{
              color: COLOR.BLACK,
              fontSize: 16,
              fontWeight: 'bold',
              textShadow: `1px 1px 1px ${COLOR.WHITE}, -1px -1px 1px ${COLOR.WHITE}`,
              whiteSpace: 'nowrap',
            }}
          >
            {distanceLabel}
          </div>
        </Marker>
      )}
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
