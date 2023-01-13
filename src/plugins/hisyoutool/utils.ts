import { HisyouToolType } from './hisyoutool';

import { HISYOUTOOL } from './Constants';
import { RecordType } from '../../types';
import { Position } from '@turf/turf';
import * as turf from '@turf/turf';
import { booleanNearEqual, getLineSnappedPosition } from '../../utils/Coords';
import { cloneDeep } from 'lodash';

export function isHisyouTool(tool: string): tool is HisyouToolType {
  return Object.keys(HISYOUTOOL).includes(tool);
}

export const legendsToProperties = (legends: string): string[] => {
  return legends.split(',').map((legend) => {
    switch (legend) {
      case '飛翔':
        return 'HISYOU';
      case '旋回':
        return 'SENKAI';
      case '旋回上昇':
        return 'SENJYOU';
      case 'ディスプレイ':
        return 'DISPLAY';
      case '攻撃':
        return 'KOUGEKI';
      case '停空飛翔':
        return 'HOVERING';
      case '狩り':
        return 'KARI';
      case '急降下':
        return 'KYUKOKA';
      case 'とまり':
        return 'TOMARI';
      case '消失':
        return 'arrow';
      default:
        return legend;
    }
  });
};

export const propertiesToLegends = (properties: string[]) => {
  const legendArray = properties.map((property) => {
    switch (property) {
      case 'HISYOU':
        return '飛翔';
      case 'SENKAI':
        return '旋回';
      case 'SENJYOU':
        return '旋回上昇';
      case 'DISPLAY':
        return 'ディスプレイ';
      case 'KOUGEKI':
        return '攻撃';
      case 'HOVERING':
        return '停空飛翔';
      case 'KARI':
        return '狩り';
      case 'KYUKOKA':
        return '急降下';
      case 'TOMARI':
        return 'とまり';
      case 'arrow':
        return '消失';
      default:
        return property;
    }
  });
  const legends = Array.from(new Set(legendArray));

  return legends.join(',');
};

export const getSplitPoints = (
  lineLatLon: Position[],
  actions: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[]
) => {
  return actions
    .flatMap((action) => {
      const start = action.latlon[0];
      const end = action.latlon[action.latlon.length - 1];
      const startPt = getLineSnappedPosition(start, lineLatLon);
      const endPt = getLineSnappedPosition(end, lineLatLon);
      return [
        { ...startPt, properties: action.properties, type: 'start' },
        { ...endPt, properties: action.properties, type: 'end' },
      ];
    })
    .sort(function (a, b) {
      if (a.location < b.location) return -1;
      if (a.location > b.location) return 1;
      if (a.type < b.type) return -1;
      if (a.type > b.type) return 1;
      if (a.properties[0] < b.properties[0]) return -1;
      if (a.properties[0] > b.properties[0]) return 1;
      return 0;
    });
};

export const getSplittedLinesByLine = (
  line: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  },
  lineActions: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[]
) => {
  const splitPoints = getSplitPoints(line.latlon, lineActions);
  const splitted: { latlon: Position[]; properties: string[] }[] = [];
  let remained = { latlon: line.latlon, properties: line.properties };
  splitPoints.forEach((point) => {
    const lineString = turf.lineString(remained.latlon);
    const splitter = turf.point(point.position);
    //調整必要?
    const collection = turf.lineSplit(lineString, splitter);
    const origin = lineString.geometry.coordinates[0];
    const end = remained.latlon[remained.latlon.length - 1];
    const first = collection.features[0].geometry.coordinates[0];
    const isEndPoint = turf.booleanEqual(turf.point(point.position), turf.point(end));

    let splittedCoords;
    let remainedCoords;
    //console.log(collection.features.length);
    if (collection.features.length === 1) {
      //ラインの最初か最後が同じ場合
      remainedCoords = collection.features[0].geometry.coordinates;
    } else if (origin[0] === first[0] && origin[1] === first[1]) {
      //最初が原点側の場合
      splittedCoords = collection.features[0].geometry.coordinates;
      remainedCoords = collection.features[1].geometry.coordinates;
    } else {
      splittedCoords = collection.features[1].geometry.coordinates;
      remainedCoords = collection.features[0].geometry.coordinates;
    }
    if (splittedCoords !== undefined) {
      splitted.push({ latlon: splittedCoords, properties: remained.properties.filter((v) => v !== 'arrow') });
    }
    let updatedProperties;
    if (point.type === 'start') {
      updatedProperties = [...remained.properties, ...point.properties];
    } else if (point.type === 'end' && collection.features.length === 1 && isEndPoint) {
      updatedProperties = remained.properties;
    } else {
      updatedProperties = remained.properties.filter((f) => !point.properties.includes(f));
    }
    remained = { latlon: remainedCoords, properties: updatedProperties };
  });
  splitted.push(remained);
  return splitted;
};

export const getSplittedLinesByPoint = (
  lines: {
    latlon: Position[];
    properties: string[];
  }[],
  splitPoints: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[]
) => {
  if (splitPoints.length === 0) return lines;
  let splitted: { latlon: Position[]; properties: string[] }[] = [];
  let targetLines = lines;

  splitPoints.forEach((point) => {
    let isAddedPoint = false;
    targetLines.forEach((line) => {
      if (line.latlon.length === 1) {
        splitted.push(line);
        return;
      }
      const latLon = point.latlon[0];
      const isEqualStart = booleanNearEqual(latLon, line.latlon[0]);
      const isEqualEnd = booleanNearEqual(latLon, line.latlon[line.latlon.length - 1]);
      const lineString = turf.lineString(line.latlon);
      let splitter;
      //ラインとポイントのズレを修正
      if (isEqualStart) {
        splitter = turf.point(line.latlon[0]);
      } else if (isEqualEnd) {
        splitter = turf.point(line.latlon[line.latlon.length - 1]);
      } else {
        //console.log('B');
        splitter = turf.point(latLon);
      }

      const collection = turf.lineSplit(lineString, splitter);
      //console.log(splitter);
      if (collection.features.length === 1 && !isEqualStart && !isEqualEnd) {
        // console.log('C');
        //ラインとポイントが違うセグメント
        splitted.push(line);
      } else if (collection.features.length === 1 && isEqualStart) {
        //ラインの最初が同じ場合(追加する順番が重要、矢印に影響)
        //console.log('D');
        if (!isAddedPoint) {
          splitted.push({ latlon: point.latlon, properties: point.properties });
          isAddedPoint = true;
        }
        splitted.push(line);
      } else if (collection.features.length === 1 && isEqualEnd) {
        //console.log('E');
        //ラインの最初か最後が同じ場合
        splitted.push(line);
        if (!isAddedPoint) {
          splitted.push(point);
          isAddedPoint = true;
        }
      } else if (collection.features.length === 1 && !isEqualStart && !isEqualEnd) {
        // console.log('F');
        //ラインとポイントが違うセグメント
        splitted.push(line);
      } else {
        //  console.log('G');
        //ポイントで分割する場合
        const originIsFirst = booleanNearEqual(collection.features[0].geometry.coordinates[0], line.latlon[0]);
        if (originIsFirst) {
          // console.log('H');
          splitted.push({
            latlon: collection.features[0].geometry.coordinates,
            properties: line.properties.filter((v) => v !== 'arrow'),
          });
          splitted.push(point);
          splitted.push({
            latlon: collection.features[1].geometry.coordinates,
            properties: line.properties,
          });
        } else {
          //console.log('I');
          splitted.push({ latlon: collection.features[1].geometry.coordinates, properties: line.properties });
          splitted.push(point);
          splitted.push({
            latlon: collection.features[0].geometry.coordinates,
            properties: line.properties.filter((v) => v !== 'arrow'),
          });
        }
      }
    });
    targetLines = cloneDeep(splitted);
    splitted = [];
  });

  return targetLines;
};

export const getActionSnappedPosition = (
  pXY: Position,
  actions: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[]
) => {
  for (const action of actions) {
    const target = turf.point(pXY);
    const lineStart = action.xy[0];
    const distanceStart = turf.distance(target, turf.point(lineStart));

    if (distanceStart < 500) {
      //console.log('#######distanceStart', distanceStart, action);
      return lineStart;
    }
    const lineEnd = action.xy[action.xy.length - 1];
    const distanceEnd = turf.distance(target, turf.point(lineEnd));
    //console.log(distanceEnd);
    if (distanceEnd < 500) {
      //console.log('#######distanceEnd', distanceEnd, action, lineEnd);
      return lineEnd;
    }
  }
  return pXY;
};

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
