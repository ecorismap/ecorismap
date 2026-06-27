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
  return ['PLOT_POINT', 'PLOT_LINE', 'PLOT_POLYGON', 'ADD_LOCATION_POINT'].includes(tool);
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

// zip内のフォルダ名/ファイル名にレイヤ名を使う際の最大長（文字数）。
// レイヤ名はフォルダ名とファイル名の両方に入り、さらにUUIDや時刻が付くため、
// 長いとzip内部パスがWindowsのMAX_PATH(260文字)を超えて標準解凍に失敗する。
// レイヤ名そのものはzip内のJSONに完全な形で保存されるため、ここでの切り詰めは
// ファイル名ラベルの見た目だけに影響する。
export const MAX_FILENAME_LABEL_LENGTH = 50;

/**
 * ファイル名/フォルダ名に使う文字列を安全な長さに切り詰める。
 * @param name 元の名前（レイヤ名・プロジェクト名など）
 * @param maxLen 最大文字数（デフォルト MAX_FILENAME_LABEL_LENGTH）
 */
export function truncateForFileName(name: string, maxLen: number = MAX_FILENAME_LABEL_LENGTH): string {
  return name.length > maxLen ? name.slice(0, maxLen) : name;
}

// バックアップzipのフォルダ名/ファイル名にレイヤ名を入れる際の最大長（文字数）。
// レイヤ名はフォルダ名とファイル名の両方に入るため、2か所ぶんとULID・拡張子を足しても
// zip内部パスがWindowsで安全な範囲（実測で126文字は解凍可）に収まる長さにする。
// 42文字 → 内部パス約120文字（実証OKの126に少し余裕）。
export const MAX_BACKUP_LABEL_LENGTH = 42;

/**
 * 長い名前を「先頭＋末尾」を残して中略する。日本語レイヤ名は区別する情報が末尾
 * （日付や枝番など）にあることが多いため、先頭だけ残す単純切り詰めより識別しやすい。
 * @param name 元の名前
 * @param maxLen 最大文字数（マーカー含む。デフォルト MAX_BACKUP_LABEL_LENGTH）
 */
export function truncateMiddle(name: string, maxLen: number = MAX_BACKUP_LABEL_LENGTH): string {
  if (name.length <= maxLen) return name;
  const marker = '…';
  if (maxLen <= marker.length + 1) return name.slice(0, maxLen);
  const available = maxLen - marker.length;
  const head = Math.ceil(available * 0.6);
  const tail = available - head;
  return name.slice(0, head) + marker + (tail > 0 ? name.slice(name.length - tail) : '');
}

/**
 * パス文字列のベース名（最後の'/'以降）を返す。
 */
export function getBaseName(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * バックアップzip内から、指定レイヤの写真ファイルのキーを探す。
 * レイヤ別フォルダ名には layer.id が必ず含まれるため、レイヤ名の切り詰め有無や
 * 新旧フォーマットに関わらず layer.id とベース名（photo.name）で一意に特定できる。
 * @param fileKeys zip内の全エントリのパス一覧（JSZipのfilesのキー）
 * @param layerId レイヤID
 * @param photoName 写真ファイル名（photo.name）
 */
export function findPhotoFileKey(fileKeys: string[], layerId: string, photoName: string): string | undefined {
  return fileKeys.find((f) => f.includes(layerId) && getBaseName(f) === photoName);
}

/**
 * バックアップzip内から、指定レイヤの辞書(sqlite)ファイルのキーを探す。
 * sqliteは layer.id を含むレイヤ別フォルダ配下に置かれるため layer.id で照合する。
 * @param fileKeys zip内の全エントリのパス一覧
 * @param layerId レイヤID
 */
export function findDictionaryFileKey(fileKeys: string[], layerId: string): string | undefined {
  return fileKeys.find((f) => getExt(f) === 'sqlite' && f.includes(layerId));
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
