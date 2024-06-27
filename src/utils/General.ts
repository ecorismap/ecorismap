import { BRUSH, ERASER, INFOTOOL, LINETOOL, PEN, POINTTOOL, POLYGONTOOL, STAMP } from '../constants/AppConstants';
import { InfoToolType, LineToolType, LocationType, PointToolType, PolygonToolType, RecordType } from '../types';

export function splitStringsIntoChunksOfLen(str: string, len: number) {
  const chunks = [];
  let i = 0;
  const n = str.length;
  while (i < n) {
    chunks.push(str.slice(i, (i += len)));
  }
  return chunks;
}

export function isPlotTool(tool: string) {
  return ['PLOT_POINT', 'PLOT_LINE', 'PLOT_POLYGON'].includes(tool);
}

export function isFreehandTool(tool: string) {
  return ['FREEHAND_LINE', 'FREEHAND_POLYGON'].includes(tool);
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

export function isInfoTool(tool: string): tool is Exclude<InfoToolType, 'NONE'> {
  return tool !== 'NONE' && Object.keys(INFOTOOL).includes(tool);
}

export function getExt(filename: string) {
  const ext = filename.split('.').pop();
  if (ext === filename) return '';
  return ext;
}

export function isPenTool(tool: string) {
  return Object.keys(PEN).includes(tool);
}
export function isBrushTool(tool: string) {
  return Object.keys(BRUSH).includes(tool);
}

export function isStampTool(tool: string) {
  return Object.keys(STAMP).includes(tool);
}
export function isEraserTool(tool: string) {
  return Object.keys(ERASER).includes(tool);
}

export function isMapMemoDrawTool(tool: string) {
  return isPenTool(tool) || isBrushTool(tool) || isStampTool(tool) || isEraserTool(tool);
}

export function nearDegree(deg: number, interval: number) {
  // const q = Math.trunc((deg % interval) / (interval / 2.0)) * interval;
  // const r = Math.trunc(deg / interval);
  // return r * interval + q;
  //console.log(deg, Math.round(deg / interval) * interval);
  return Math.floor(deg / interval) * interval;
}

export function toPixel(millimeter: number) {
  return Math.round(96 * (millimeter / 25.4));
}

export function toPoint(millimeter: number) {
  return Math.round((72 * millimeter) / 25.4);
}

export function toPDFCoordinate(millimeter: number) {
  return Math.round((150 * millimeter) / 25.4);
}

export function isLocationType(coords: RecordType['coords']): coords is LocationType {
  return coords !== undefined && !Array.isArray(coords) && 'latitude' in coords && 'longitude' in coords;
}

export function isLocationTypeArray(coords: RecordType['coords']): coords is LocationType[] {
  return Array.isArray(coords) && coords.length > 0 && 'latitude' in coords[0] && 'longitude' in coords[0];
}
