import { Position } from '@turf/turf';
import { cloneDeep } from 'lodash';
import { DMSType, LatLonDMSKey, LatLonDMSType, LineRecordType, LocationType, RecordType } from '../types';
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

export const computeMovingAverage = (data: Position[], period: number) => {
  const getAverage = (d: Position[]) =>
    d.reduce((acc, val) => [acc[0] + val[0] / d.length, acc[1] + val[1] / d.length], [0, 0]);
  const movingAverages = [];

  if (period > data.length) return data;

  for (let x = 0; x + period - 1 < data.length; x += 1) {
    //console.log('sortedData.slice(x, x + period)', data.slice(x, x + period));
    movingAverages.push(getAverage(data.slice(x, x + period)));
  }
  const padding = data.slice(movingAverages.length);
  //console.log(movingAverages);
  return [...movingAverages, ...padding];
};

export const pointsToSvg = (points: Position[]) => {
  // // 筆跳ね防止のための閾値
  // const distanceThreshold = 40;

  // const filteredPoints = points.filter((point, index) => {
  //   if (!points[index - 1]) return true;
  //   const distance = Math.sqrt(
  //     Math.pow(points[index - 1][0] - point[0], 2) + Math.pow(points[index - 1][1] - point[1], 2)
  //   );
  //   return distance < distanceThreshold;
  // });
  const filteredPoints = points;
  //console.log(points);
  if (filteredPoints.length < 1) return 'M 0,0';
  const initialValue = `M ${filteredPoints[0][0]},${filteredPoints[0][1]}`;
  const path = initialValue + ' ' + filteredPoints.map((point) => `L ${point[0]},${point[1]}`).join(' ');

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

export const xyArrayToLatLonObjects = (
  xyArray: Position[],
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): LatLng[] => {
  return xyArray.map((xy) => {
    const latlon = xyToLatLon(xy, mapRegion, mapSize);
    return { longitude: latlon[0], latitude: latlon[1] };
  });
};

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
): Position[] => {
  return latLonArray.map((latlon) => latLonToXY(latlon, mapRegion, mapSize));
};

export const latLonObjectsToXYArray = (
  latLonObjects: LatLng[],
  mapRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  mapSize: { width: number; height: number }
): Position[] => {
  return latLonObjects.map((latlon) => latLonToXY([latlon.longitude, latlon.latitude], mapRegion, mapSize));
};

export const latLonObjectsToLatLonArray = (latLonObjects: { longitude: number; latitude: number }[]): Position[] => {
  return latLonObjects.map((latlon) => [latlon.longitude, latlon.latitude]);
};

export const latlonArrayToLatLonObjects = (latLonArray: Position[]): LatLng[] => {
  return latLonArray.map((latlon) => ({ longitude: latlon[0], latitude: latlon[1] }));
};

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
  }
) => {
  const startPoint = modified.start;
  const endPoint = modified.xy[modified.xy.length - 1];
  const { isFar: startIsFar, index: startIndex } = checkDistanceFromLine(startPoint, original.xy);
  const { isFar: endIsFar, index: endIndex } = checkDistanceFromLine(endPoint, original.xy);

  if (startIsFar && endIsFar) {
    //最初も最後も離れている場合（何もしない）
    return [];
  } else if (startIsFar) {
    //最初だけが離れている場合
    return original.xy.slice(endIndex);
  } else if (endIsFar) {
    //終わりだけが離れている場合
    return [...original.xy.slice(0, startIndex), ...modified.xy];
  } else if (startIndex >= endIndex) {
    //最初も最後もスナップ範囲内だが、最後のスナップが最初のスナップより前にある場合
    return [...original.xy.slice(0, startIndex), ...modified.xy];
  } else {
    //最初も最後もスナップ範囲の場合
    return [...original.xy.slice(0, startIndex), ...modified.xy, ...original.xy.slice(endIndex)];
  }
};

export const selectFeaturesByArea = (lineFeatures: LineRecordType[], areaLineCoords: Position[]) => {
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

export const selectFeatureByLatLon = (lineFeatures: LineRecordType[], pointCoords: Position, radius: number) => {
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
