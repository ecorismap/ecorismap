import { Position } from '@turf/turf';
import { cloneDeep } from 'lodash';
import {
  DMSType,
  DrawToolType,
  LatLonDMSKey,
  LatLonDMSType,
  LineRecordType,
  LocationType,
  PointRecordType,
  PolygonRecordType,
  RecordType,
} from '../types';
import * as turf from '@turf/turf';
import { MapRef } from 'react-map-gl';
import { LatLng } from 'react-native-maps';

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
  const path = initialValue + ' ' + points.map((point) => `L ${point[0]},${point[1]}`).join(' ');

  return path;
};

export const xyToLatLon = (
  xy: Position,
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): Position => {
  return [
    mapRegion.longitude + mapRegion.longitudeDelta * (xy[0] / mapSize.width - 0.5),
    mapRegion.latitude - mapRegion.latitudeDelta * (xy[1] / mapSize.height - 0.5),
  ];
};

export const xyArrayToLatLonArray = (
  xyArray: Position[],
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): Position[] => {
  return xyArray.map((xy) => xyToLatLon(xy, mapRegion, mapSize));
};

export const xyToLatLonObject = (
  xy: Position,
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): LatLng => ({
  longitude: mapRegion.longitude + mapRegion.longitudeDelta * (xy[0] / mapSize.width - 0.5),
  latitude: mapRegion.latitude - mapRegion.latitudeDelta * (xy[1] / mapSize.height - 0.5),
});

export const xyArrayToLatLonObjects = (
  xyArray: Position[],
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): LatLng[] => xyArray.map((xy) => xyToLatLonObject(xy, mapRegion, mapSize));

export const latLonToXY = (
  latlon: number[],
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): Position => [
  Math.round(
    ((latlon[0] - (mapRegion.longitude - mapRegion.longitudeDelta / 2)) * mapSize.width) / mapRegion.longitudeDelta
  ),
  Math.round(
    ((mapRegion.latitude + mapRegion.latitudeDelta / 2 - latlon[1]) * mapSize.height) / mapRegion.latitudeDelta
  ),
];

export const latLonArrayToXYArray = (
  latLonArray: Position[],
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): Position[] => latLonArray.map((latlon) => latLonToXY(latlon, mapRegion, mapSize));

export const latLonObjectsToXYArray = (
  latLonObjects: LatLng[],
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
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

export const getLineSnappedPosition = (point: Position, line: Position[], options?: { isXY: boolean }) => {
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

export const checkDistanceFromLine = (xyPoint: Position, xyLine: Position[]) => {
  if (xyLine.length < 2) return { isFar: true, index: -1 };
  const SNAP_DISTANCE = 500;
  const snapped = getLineSnappedPosition(xyPoint, xyLine, { isXY: true });
  return { isFar: snapped.distance > SNAP_DISTANCE, index: snapped.index };
};

export const dot = (a: Position, b: Position) => a.map((x, i) => a[i] * b[i]).reduce((m, n) => m + n);
export const calcInnerProduct = (pA: Position[], pB: Position[]) => {
  const vecA = [pA[1][0] - pA[0][0], pA[1][1] - pA[0][1]];
  const vecB = [pB[1][0] - pB[0][0], pB[1][1] - pB[0][1]];
  return dot(vecA, vecB);
};

export const modifyLine = (
  original: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  },
  modified: {
    start: turf.helpers.Position;
    xy: Position[];
  },
  currentDrawTool: DrawToolType
) => {
  const startPoint = modified.start;
  const endPoint = modified.xy[modified.xy.length - 1];
  const { isFar: startIsFar, index: startIndex } = checkDistanceFromLine(startPoint, original.xy);
  const { isFar: endIsFar, index: endIndex } = checkDistanceFromLine(endPoint, original.xy);

  if (startIsFar) {
    //最初が離れている場合（修正にはならないのでありえない）
    return [];
  } else if (endIsFar) {
    //終わりが離れている場合
    //交わる向きを内積で計算して、繋ぎ方を変える
    const pA = original.xy.slice(startIndex, startIndex + 2);
    const pB = modified.xy.slice(0, 2);
    if (pA.length !== 2 || pB.length !== 2) return [];
    const innerProduct = calcInnerProduct(pA, pB);
    let updatedLine;
    if (innerProduct > 0) {
      updatedLine = [...original.xy.slice(0, startIndex), ...modified.xy];
    } else {
      updatedLine = [...modified.xy.reverse(), ...original.xy.slice(startIndex + 1)];
    }
    if (currentDrawTool === 'FREEHAND_POLYGON') {
      updatedLine.push(updatedLine[0]);
    }
    return updatedLine;
  } else {
    //最初も最後も元のラインに近い場合

    const pA = original.xy.slice(startIndex, startIndex + 2);
    const pB = modified.xy.slice(0, 2);
    if (pA.length !== 2 || pB.length !== 2) return [];
    const innerProduct = calcInnerProduct(pA, pB);
    let originalXY = original.xy;
    let startIdx = startIndex;
    let endIdx = endIndex;
    if (innerProduct < 0) {
      //修正のラインが逆向きなら一旦、元のラインを逆向きにしてから考える。その後、向きを戻す。
      originalXY = originalXY.reverse();
      const start = checkDistanceFromLine(startPoint, originalXY);
      const end = checkDistanceFromLine(endPoint, originalXY);
      startIdx = start.index;
      endIdx = end.index;
    }
    let updatedLine;
    if (startIdx > endIdx) {
      //終点が始点より前に戻る。ぐるっと円を書いた場合。
      if (currentDrawTool === 'FREEHAND_POLYGON') {
        //ポリゴンの場合はポリゴンにする
        updatedLine = [...originalXY.slice(endIdx + 1, startIdx), ...modified.xy];
      } else {
        //ラインの場合は終点のスナップは無いものとして処理
        updatedLine = [...originalXY.slice(0, startIdx), ...modified.xy];
      }
    } else {
      updatedLine = [...originalXY.slice(0, startIdx), ...modified.xy, ...originalXY.slice(endIdx + 1)];
    }

    return innerProduct < 0 ? updatedLine.reverse() : updatedLine;
  }
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
        const featurePolygon = turf.polygon([feature.coords.map((c) => [c.longitude, c.latitude])]);
        //@ts-ignore
        const intersects = turf.booleanIntersects(featurePolygon, areaPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is PolygonRecordType => d !== undefined);
  } catch (e) {
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
        const featurePolygon = turf.polygon([feature.coords.map((c) => [c.longitude, c.latitude])]);
        //@ts-ignore
        const intersects = turf.booleanIntersects(featurePolygon, bufferPolygon);
        if (intersects) return feature;
      })
      .filter((d): d is PolygonRecordType => d !== undefined);

    if (features.length === 0) return undefined;
    return features[0];
  } catch (e) {
    return undefined;
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

export const booleanNearEqual = (p1: Position, p2: Position) => {
  return Math.abs(p2[0] - p1[0]) <= 0.001 && Math.abs(p2[1] - p1[1]) <= 0.001;
};

export const smoothingByBoyle = (points: Position[], lookAhead: number): number => {
  //ref.
  //https://github.com/giscan/Generalizer

  let ppoint: Position;
  let npoint: Position;
  let last: Position;
  let next = 1;
  let i = 0;
  let p = 0;
  let c1 = 0;
  let c2 = 0;

  const n = points.length;

  if (lookAhead < 2 || lookAhead > n) {
    return n;
  }
  last = points[0];

  c1 = 1 / (lookAhead - 1);
  c2 = 1 - c1;

  while (i < n - 2) {
    p = i + lookAhead;
    if (p >= n) {
      p = n - 1;
    }
    ppoint = points[p];
    ppoint = [ppoint[0] * c1, ppoint[1] * c1];
    last = [last[0] * c2, last[1] * c2];
    npoint = [last[0] + ppoint[0], last[1] + ppoint[1]];

    points[next] = npoint;

    next++;
    i++;

    last = npoint;
  }

  const idx = points.length - 1;
  points[next] = [points[idx][0], points[idx][1]];

  return points.length;
};

export const calcCentroid = (coords: LatLng[]) => {
  return {
    longitude: coords.reduce((p, c) => p + c.longitude, 0) / coords.length,
    latitude: coords.reduce((p, c) => p + c.latitude, 0) / coords.length,
  };
};
