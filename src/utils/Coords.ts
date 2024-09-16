import { cloneDeep } from 'lodash';
import {
  DMSType,
  DrawLineType,
  DrawToolType,
  LatLonDMSKey,
  LatLonDMSType,
  LineRecordType,
  LocationType,
  PointRecordType,
  PolygonRecordType,
  RegionType,
} from '../types';
import * as turf from '@turf/turf';
import { MapRef } from 'react-map-gl/maplibre';
import MapView, { LatLng } from 'react-native-maps';
import fitCurve from 'fit-curve';
import { Platform } from 'react-native';
import { Feature, GeoJsonProperties, Geometry, MultiPolygon, Point, Polygon, Position } from 'geojson';

export const toLatLonDMS = (location: LocationType): LatLonDMSType => {
  const latitude = decimal2dms(location.latitude);
  const longitude = decimal2dms(location.longitude);
  //console.log(lat,lon)
  //console.log(latitude,longitude)
  return { latitude: latitude, longitude: longitude };
};

export const decimal2dms = (val: number): DMSType => {
  const sign = val >= 0 ? 1 : -1;
  const value = Math.abs(val);
  let deg = parseInt(Math.trunc(value).toFixed(), 10);
  let min = parseInt(Math.trunc((value - deg) * 60).toFixed(), 10);
  let sec = parseFloat((((value - deg) * 60 - min) * 60).toFixed(3));

  if (sec === 60) {
    min++;
    sec = 0;
  }
  if (min === 60) {
    deg++;
    min = 0;
  }
  return { decimal: val.toString(), deg: (deg * sign).toString(), min: min.toString(), sec: sec.toString() };
};

export const dms2decimal = (deg: number, min: number, sec: number): number => {
  return Math.sign(deg) * (Math.abs(deg) + min / 60.0 + sec / 3600.0);
};

export const pointsToSvg = (points: Position[]) => {
  if (points.length < 1) return 'M 0,0';
  const initialValue = `M ${points[0][0]},${points[0][1]}`;
  const path =
    initialValue +
    ' ' +
    points
      .slice(1)
      .map((point) => `L ${point[0]},${point[1]}`)
      .join(' ');

  return path;
};

export const xyToLatLon = (
  xy: Position,
  mapRegion: RegionType,
  mapSize: { width: number; height: number },
  mapViewRef: MapView | MapRef | null
): Position => {
  if (Platform.OS === 'web') {
    if (!mapViewRef) return [0, 0];
    const mapView = (mapViewRef as MapRef).getMap();
    const latLon = mapView.unproject([xy[0], xy[1]]);
    return [latLon.lng, latLon.lat];
  } else {
    const topleft = turf.toMercator([
      mapRegion.longitude - mapRegion.longitudeDelta / 2,
      mapRegion.latitude + mapRegion.latitudeDelta / 2,
    ]);
    const bottomRight = turf.toMercator([
      mapRegion.longitude + mapRegion.longitudeDelta / 2,
      mapRegion.latitude - mapRegion.latitudeDelta / 2,
    ]);
    const x = xy[0];
    const y = xy[1];
    const top = topleft[1];
    const bottom = bottomRight[1];
    const left = topleft[0];
    const right = bottomRight[0];
    const deltaX = right - left;
    const deltaY = top - bottom;

    return turf.toWgs84([
      left + (x * deltaX) / mapSize.width,
      bottom + deltaY - (deltaY * y) / mapSize.height,
    ]) as Position;
  }
};

export const xyToLatLonObject = (
  xy: Position,
  mapRegion: RegionType,
  mapSize: { width: number; height: number },
  mapViewRef: MapView | MapRef | null
): LatLng => {
  const latLon = xyToLatLon(xy, mapRegion, mapSize, mapViewRef);
  return { longitude: latLon[0], latitude: latLon[1] };
};

export const xyArrayToLatLonArray = (
  xyArray: Position[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number },
  mapViewRef: MapView | MapRef | null
): Position[] => {
  return xyArray.map((xy) => xyToLatLon(xy, mapRegion, mapSize, mapViewRef));
};
export const xyArrayToLatLonObjects = (
  xyArray: Position[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number },
  mapViewRef: MapView | MapRef | null
): LatLng[] => xyArray.map((xy) => xyToLatLonObject(xy, mapRegion, mapSize, mapViewRef));

export const latLonToXY = (
  latlon: number[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number },
  mapViewRef: MapView | MapRef | null
): Position => {
  if (Platform.OS === 'web') {
    if (!mapViewRef) return [0, 0];
    const mapView = (mapViewRef as MapRef).getMap();
    const p = mapView.project([latlon[0], latlon[1]]);
    return [p.x, p.y];
  } else {
    const topleft = turf.toMercator([
      mapRegion.longitude - mapRegion.longitudeDelta / 2,
      mapRegion.latitude + mapRegion.latitudeDelta / 2,
    ]);
    const bottomRight = turf.toMercator([
      mapRegion.longitude + mapRegion.longitudeDelta / 2,
      mapRegion.latitude - mapRegion.latitudeDelta / 2,
    ]);
    const p = turf.toMercator(latlon);
    const x = p[0];
    const y = p[1];
    const top = topleft[1];
    const bottom = bottomRight[1];
    const left = topleft[0];
    const right = bottomRight[0];
    const deltaX = right - left;
    const deltaY = top - bottom;

    return [((x - left) * mapSize.width) / deltaX, ((top - y) * mapSize.height) / deltaY];
  }
};

export const latLonArrayToXYArray = (
  latLonArray: Position[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number },
  mapViewRef: MapView | MapRef | null
): Position[] => latLonArray.map((latlon) => latLonToXY(latlon, mapRegion, mapSize, mapViewRef));

export const latLonObjectsToXYArray = (
  latLonObjects: LatLng[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number },
  mapViewRef: MapView | MapRef | null
): Position[] => {
  return latLonObjects.map((latlon) => latLonToXY([latlon.longitude, latlon.latitude], mapRegion, mapSize, mapViewRef));
};
export const latLonObjectsToLatLonArray = (latLonObjects: { longitude: number; latitude: number }[]): Position[] =>
  latLonObjects.map((latlon) => [latlon.longitude, latlon.latitude]);

export const latlonArrayToLatLonObjects = (latLonArray: Position[]): LatLng[] =>
  latLonArray.map((latLon) => latlonToLatLonObject(latLon));

export const latlonToLatLonObject = (latLon: Position): LatLng => ({ longitude: latLon[0], latitude: latLon[1] });

export const deltaToZoom = (windowWidth: number, delta: { longitudeDelta: number; latitudeDelta: number }) => {
  //ToDo 常にlongitudeで計算するのか？
  let decimalZoom;
  if (delta.longitudeDelta < 0) {
    decimalZoom = Math.log2(360 * (windowWidth / 256 / (delta.longitudeDelta + 360)));
  } else {
    decimalZoom = Math.log2(360 * (windowWidth / 256 / delta.longitudeDelta));
  }
  return { decimalZoom, zoom: Math.floor(decimalZoom) };
};

export const zoomToDelta = (mapRef: MapRef): { latitudeDelta: number; longitudeDelta: number } => {
  //zoomしたあとに、boundsがうまく更新されない仕様のため、ラインを書く場合は、boundsを更新するために手動で動かす必要がある。

  const bounds = mapRef.getMap().getBounds();
  const latitudeDelta = bounds.getNorth() - bounds.getSouth();
  const longitudeDelta = bounds.getEast() - bounds.getWest();

  return {
    latitudeDelta: latitudeDelta === 0 ? 0.0001 : latitudeDelta,
    longitudeDelta: longitudeDelta === 0 ? 0.0001 : longitudeDelta,
  };
};

export const LatLonDMS = (latLonDms: LatLonDMSType, isDecimal: boolean) => {
  //decimalからdms,dmsからdecimalを計算して更新する。
  const updatedLatLonDms = cloneDeep(latLonDms);
  const latlonTypes: LatLonDMSKey[] = ['latitude', 'longitude'];
  if (isDecimal) {
    const dmsType = 'decimal';
    for (const latlonType of latlonTypes) {
      const dms = decimal2dms(parseFloat(latLonDms[latlonType][dmsType]));
      updatedLatLonDms[latlonType].deg = dms.deg;
      updatedLatLonDms[latlonType].min = dms.min;
      updatedLatLonDms[latlonType].sec = dms.sec;
    }
  } else {
    for (const latlonType of latlonTypes) {
      const decimal = dms2decimal(
        parseFloat(updatedLatLonDms[latlonType].deg),
        parseFloat(updatedLatLonDms[latlonType].min),
        parseFloat(updatedLatLonDms[latlonType].sec)
      );
      updatedLatLonDms[latlonType].decimal = decimal.toString();
    }
  }
  return updatedLatLonDms;
};

export const splitTest = (p: Position) => {
  const point = turf.point(p);
  const line = turf.lineString([
    [0, 0],
    [1, 1],
  ]);
  return turf.lineSplit(line, point);
};

export const getSnappedPositionWithLine = (point: Position, line: Position[], options?: { isXY: boolean }) => {
  //turfの仕様？でスクリーン座標XYのままだと正確にスナップ座標を計算しないために、一旦、小さい値（緯度経度的）にして、最後に戻す
  let turfPoint;
  let turfLine;
  const ADJUST_VALUE = 1000.0;

  if (options?.isXY) {
    turfPoint = turf.point([point[0] / ADJUST_VALUE, point[1] / ADJUST_VALUE]);
    turfLine = turf.lineString(line.map((d) => [d[0] / ADJUST_VALUE, d[1] / ADJUST_VALUE]));
  } else {
    turfPoint = turf.point(point);
    turfLine = turf.lineString(line);
  }
  const snapped = turf.nearestPointOnLine(turfLine, turfPoint);
  let position;
  if (options?.isXY) {
    position = [snapped.geometry.coordinates[0] * ADJUST_VALUE, snapped.geometry.coordinates[1] * ADJUST_VALUE];
  } else {
    position = snapped.geometry.coordinates;
  }
  return {
    position: position,
    distance: snapped.properties.dist !== undefined ? snapped.properties.dist * ADJUST_VALUE : 999999,
    index: snapped.properties.index ?? -1,
    location: snapped.properties.location ?? -1,
  };
};

export const checkDistanceFromLine = (xyPoint: Position, xyLine: Position[], RANGE: number = 2000) => {
  if (xyLine.length < 2) return { isNear: false, index: -1, position: undefined };
  const snapped = getSnappedPositionWithLine(xyPoint, xyLine, { isXY: true });
  return { isNear: snapped.distance < RANGE, index: snapped.index, position: snapped.position };
};

export const findNearNodeIndex = (xyPoint: Position, xyLine: Position[]) => {
  try {
    const ADJUST_VALUE = 1000.0;
    const RESPONSE_AREA = 2000;
    if (xyLine.length < 2) return -1;
    const turfPoint = turf.point([xyPoint[0] / ADJUST_VALUE, xyPoint[1] / ADJUST_VALUE]);
    const turfLine = turf.lineString(xyLine.map((d) => [d[0] / ADJUST_VALUE, d[1] / ADJUST_VALUE]));
    const bufferPolygon = turf.buffer(turfPoint, RESPONSE_AREA / ADJUST_VALUE);
    if (bufferPolygon === undefined) return -1;
    const nodeIndex = turfLine.geometry.coordinates.findIndex((xy) =>
      turf.booleanPointInPolygon(turf.point(xy), bufferPolygon)
    );

    return nodeIndex;
  } catch (e) {
    return -1;
  }
};

export const isWithinPolygon = (xyPoint: Position, xyLine: Position[]) => {
  const ADJUST_VALUE = 1000.0;
  const turfPoint = turf.point([xyPoint[0] / ADJUST_VALUE, xyPoint[1] / ADJUST_VALUE]);
  const turfPolygon = turf.multiPolygon([[xyLine.map((d) => [d[0] / ADJUST_VALUE, d[1] / ADJUST_VALUE])]]);

  try {
    return turf.booleanWithin(turfPoint, turfPolygon) as boolean;
  } catch (e) {
    console.log(e);
    return false;
  }
};

export const isNearWithPlot = (xyPoint: Position, xyPlot: Position) => {
  try {
    const ADJUST_VALUE = 1000.0;
    const RESPONSE_AREA = Platform.OS === 'ios' ? 1000.0 : 1000.0;
    const turfPoint = turf.point([xyPoint[0] / ADJUST_VALUE, xyPoint[1] / ADJUST_VALUE]);
    const turfPlot = turf.point([xyPlot[0] / ADJUST_VALUE, xyPlot[1] / ADJUST_VALUE]);

    const bufferPolygon = turf.buffer(turfPoint, RESPONSE_AREA / ADJUST_VALUE);
    if (bufferPolygon === undefined) return false;
    return turf.booleanIntersects(bufferPolygon, turfPlot);
  } catch (e) {
    console.log(e);
    return false;
  }
};

export const isClosedPolygon = (lineXY: Position[]) => {
  if (lineXY.length < 4) return false;
  const first = lineXY[0];
  const last = lineXY[lineXY.length - 1];
  return first[0] === last[0] && first[1] === last[1];
};

export const dot = (a: Position, b: Position) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n);
export const calcInnerProduct = (pA: Position[], pB: Position[]) => {
  const vecA = [pA[1][0] - pA[0][0], pA[1][1] - pA[0][1]];
  const vecB = [pB[1][0] - pB[0][0], pB[1][1] - pB[0][1]];
  return dot(vecA, vecB);
};

export const modifyLine = (original: DrawLineType, modified: Position[], currentDrawTool: DrawToolType) => {
  if (modified.length < 2) return original.xy;
  const startPoint = modified[0];
  const endPoint = modified[modified.length - 1];
  const firstPlot = original.xy[0];
  const lastPlot = original.xy[original.xy.length - 1];
  const startIsNearWithLast = isNearWithPlot(startPoint, lastPlot);
  const endIsNearWithFirst = isNearWithPlot(endPoint, firstPlot);

  if (original.xy.length === 1) {
    if (isNearWithPlot(startPoint, firstPlot)) return modified;
  }

  const {
    isNear: startIsNear,
    index: startIndex,
    position: startPosition,
  } = checkDistanceFromLine(startPoint, original.xy, 1000);
  const {
    isNear: endIsNear,
    index: endIndex,
    position: endPosition,
  } = checkDistanceFromLine(endPoint, original.xy, 1000);

  //最初が離れている場合（修正にはならないのでありえない）
  if (!startIsNear || startPosition === undefined) return original.xy;
  if (!endIsNear || endPosition === undefined) {
    //console.log('最後が離れている');

    const firstLine = startIsNearWithLast ? original.xy : original.xy.slice(0, startIndex + 1);
    return [...firstLine, startPosition, ...modified.slice(1)];
  }
  //最初も最後も元のラインに近い場合
  if (endIsNearWithFirst && currentDrawTool === 'FREEHAND_POLYGON') {
    //修正ラインの最後がオリジナルラインの最初にスナップ。閉じる。
    //console.log('修正ラインの最後がオリジナルラインの最初にスナップ。閉じる');

    const firstLine = startIsNearWithLast ? original.xy : original.xy.slice(0, startIndex + 1);
    const secondLine = [...modified.slice(1, -1), original.xy[0]];
    return [...firstLine, startPosition, ...secondLine];
  }
  if (startIndex === endIndex) {
    //console.log('修正ラインがぐるっと一周');
    return modified;
  }
  if (startIndex < endIndex) {
    //console.log('途中の修正');
    const firstLine = original.xy.slice(0, startIndex + 1);
    const secondLine = modified.slice(1, -1);
    return [...firstLine, startPosition, ...secondLine, endPosition, ...original.xy.slice(endIndex + 1)];
  }
  if (startIndex > endIndex) {
    //console.log('終点が始点より前に戻る。ぐるっと円を書いた場合。');
    //終点が始点より前に戻る。ぐるっと円を書いた場合。
    if (currentDrawTool === 'FREEHAND_POLYGON') {
      //console.log('ポリゴンの場合はポリゴンにする');
      //ポリゴンの場合はポリゴンにする
      const firstLine = original.xy.slice(endIndex + 1, startIndex + 1);
      const secondLine = modified.slice(1);
      return [endPosition, ...firstLine, startPosition, ...secondLine];
    }
    //ラインの場合は終点のスナップは無いものとして処理
    //console.log('ラインの場合は終点のスナップは無いものとして処理');
    const firstLine = startIsNearWithLast ? original.xy : original.xy.slice(0, startIndex + 1);
    const secondLine = modified.slice(1);
    return [...firstLine, startPosition, ...secondLine];
  }
  //console.log('どれも該当しない');
  return [];
};

export const selectPointFeaturesByArea = (pointFeatures: PointRecordType[], areaLineCoords: Position[]) => {
  try {
    const areaPolygon = turf.multiPolygon([[areaLineCoords]]);
    return pointFeatures
      .map((feature) => {
        if (!feature.coords) return undefined;
        if (!feature.visible) return undefined;
        const featurePoint = turf.point([feature.coords.longitude, feature.coords.latitude]);
        const intersects = turf.booleanIntersects(featurePoint, areaPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is PointRecordType => d !== undefined);
  } catch (e) {
    return [];
  }
};

export const selectLineFeaturesByArea = (lineFeatures: LineRecordType[], areaLineCoords: Position[]) => {
  try {
    const areaPolygon = turf.multiPolygon([[areaLineCoords]]);
    return lineFeatures
      .map((feature) => {
        let featureLine;
        if (!feature.coords) return undefined;
        if (!feature.visible) return undefined;
        if (feature.coords.length === 1) {
          featureLine = turf.point([feature.coords[0].longitude, feature.coords[0].latitude]);
        } else if (feature.coords.length > 1) {
          featureLine = turf.lineString(feature.coords.map((c) => [c.longitude, c.latitude]));
        } else {
          return undefined;
        }

        const intersects = booleanIntersects(featureLine, areaPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is LineRecordType => d !== undefined);
  } catch (e) {
    //console.log(e);
    return [];
  }
};

export const selectPolygonFeaturesByArea = (polygonFeatures: PolygonRecordType[], areaLineCoords: Position[]) => {
  try {
    const areaPolygon = turf.multiPolygon([[areaLineCoords]]);
    return polygonFeatures
      .map((feature) => {
        if (!feature.coords) return undefined;
        if (!feature.visible) return undefined;
        const featurePolygon = turf.multiPolygon([[feature.coords.map((c) => [c.longitude, c.latitude])]]);
        const intersects = booleanIntersects(featurePolygon, areaPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is PolygonRecordType => d !== undefined);
  } catch (e) {
    console.log(e);
    return [];
  }
};

export const selectPointFeatureByLatLon = (pointFeatures: PointRecordType[], pointCoords: Position, radius: number) => {
  try {
    const bufferPolygon = turf.buffer(turf.point(pointCoords), radius);
    const features = pointFeatures
      .map((feature) => {
        if (!feature.coords) return undefined;
        if (!feature.visible) return undefined;
        const featurePoint = turf.point([feature.coords.longitude, feature.coords.latitude]);
        if (bufferPolygon === undefined) return undefined;
        const intersects = turf.booleanIntersects(featurePoint, bufferPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is PointRecordType => d !== undefined);

    if (features.length === 0) return undefined;
    return features[0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

const isFeatureValid = (feature: LineRecordType): boolean =>
  Boolean(feature.coords && feature.visible && feature.coords.length > 0);

const createGeometry = (feature: LineRecordType) => {
  if (!feature.coords) return undefined;
  if (feature.coords.length === 1) {
    return turf.point([feature.coords[0].longitude, feature.coords[0].latitude]);
  }
  return turf.lineString(feature.coords.map((c) => [c.longitude, c.latitude]));
};

const checkPointIntersection = (
  point: Feature<Point, GeoJsonProperties>,
  polygon: Feature<Polygon | MultiPolygon, GeoJsonProperties>
): boolean => turf.booleanPointInPolygon(point, polygon);

export const selectLineFeatureByLatLon = (
  lineFeatures: LineRecordType[],
  pointCoords: Position,
  radius: number
): LineRecordType | undefined => {
  try {
    const bufferPolygon = turf.buffer(turf.point(pointCoords), radius);
    if (bufferPolygon === undefined) return undefined;
    const intersectingFeatures = lineFeatures.filter(isFeatureValid).filter((feature) => {
      const geometry = createGeometry(feature);
      if (!geometry) return undefined;
      if (turf.getType(geometry) === 'Point') {
        return checkPointIntersection(geometry as Feature<Point, GeoJsonProperties>, bufferPolygon);
      }
      const intersects = booleanIntersects(geometry, bufferPolygon);
      if (intersects) return feature;
    });

    return intersectingFeatures.length > 0 ? intersectingFeatures[0] : undefined;
  } catch (e) {
    console.error(e);
    return undefined;
  }
};

export const selectPolygonFeatureByLatLon = (
  polygonFeatures: PolygonRecordType[],
  pointCoords: Position,
  radius: number
) => {
  try {
    const bufferPolygon = turf.buffer(turf.point(pointCoords), radius);
    const features = polygonFeatures
      .map((feature) => {
        if (!feature.coords) return undefined;
        if (!feature.visible) return undefined;
        const featurePolygon = turf.multiPolygon([[feature.coords.map((c) => [c.longitude, c.latitude])]]);
        if (bufferPolygon === undefined) return undefined;
        const intersects = booleanIntersects(featurePolygon, bufferPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is PolygonRecordType => d !== undefined);

    if (features.length === 0) return undefined;
    return features[0];
  } catch (e) {
    console.log(e);
    return undefined;
  }
};

export const booleanNearEqual = (p1: Position, p2: Position) => {
  return Math.abs(p2[0] - p1[0]) <= 0.001 && Math.abs(p2[1] - p1[1]) <= 0.001;
};

export const simplify = (points: Position[]) => {
  try {
    if (points.length < 2) return points;
    const simplified = turf.simplify(turf.lineString(points), { tolerance: 0.1, highQuality: false });
    return simplified.geometry.coordinates;
  } catch (e) {
    console.log('simplify error', e);
    return points;
  }
};

export const calcDegreeRadius = (
  size: number,
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
) => Math.min(mapRegion.longitudeDelta / mapSize.width, mapRegion.latitudeDelta / mapSize.height) * size;

// export const calcLookAhed = (points: Position[], STRENGTH = 2200) => {
//   //距離と点数の比で適当に決める。1000倍したらちょうど良さそう？デバイスによるかも？
//   const lineLength = turf.length(turf.lineString(points));
//   //console.log(lineLength, points.length, (1000 * points.length) / lineLength);
//   const lookAhed = Math.floor((STRENGTH * points.length) / lineLength);
//   return lookAhed;
// };
// export const smoothingByBoyle = (points: Position[], lookAhead: number): number => {
//   //ref.
//   //https://github.com/giscan/Generalizer

//   let ppoint: Position;
//   let npoint: Position;
//   let last: Position;
//   let next = 1;
//   let i = 0;
//   let p = 0;
//   let c1 = 0;
//   let c2 = 0;

//   const n = points.length;

//   if (lookAhead < 2 || lookAhead > n) {
//     return n;
//   }
//   last = points[0];

//   c1 = 1 / (lookAhead - 1);
//   c2 = 1 - c1;

//   while (i < n - 2) {
//     p = i + lookAhead;
//     if (p >= n) {
//       p = n - 1;
//     }
//     ppoint = points[p];
//     ppoint = [ppoint[0] * c1, ppoint[1] * c1];
//     last = [last[0] * c2, last[1] * c2];
//     npoint = [last[0] + ppoint[0], last[1] + ppoint[1]];

//     points[next] = npoint;

//     next++;
//     i++;

//     last = npoint;
//   }

//   const idx = points.length - 1;
//   points[next] = [points[idx][0], points[idx][1]];

//   return points.length;
// };

// const getEdgeTangent = (p1: Position, p2: Position) => {
//   return [p2[0] - p1[0] + p2[0], p2[1] - p1[1] + p2[1]];
// };

// const getTangent = (points: Position[], a: number, i: number) => {
//   const p1 = points[i - 1];
//   const p2 = points[i + 1];
//   const p = [p2[0] - p1[0], p2[1] - p1[1]];
//   return [p[0] * a, p[1] * a];
// };

// const pointAdd = (a: Position, b: Position) => {
//   return [a[0] + b[0], a[1] + b[1]];
// };

// const pointScalar = (a: Position, k: number) => {
//   return [a[0] * k, a[1] * k];
// };

// const pointDist = (a: Position, b: Position) => {
//   return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
// };

const bezierToPositions = (curve: Position[]) => {
  const [p1, c1, c2, p2] = curve;
  const INTERPOLATION = 10;
  const points: number[][] = [];

  for (let i = 0; i <= INTERPOLATION; i++) {
    const t = (1.0 * i) / INTERPOLATION;
    const bx = (1 - t) ** 3 * p1[0] + 3 * t * (1 - t) ** 2 * c1[0] + 3 * t ** 2 * (1 - t) * c2[0] + t ** 3 * p2[0];
    const by = (1 - t) ** 3 * p1[1] + 3 * t * (1 - t) ** 2 * c1[1] + 3 * t ** 2 * (1 - t) * c2[1] + t ** 3 * p2[1];
    points.push([bx, by]);
  }
  return points;
};
export const smoothingByBezier = (points: Position[]): Position[] => {
  const bezierCurves = fitCurve(points, 3);
  return bezierCurves.map((curve) => bezierToPositions(curve)).flat();
};

export const calcLineMidPoint = (coords: LatLng[]) => {
  if (coords.length < 2) return undefined;
  const turfLine = turf.lineString(latLonObjectsToLatLonArray(coords));
  const lineLength = turf.length(turfLine);
  const midPoint = turf.along(turfLine, lineLength / 2);
  return { longitude: midPoint.geometry.coordinates[0], latitude: midPoint.geometry.coordinates[1] };
};

export const calcCentroid = (coords: LatLng[]) => {
  if (coords.length < 4) return undefined;
  return {
    longitude: coords.reduce((p, c) => p + c.longitude, 0) / coords.length,
    latitude: coords.reduce((p, c) => p + c.latitude, 0) / coords.length,
  };
};

export const isValidPoint = (xyLine: Position[]) => {
  return xyLine.length === 1;
};

export const isValidLine = (xyLine: Position[]) => {
  //1点のラインも認める。HISYOUTOOLのTOMARIがあるため
  return xyLine.length >= 1;
};

export const makeValidPolygon = (xyLine: Position[]) => {
  try {
    const uniqueXY = uniqueCoordinate(xyLine);
    const unkinkedPolygon = turf.unkinkPolygon(turf.multiPolygon([[uniqueXY]]));
    if (unkinkedPolygon.features.length === 1) {
      return xyLine;
    } else {
      return unkinkedPolygon.features[0].geometry.coordinates[0];
    }
  } catch (e) {
    console.log(e);
    return xyLine;
  }
};

function isPolygon(geometry: Geometry): geometry is Polygon {
  return geometry.type === 'Polygon';
}

export const makeBufferPolygon = (xyLine: Position[]): Position[] => {
  try {
    const ADJUST_VALUE = 1000.0;
    const turfPolygon = turf.polygon([xyLine.map((p) => [p[0] / ADJUST_VALUE, p[1] / ADJUST_VALUE])]);

    const bufferPolygon = turf.buffer(turfPolygon, 100 / ADJUST_VALUE);

    if (bufferPolygon === undefined) return xyLine;
    const geometry = bufferPolygon.geometry;
    if (isPolygon(geometry)) return xyLine;
    return geometry.coordinates[0].map((p: Position[]) => [Number(p[0]) * ADJUST_VALUE, Number(p[1]) * ADJUST_VALUE]);
  } catch (e) {
    console.log(e);
    return xyLine;
  }
};

const uniqueCoordinate = (coordinates: Position[]) => {
  return Array.from(new Set(coordinates.map((a) => a.join('|'))), (s) => s.split('|').map(Number));
};

export const isValidPolygon = (xyLine: Position[]) => {
  return turf.booleanValid(turf.multiPolygon([[xyLine]]));
};

export function checkRingsClose(geom: Position[]) {
  return geom[0][0] === geom[geom.length - 1][0] || geom[0][1] === geom[geom.length - 1][1];
}

export function checkRingsForSpikesPunctures(geom: Position[]) {
  for (let i = 0; i < geom.length - 1; i++) {
    const point = geom[i];
    for (let ii = i + 1; ii < geom.length - 2; ii++) {
      const seg = [geom[ii], geom[ii + 1]];
      if (turf.booleanPointOnLine(point, turf.lineString(seg))) return true;
    }
  }
  return false;
}

export function getMetersPerPixelAtZoomLevel(latitude: number, currentZoomLevel: number) {
  const metersPerPx = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, currentZoomLevel);
  return metersPerPx;
}

export function webMercatorToLatLon(mercator: { x: number; y: number }): { longitude: number; latitude: number } {
  const latlon = turf.toWgs84([mercator.x, mercator.y]);
  return { longitude: latlon[0], latitude: latlon[1] };
}

export const getSnappedLine = (start: Position, end: Position, line: Position[]) => {
  const ADJUST_VALUE = 1000.0;
  const adjustedStartPt = turf.point([start[0] / ADJUST_VALUE, start[1] / ADJUST_VALUE]);
  const adjustedEndPt = turf.point([end[0] / ADJUST_VALUE, end[1] / ADJUST_VALUE]);
  const adjustedLine = turf.lineString(line.map((d) => [d[0] / ADJUST_VALUE, d[1] / ADJUST_VALUE]));
  const sliced = turf.lineSlice(adjustedStartPt, adjustedEndPt, adjustedLine);
  const snappedLine = sliced.geometry.coordinates.map((d) => [d[0] * ADJUST_VALUE, d[1] * ADJUST_VALUE]);
  // snappedLine[0] = start;
  // snappedLine[snappedLine.length - 1] = end;

  return snappedLine;
};

export const calcArrowAngle = (xy: Position[]) => {
  if (xy.length < 2) return undefined; // 点が2つ未満の場合は計算不可

  let vectorX = 0;
  let vectorY = 0;

  if (xy.length >= 3) {
    // 最後の3点から2つのベクトルを計算し、重み付きの平均を求める
    const p1 = xy[xy.length - 3];
    const p2 = xy[xy.length - 2];
    const p3 = xy[xy.length - 1];
    const vector1 = [(p2[0] - p1[0]) * 0.5, (p2[1] - p1[1]) * 0.5]; // 最初のベクトルには小さい重みを
    const vector2 = [(p3[0] - p2[0]) * 1.5, (p3[1] - p2[1]) * 1.5]; // 2番目のベクトルには大きい重みを
    // 重み付き平均ベクトルを計算
    vectorX = vector1[0] + vector2[0];
    vectorY = vector1[1] + vector2[1];
    vectorX /= 2; // 合計の重みで割る
    vectorY /= 2; // 合計の重みで割る
  } else {
    // 2点の場合は直接ベクトルを計算
    const lastPoint = xy[xy.length - 1];
    const secondLastPoint = xy[xy.length - 2];
    vectorX = lastPoint[0] - secondLastPoint[0];
    vectorY = lastPoint[1] - secondLastPoint[1];
  }

  // ベクトルの方向から角度を計算
  let angle = Math.atan2(vectorY, vectorX) + Math.PI / 2;
  angle = angle * (180 / Math.PI); // ラジアンを度に変換

  // 角度を0度から360度の範囲に正規化
  if (angle >= 360) {
    angle -= 360;
  }

  return angle; // 角度を返す
};

export const removeSharpTurns = (line: Position[]) => {
  const xyArrayLength = line.length;
  if (xyArrayLength < 3) return line; // 配列の長さが3未満の場合は、そのまま配列を返す

  // 最後の3点を取得
  const p1 = line[xyArrayLength - 3];
  const p2 = line[xyArrayLength - 2];
  const p3 = line[xyArrayLength - 1];

  // ベクトルを計算
  const v1 = [p2[0] - p1[0], p2[1] - p1[1]];
  const v2 = [p3[0] - p2[0], p3[1] - p2[1]];

  // コサインの角度を計算
  const cosTheta = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]));

  // 最終的な点が鋭角を形成するかどうかを評価
  if (cosTheta < 0.5) {
    // 最終的な点を削除する場合
    return line.slice(0, xyArrayLength - 1);
  } else {
    // 最終的な点を含める場合
    return line;
  }
};

export function interpolateLineString(line: Position[], interval: number) {
  const lineGeoJSON = turf.lineString(line);
  const lineLength = turf.length(lineGeoJSON, { units: 'kilometers' });
  const midpoint = turf.along(lineGeoJSON, lineLength / 2, { units: 'kilometers' });

  const points = [{ coordinates: midpoint.geometry.coordinates, angle: 0 }];

  let offset = interval;
  while (offset < lineLength / 2) {
    const pointBefore = turf.along(lineGeoJSON, lineLength / 2 - offset, { units: 'kilometers' });
    const pointAfter = turf.along(lineGeoJSON, lineLength / 2 + offset, { units: 'kilometers' });

    points.unshift({ coordinates: pointBefore.geometry.coordinates, angle: 0 });
    points.push({ coordinates: pointAfter.geometry.coordinates, angle: 0 });

    offset += interval;
  }

  // 角度の計算: 前後のポイントを使用してbearingを計算
  for (let i = 0; i < points.length; i++) {
    // 始点と終点以外の場合
    if (i > 0 && i < points.length - 1) {
      const bearingBeforeRad =
        (turf.bearing(turf.point(points[i - 1].coordinates), turf.point(points[i].coordinates)) * Math.PI) / 180;
      const bearingAfterRad =
        (turf.bearing(turf.point(points[i].coordinates), turf.point(points[i + 1].coordinates)) * Math.PI) / 180;

      const x1 = Math.cos(bearingBeforeRad);
      const y1 = Math.sin(bearingBeforeRad);
      const x2 = Math.cos(bearingAfterRad);
      const y2 = Math.sin(bearingAfterRad);

      const averageX = (x1 + x2) / 2;
      const averageY = (y1 + y2) / 2;

      const angleRad = Math.atan2(averageY, averageX);
      const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;

      points[i].angle = angleDeg;
    } else if (i === 0 && points.length > 1) {
      // 始点の場合
      const bearingAfter = turf.bearing(turf.point(points[i].coordinates), turf.point(points[i + 1].coordinates));
      points[i].angle = (bearingAfter + 360) % 360;
    } else if (i === points.length - 1 && points.length > 1) {
      // 終点の場合
      const bearingBefore = turf.bearing(turf.point(points[i - 1].coordinates), turf.point(points[i].coordinates));
      points[i].angle = (bearingBefore + 360) % 360;
    } else {
      //1点の場合
      points[i].angle = turf.bearing(turf.point(line[0]), turf.point(line[line.length - 1]));
    }
  }
  return points;
}

export function boundingBoxFromCoords(points: LatLng[]) {
  const bbox = points.reduce(
    (acc, point) => {
      return {
        north: Math.max(acc.north, point.latitude),
        south: Math.min(acc.south, point.latitude),
        east: Math.max(acc.east, point.longitude),
        west: Math.min(acc.west, point.longitude),
      };
    },
    { north: -90, south: 90, east: -180, west: 180 }
  );
  return bbox;
}

export function smoothLine(line: LocationType[], windowSize: number): LocationType[] {
  return line.map((_, index, array) => {
    const start = Math.max(0, index - Math.floor(windowSize / 2));
    const end = Math.min(array.length, start + windowSize);
    const window = array.slice(start, end);

    const avgLat = window.reduce((sum, p) => sum + p.latitude, 0) / window.length;
    const avgLon = window.reduce((sum, p) => sum + p.longitude, 0) / window.length;

    return {
      latitude: avgLat,
      longitude: avgLon,
    };
  });
}

export const cleanupLine = (line: LocationType[]): LocationType[] => {
  if (line.length < 10) return line;

  const smoothedLine = smoothLine(line, 3);
  // トラックをGeoJSON LineStringに変換
  const lineString = turf.lineString(smoothedLine.map((point) => [point.longitude, point.latitude]));

  const simplifiedLine = turf.simplify(lineString, { tolerance: 0.000001, highQuality: true });
  const newTrack = simplifiedLine.geometry.coordinates.map((coord) => ({
    longitude: coord[0],
    latitude: coord[1],
  }));
  return newTrack;
};

//turfのbooleanIntersectsのignoreSelfIntersectionsにバグがあるため、一旦自前で実装
export const booleanIntersects = (feature1: Feature<any> | Geometry, feature2: Feature<any> | Geometry) =>
  turf.lineIntersect(feature1, feature2, { ignoreSelfIntersections: true }).features.length > 0;
