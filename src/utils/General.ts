import { BRUSH, ERASER, LINETOOL, POINTTOOL, POLYGONTOOL, STAMP } from '../constants/AppConstants';
import { LineToolType, LocationType, PointToolType, PolygonToolType, RecordType } from '../types';

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

export function getExt(filename: string) {
  const ext = filename.split('.').pop();
  if (ext === filename || ext === undefined) return '';
  return ext;
}

export function isPenTool(tool: string) {
  return tool === 'PEN';
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
  const q = Math.trunc((deg % interval) / (interval / 2.0)) * interval;
  const r = Math.trunc(deg / interval);
  return r * interval + q;
  //console.log(deg, Math.round(deg / interval) * interval);
  //return Math.floor(deg / interval) * interval;
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

export function isLocationType(coords: unknown): coords is LocationType {
  return (
    coords !== undefined &&
    coords !== null &&
    !Array.isArray(coords) &&
    typeof coords === 'object' &&
    'latitude' in coords &&
    'longitude' in coords &&
    typeof (coords as any).latitude === 'number' &&
    typeof (coords as any).longitude === 'number' &&
    !isNaN((coords as any).latitude) &&
    !isNaN((coords as any).longitude) &&
    Math.abs((coords as any).latitude) <= 90 &&
    Math.abs((coords as any).longitude) <= 180
  );
}

export function isLocationTypeArray(coords: RecordType['coords']): coords is LocationType[] {
  return Array.isArray(coords) && coords.length > 0 && 'latitude' in coords[0] && 'longitude' in coords[0];
}
