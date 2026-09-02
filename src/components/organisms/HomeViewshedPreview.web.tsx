import React, { useContext, useMemo } from 'react';
import { Layer, Marker, Source } from 'react-map-gl/maplibre';
import { COLOR } from '../../constants/AppConstants';
import { ViewshedContext } from '../../contexts/Viewshed';
import { LocationType } from '../../types';

// 旧来のレイヤ保存時と同じ半透明赤の見た目に合わせる
const VIEWSHED_FILL_COLOR = 'rgba(255, 0, 0, 0.4)';

// GeoJSONのリング形式（[lon, lat]・閉じたリング）に変換する
const toClosedRing = (coords: LocationType[]): number[][] => {
  const ring = coords.map((c) => [c.longitude, c.latitude]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return ring;
};

// 可視領域の一時表示（Web版）。計算結果を地図に直描画する（レイヤ化しない）
export const HomeViewshedPreview = React.memo(() => {
  const { viewshedResults } = useContext(ViewshedContext);

  const geojson = useMemo(() => {
    const features = viewshedResults.flatMap((result) => [
      ...result.polygons.map((polygon) => ({
        type: 'Feature' as const,
        properties: { kind: 'viewshed' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [toClosedRing(polygon.coords), ...Object.values(polygon.holes).map(toClosedRing)],
        },
      })),
      {
        type: 'Feature' as const,
        properties: { kind: 'circle' },
        geometry: { type: 'Polygon' as const, coordinates: [toClosedRing(result.circleRing)] },
      },
    ]);
    return { type: 'FeatureCollection' as const, features };
  }, [viewshedResults]);

  if (viewshedResults.length === 0) return null;

  return (
    <>
      <Source id="viewshed-preview" type="geojson" data={geojson}>
        <Layer
          id="viewshed-preview-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'viewshed']}
          paint={{ 'fill-color': VIEWSHED_FILL_COLOR }}
        />
        <Layer
          id="viewshed-preview-line"
          type="line"
          filter={['==', ['get', 'kind'], 'viewshed']}
          paint={{ 'line-color': VIEWSHED_FILL_COLOR, 'line-width': 1.5 }}
        />
        <Layer
          id="viewshed-preview-circle"
          type="line"
          filter={['==', ['get', 'kind'], 'circle']}
          paint={{ 'line-color': COLOR.RED, 'line-width': 1.5 }}
        />
      </Source>
      {viewshedResults.map((result, index) => (
        <ObserverMarker key={result.id} coordinate={result.observer} no={index + 1} />
      ))}
    </>
  );
});

// 観測点マーカー。番号は表示中の作成順の連番
const ObserverMarker = React.memo(({ coordinate, no }: { coordinate: LocationType; no: number }) => (
  <Marker longitude={coordinate.longitude} latitude={coordinate.latitude} anchor="center">
    <div
      style={{
        alignItems: 'center',
        backgroundColor: COLOR.RED,
        border: `2px solid ${COLOR.WHITE}`,
        borderRadius: 10,
        boxSizing: 'border-box',
        color: COLOR.WHITE,
        display: 'flex',
        fontSize: 11,
        fontWeight: 'bold',
        height: 20,
        justifyContent: 'center',
        width: 20,
      }}
    >
      {no}
    </div>
  </Marker>
));
