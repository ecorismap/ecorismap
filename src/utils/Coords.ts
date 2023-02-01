import { Position } from '@turf/turf';
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
import { MapRef } from 'react-map-gl';
import { LatLng } from 'react-native-maps';
import booleanValid from '@turf/boolean-valid';
import fitCurve from 'fit-curve';

export const isPoint = (coords: any): coords is LocationType => {
  return 'latitude' in coords && 'longitude' in coords;
};

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
  mapSize: { width: number; height: number }
): Position => {
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
};

export const xyToLatLonObject = (
  xy: Position,
  mapRegion: RegionType,
  mapSize: { width: number; height: number }
): LatLng => {
  const latLon = xyToLatLon(xy, mapRegion, mapSize);
  return { longitude: latLon[0], latitude: latLon[1] };
};

export const xyArrayToLatLonArray = (
  xyArray: Position[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number }
): Position[] => {
  return xyArray.map((xy) => xyToLatLon(xy, mapRegion, mapSize));
};
export const xyArrayToLatLonObjects = (
  xyArray: Position[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number }
): LatLng[] => xyArray.map((xy) => xyToLatLonObject(xy, mapRegion, mapSize));

export const latLonToXY = (
  latlon: number[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number }
): Position => {
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
};

export const latLonArrayToXYArray = (
  latLonArray: Position[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number }
): Position[] => latLonArray.map((latlon) => latLonToXY(latlon, mapRegion, mapSize));

export const latLonObjectsToXYArray = (
  latLonObjects: LatLng[],
  mapRegion: RegionType,
  mapSize: { width: number; height: number }
): Position[] => latLonObjects.map((latlon) => latLonToXY([latlon.longitude, latlon.latitude], mapRegion, mapSize));

export const latLonObjectsToLatLonArray = (latLonObjects: { longitude: number; latitude: number }[]): Position[] =>
  latLonObjects.map((latlon) => [latlon.longitude, latlon.latitude]);

export const latlonArrayToLatLonObjects = (latLonArray: Position[]): LatLng[] =>
  latLonArray.map((latlon) => ({ longitude: latlon[0], latitude: latlon[1] }));

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

export const checkDistanceFromLine = (xyPoint: Position, xyLine: Position[], RANGE: number = 500) => {
  if (xyLine.length < 2) return { isNear: false, index: -1, snappedToLast: undefined };
  const snapped = getSnappedPositionWithLine(xyPoint, xyLine, { isXY: true });
  return { isNear: snapped.distance < RANGE, index: snapped.index, position: snapped.position };
};

export const findNearNodeIndex = (xyPoint: Position, xyLine: Position[]) => {
  try {
    const ADJUST_VALUE = 1000.0;
    if (xyLine.length < 2) return -1;
    const turfPoint = turf.point([xyPoint[0] / ADJUST_VALUE, xyPoint[1] / ADJUST_VALUE]);
    const turfLine = turf.lineString(xyLine.map((d) => [d[0] / ADJUST_VALUE, d[1] / ADJUST_VALUE]));

    const bufferPolygon = turf.buffer(turfPoint, 500 / ADJUST_VALUE);
    const nodeIndex = turfLine.geometry.coordinates.findIndex((xy) => {
      const node = turf.point(xy);
      //@ts-ignore
      return turf.booleanIntersects(node, bufferPolygon);
    });
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
    const turfPoint = turf.point([xyPoint[0] / ADJUST_VALUE, xyPoint[1] / ADJUST_VALUE]);
    const turfPlot = turf.point([xyPlot[0] / ADJUST_VALUE, xyPlot[1] / ADJUST_VALUE]);

    const bufferPolygon = turf.buffer(turfPoint, 1000 / ADJUST_VALUE);
    //@ts-ignore
    return turf.booleanIntersects(turfPlot, bufferPolygon) as boolean;
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
  if (!startIsNear) return original.xy;
  if (!endIsNear) {
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
        const featurePoint = turf.point([feature.coords.longitude, feature.coords.latitude]);
        //@ts-ignore
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
        const featureLine = turf.lineString(feature.coords.map((c) => [c.longitude, c.latitude]));
        //@ts-ignore
        const intersects = turf.booleanIntersects(featureLine, areaPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is LineRecordType => d !== undefined);
  } catch (e) {
    return [];
  }
};

export const selectPolygonFeaturesByArea = (polygonFeatures: PolygonRecordType[], areaLineCoords: Position[]) => {
  try {
    const areaPolygon = turf.multiPolygon([[areaLineCoords]]);
    return polygonFeatures
      .map((feature) => {
        const featurePolygon = turf.multiPolygon([[feature.coords.map((c) => [c.longitude, c.latitude])]]);
        //@ts-ignore
        const intersects = turf.booleanIntersects(featurePolygon, areaPolygon);
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
        const featurePoint = turf.point([feature.coords.longitude, feature.coords.latitude]);
        //@ts-ignore
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

export const selectLineFeatureByLatLon = (lineFeatures: LineRecordType[], pointCoords: Position, radius: number) => {
  try {
    const bufferPolygon = turf.buffer(turf.point(pointCoords), radius);
    const features = lineFeatures
      .map((feature) => {
        const featureLine = turf.lineString(feature.coords.map((c) => [c.longitude, c.latitude]));
        //@ts-ignore
        const intersects = turf.booleanIntersects(featureLine, bufferPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is LineRecordType => d !== undefined);

    if (features.length === 0) return undefined;
    return features[0];
  } catch (e) {
    console.log(e);
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
        const featurePolygon = turf.multiPolygon([[feature.coords.map((c) => [c.longitude, c.latitude])]]);
        //@ts-ignore
        const intersects = turf.booleanIntersects(featurePolygon, bufferPolygon);
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
    const simplified = turf.simplify(turf.lineString(points), { tolerance: 1, highQuality: false });
    return simplified.geometry.coordinates;
  } catch (e) {
    console.log('simplify error', e);
    return points;
  }
};

// export const calcDegreeRadius = (
//   size: number,
//   mapRegion: {
//     latitude: number;
//     longitude: number;
//     latitudeDelta: number;
//     longitudeDelta: number;
//   },
//   mapSize: { width: number; height: number }
// ) => Math.min(mapRegion.longitudeDelta / mapSize.width, mapRegion.latitudeDelta / mapSize.height) * size;

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
  const points = [];

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

export const calcCentroid = (coords: LatLng[]) => {
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

export const makeBufferPolygon = (xyLine: Position[]): Position[] => {
  try {
    const ADJUST_VALUE = 1000.0;
    const turfPolygon = turf.polygon([xyLine.map((p) => [p[0] / ADJUST_VALUE, p[1] / ADJUST_VALUE])]);

    const bufferPolygon = turf.buffer(turfPolygon, 100 / ADJUST_VALUE);
    return bufferPolygon.geometry.coordinates[0].map((p) => [p[0] * ADJUST_VALUE, p[1] * ADJUST_VALUE]);
  } catch (e) {
    console.log(e);
    return xyLine;
  }
};

const uniqueCoordinate = (coordinates: Position[]) => {
  return Array.from(new Set(coordinates.map((a) => a.join('|'))), (s) => s.split('|').map(Number));
};

export const isValidPolygon = (xyLine: Position[]) => {
  return booleanValid(turf.multiPolygon([[xyLine]]));
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
