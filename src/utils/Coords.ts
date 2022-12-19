import { Position } from '@turf/turf';
import { cloneDeep } from 'lodash';
import { DMSType, LatLonDMSKey, LatLonDMSType, LocationType } from '../types';
import * as turf from '@turf/turf';
import { MapRef } from 'react-map-gl';

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

export const pointsToLocation = (
  points: Position[],
  param: {
    width: number;
    height: number;
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }
) => {
  return points.map((d) => ({
    longitude: param.longitude + param.longitudeDelta * (d[0] / param.width - 0.5),
    latitude: param.latitude - param.latitudeDelta * (d[1] / param.height - 0.5),
  }));
};

export const locationToPoints = (
  location: { longitude: number; latitude: number }[],
  param: {
    width: number;
    height: number;
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  }
) => {
  return location.map((d) => [
    Math.round(((d.longitude - (param.longitude - param.longitudeDelta / 2)) * param.width) / param.longitudeDelta),
    Math.round(((param.latitude + param.latitudeDelta / 2 - d.latitude) * param.height) / param.latitudeDelta),
  ]);
};

export const deltaToZoom = (
  screenSize: { width: number; height: number },
  delta: { longitudeDelta: number; latitudeDelta: number }
) => {
  //ToDo 常にlongitudeで計算するのか？
  let decimalZoom;
  if (delta.longitudeDelta < 0) {
    decimalZoom = Math.log2(360 * (screenSize.width / 256 / (delta.longitudeDelta + 360)));
  } else {
    decimalZoom = Math.log2(360 * (screenSize.width / 256 / delta.longitudeDelta));
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
