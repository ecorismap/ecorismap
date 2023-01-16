import { INFOTOOL, LINETOOL, POINTTOOL, POLYGONTOOL, SELECTIONTOOL } from '../constants/AppConstants';
import { InfoToolType, LineToolType, PointToolType, PolygonToolType, SelectionToolType } from '../types';

export function splitStringsIntoChunksOfLen(str: string, len: number) {
  const chunks = [];
  let i = 0;
  const n = str.length;
  while (i < n) {
    chunks.push(str.slice(i, (i += len)));
  }
  return chunks;
}

export function isPointTool(tool: string): tool is PointToolType {
  return Object.keys(POINTTOOL).includes(tool);
}

export function isLineTool(tool: string): tool is LineToolType {
  return Object.keys(LINETOOL).includes(tool);
}

export function isPolygonTool(tool: string): tool is PolygonToolType {
  return Object.keys(POLYGONTOOL).includes(tool);
}

export function isSelectionTool(tool: string): tool is SelectionToolType {
  return Object.keys(SELECTIONTOOL).includes(tool);
}

export function isInfoTool(tool: string): tool is InfoToolType {
  return Object.keys(INFOTOOL).includes(tool);
}

export function getExt(filename: string) {
  const ext = filename.split('.').pop();
  if (ext === filename) return '';
  return ext;
}

export function nearDegree(deg: number, interval: number) {
  const q = Math.trunc((deg % interval) / (interval / 2.0)) * interval;
  const r = Math.trunc(deg / interval);
  return r * interval + q;
}
