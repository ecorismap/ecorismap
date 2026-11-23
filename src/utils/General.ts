import { BRUSH, ERASER, LINETOOL, POINTTOOL, POLYGONTOOL, STAMP } from '../constants/AppConstants';
import { LineToolType, LocationType, PointToolType, PolygonToolType, RecordType } from '../types';
import sanitize from 'sanitize-filename';

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
 * 写真名をZIPに入れるときの名前にそろえる。書き出し（File.ts/File.web.ts）は sanitize-filename を
 * 通してから入れるので、末尾の「.」や使えない文字が落ちる。以前のWebは拡張子のない「EMAP_…_.」の名前を
 * 付けていたため、ZIPでは「EMAP_…_」になり、記録の名前と一致せず写真が戻らなかった（写真監査 P-M3）。
 * 取り込みの照合では、記録側の名前とZIP側の名前の両方にこれをかけて比べる
 */
export function normalizePhotoZipName(name: string): string {
  return sanitize(name.normalize('NFC')).normalize('NFC');
}

/**
 * 写真名の拡張子から、Storage Rules が通す画像の種類（image/jpeg か image/png）を決める。
 * 拡張子が分からない名前（以前のWebが付けた「EMAP_…_.」など）は undefined
 */
export function photoContentTypeFromName(name: string | null | undefined): 'image/jpeg' | 'image/png' | undefined {
  if (!name) return undefined;
  const ext = name.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return undefined;
}

/**
 * バックアップzip内から、指定レイヤの写真ファイルのキーを探す。
 * レイヤ別フォルダ名には layer.id が必ず含まれるため、レイヤ名の切り詰め有無や
 * 新旧フォーマットに関わらず layer.id とベース名（photo.name）で一意に特定できる。
 * @param fileKeys zip内の全エントリのパス一覧（JSZipのfilesのキー）
 * @param layerId レイヤID
 * @param photoName 写真ファイル名（photo.name）
 * @param photoId 写真のID（photo.id）。新しい書き出しは同名の写真が上書きし合わないよう
 *   `レイヤフォルダ/photo.id/photo.name` に入れるため、IDのフォルダにあるものを優先する。
 *   見つからなければ旧形式（レイヤフォルダ直下）としてベース名だけで照合する
 */
export function findPhotoFileKey(
  fileKeys: string[],
  layerId: string,
  photoName: string,
  photoId?: string
): string | undefined {
  //名前は書き出しと同じ正規化をかけて比べる（末尾の「.」が落ちた名前・NFD/NFCの違いでも見つける）
  const target = normalizePhotoZipName(photoName);
  const candidates = fileKeys.filter((f) => f.includes(layerId) && normalizePhotoZipName(getBaseName(f)) === target);
  if (photoId !== undefined && photoId !== '') {
    const byId = candidates.find((f) => {
      const segments = f.split('/');
      return segments[segments.length - 2] === photoId;
    });
    if (byId !== undefined) return byId;
  }
  return candidates[0];
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

export function isHandwritingTool(tool: string) {
  return tool === 'HANDWRITING_LINE' || tool === 'HANDWRITING_POLYGON';
}

export function isMapMemoDrawTool(tool: string) {
  return isPenTool(tool) || isBrushTool(tool) || isStampTool(tool) || isEraserTool(tool);
}

//地図ジェスチャー（パン・ズーム）を許可するか。ツール状態から静的に決まる唯一の判定関数で、
//native(scrollEnabled/zoomEnabled)とWeb(dragPan等)の両方がこれを参照する。
//作図系ツール・メモ描画ツールがオンの間は無効（描きかけの消失・座標未確定事故の防止）。
//地図を動かしたいときは地図移動(MOVE)ツールへの持ち替え（メモはツールをオフ）で行う。
//ペンロック中は指のタッチ（isPencilTouch=false）だけ地図操作として許可する
export function getMapGesturesEnabled(params: {
  currentMapMemoTool: string;
  currentDrawTool: string;
  isPencilModeActive: boolean;
  isPencilTouch: boolean | undefined;
}) {
  const { currentMapMemoTool, currentDrawTool, isPencilModeActive, isPencilTouch } = params;
  if (isMapMemoDrawTool(currentMapMemoTool)) {
    //メモ描画ツール中はペンロックの指タッチのみ地図操作。
    //ピンチで中断したストロークが残っていても指で地図を動かせるよう、描きかけの有無は見ない
    return isPencilModeActive && !isPencilTouch;
  }
  return (
    currentMapMemoTool === 'NONE' &&
    (currentDrawTool === 'NONE' ||
      currentDrawTool === 'MOVE' ||
      currentDrawTool.includes('INFO') ||
      currentDrawTool === 'MOVE_POINT' ||
      (isPencilModeActive && !isPencilTouch))
  );
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

/**
 * 重い同期処理をイベントループに逃がして実行する。
 * インポートのparse等でUIスレッドをブロックしないよう、処理の合間にレンダリングの機会を作る。
 */
export function runAsync<T>(fn: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    }, 0);
  });
}

/**
 * SVG・XMLのテキストや属性に安全に埋め込めるようエスケープする。
 */
export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
