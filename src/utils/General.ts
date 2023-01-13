import { DRAWTOOL, SELECTIONTOOL } from '../constants/AppConstants';
import { DrawToolType, LineToolType, SelectionToolType } from '../types';

export function splitStringsIntoChunksOfLen(str: string, len: number) {
  const chunks = [];
  let i = 0;
  const n = str.length;
  while (i < n) {
    chunks.push(str.slice(i, (i += len)));
  }
  return chunks;
}

export function isDrawTool(tool: string): tool is DrawToolType {
  return Object.keys(DRAWTOOL).includes(tool);
}

export function isSelectionTool(tool: LineToolType): tool is SelectionToolType {
  return Object.keys(SELECTIONTOOL).includes(tool);
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
