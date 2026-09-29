import { getTileRegion } from '../Tile';
import { TileMapType } from '../../types';
import { TileSignaturesType } from '../TileSignature';
import { CancelToken } from './runTasks';

//タイル画像を用意するときの指定。署名はPMTiles等の署名付き配信、isOfflineはモバイルのPMTiles描画、
//renderWindowはWebのベクタ描画（前面にある印刷用ウィンドウで描く）に使う
export type PdfTileMapOptions = {
  cancel?: CancelToken;
  onProgress?: (done: number, total: number) => void;
  tileSignatures?: TileSignaturesType;
  isOffline?: boolean;
  renderWindow?: Window;
};

//PDFに載せられない理由。出力前の通知で地図名と一緒に示す
export type UnprintableReason = 'basemap' | 'terrain' | 'local';

//PMTiles・pbfの地図。地図表示（Home.tsxのPMTile / HomeTerrain3D）と同じ判定
export const isPmtilesMap = (map: Pick<TileMapType, 'url'>) =>
  map.url.startsWith('pmtiles://') || map.url.includes('.pmtiles') || map.url.includes('.pbf');

//ベクタとして描く地図。isVectorだけではラスタ（地理院写真のjpg等）にも付いていて当てにならないので、
//地図表示（Home.web.tsxのisVectorTile）と同じくPMTiles/pbfのURLに限る。pbfは常にベクタ
export const isVectorPmtilesMap = (map: Pick<TileMapType, 'url' | 'isVector'>) =>
  isPmtilesMap(map) && (!!map.isVector || map.url.includes('.pbf'));

export const getUnprintableReason = (map: TileMapType, isWeb: boolean): UnprintableReason | undefined => {
  //標準地図・衛星写真（Google/Apple）は利用規約上タイルとして取り出せない
  if (map.id === 'standard' || map.id === 'hybrid') return 'basemap';
  //hillshade://やrelief://はローカルに生DEMタイルしか持たずPDFに描画できない
  if (map.url.startsWith('hillshade://') || map.url.startsWith('relief://')) return 'terrain';
  //Webは端末内の地図（取り込んだPDF/GeoTIFF等）のタイルを取り出せない。
  //取り込んだPMTiles（IndexedDBのblob:）はpmtilesライブラリで読めるので載せられる
  if (
    isWeb &&
    (map.url.includes('file://') ||
      map.url.includes('pdf://') ||
      map.url.includes('.pdf') ||
      (map.url.includes('blob:') && !isPmtilesMap(map)))
  )
    return 'local';
  return undefined;
};

//地図一覧で表示中の地図（グループ見出しは除く）。上に重なる地図が後になるよう一覧の逆順にする
const visibleMaps = (tileMaps: TileMapType[]) => tileMaps.filter((m) => !m.isGroup && m.visible).reverse();

export const getPrintableTileMaps = (tileMaps: TileMapType[], isWeb: boolean) =>
  visibleMaps(tileMaps).filter((m) => getUnprintableReason(m, isWeb) === undefined);

export const getUnprintableTileMaps = (tileMaps: TileMapType[], isWeb: boolean) =>
  visibleMaps(tileMaps)
    .reverse()
    .flatMap((m) => {
      const reason = getUnprintableReason(m, isWeb);
      return reason === undefined ? [] : [{ map: m, reason }];
    });

/**
 * 出力前に知らせる「表示中だがPDFに載らない地図」。
 * 標準地図・衛星写真は常に載らないので、ほかに載る地図が無い（背景が白紙になる）ときだけ含める
 */
export const getPdfMapNotices = (tileMaps: TileMapType[], isWeb: boolean) => {
  const hasPrintableMap = getPrintableTileMaps(tileMaps, isWeb).length > 0;
  return getUnprintableTileMaps(tileMaps, isWeb)
    .filter(({ reason }) => reason !== 'basemap' || !hasPrintableMap)
    .map(({ map, reason }) => ({ name: map.name, reason }));
};

/**
 * タイルURL。flipY（TMS）の地図は地図表示（rnmapsのflipY / maplibreのscheme:'tms'）と同じくYを反転し、
 * {-y}テンプレートにも対応する
 */
export const buildTileUrl = (map: Pick<TileMapType, 'url' | 'flipY'>, z: number, x: number, y: number) => {
  const tmsY = Math.pow(2, z) - 1 - y;
  return map.url
    .replace('{z}', z.toString())
    .replace('{x}', x.toString())
    .replace('{-y}', tmsY.toString())
    .replace('{y}', (map.flipY ? tmsY : y).toString());
};

//出典表記。HTMLタグ（リンク等）を除いた文字列を、載せた地図の分だけ重複なしで並べる
export const buildAttributionText = (maps: TileMapType[]) =>
  [
    ...new Set(
      maps
        .map((m) => m.attribution.replace(/<[^>]*>/g, '').trim())
        .filter((a) => a !== '')
    ),
    'EcorisMap',
  ].join(', ');

//これを超えるタイル数は出力前に確認する。モバイルは全タイルをbase64でHTMLに埋め込むため、
//多いと時間がかかり、メモリ不足で失敗する恐れがある（A4・1:10,000・既定ズームで約60枚）
export const PDF_TILE_WARNING_COUNT = 800;

//PDFに貼るタイル1枚分。left/topはSVGと同じタイルピクセル座標（HTML側でtileScale倍に拡大される）。
//WebのベクタPMTilesは、タイルではなく範囲を分割した画像1枚分（x/yは分割の番号）
export type PdfTileRequest = {
  map: TileMapType;
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
};

//WebのベクタPMTilesは非表示のmaplibreで範囲をまとめて描いて画像にする。
//maplibreのmaxCanvasSize（既定4096px）に収まるよう、余白込みで2048px（pixelRatio 2で4096px）に分割する
export const VECTOR_CHUNK_SIZE = 1536;
//分割の境目でラベルが切れないよう、周囲をこれだけ余分に描いて切り抜く
export const VECTOR_CHUNK_PADDING = 256;

const listVectorChunks = (
  map: TileMapType,
  tileZoom: number,
  frame: { width: number; height: number }
): PdfTileRequest[] => {
  const chunks: PdfTileRequest[] = [];
  for (let y = 0; y * VECTOR_CHUNK_SIZE < frame.height; y++) {
    for (let x = 0; x * VECTOR_CHUNK_SIZE < frame.width; x++) {
      const left = x * VECTOR_CHUNK_SIZE;
      const top = y * VECTOR_CHUNK_SIZE;
      chunks.push({
        map,
        z: tileZoom,
        x,
        y,
        left,
        top,
        width: Math.min(VECTOR_CHUNK_SIZE, frame.width - left),
        height: Math.min(VECTOR_CHUNK_SIZE, frame.height - top),
        //透過は地図表示と同じくスタイル側（塗りの不透明度）で済んでいる
        opacity: 1,
      });
    }
  }
  return chunks;
};

/**
 * ベクタの分割画像1枚をmaplibreで描くときの視点。
 * モバイル（zのタイルを512pxで描いて256px枠に貼る）とそろえ、maplibreのズームはz-1（512pxタイル基準）で
 * 1CSSピクセル=zのタイルの1ピクセルにする。描画範囲は分割より周囲VECTOR_CHUNK_PADDINGだけ広い正方形で、
 * cropが実際に使う部分（CSSピクセル）。frameOriginはタイルピクセル座標の原点（左上タイルの左上）の全体ピクセル座標
 */
export const getVectorChunkView = (chunk: PdfTileRequest, frameOrigin: { x: number; y: number }) => {
  const size = VECTOR_CHUNK_SIZE + 2 * VECTOR_CHUNK_PADDING;
  const worldSize = 256 * Math.pow(2, chunk.z);
  const centerX = frameOrigin.x + chunk.left - VECTOR_CHUNK_PADDING + size / 2;
  const centerY = frameOrigin.y + chunk.top - VECTOR_CHUNK_PADDING + size / 2;
  const longitude = (centerX / worldSize) * 360 - 180;
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * centerY) / worldSize))) * 180) / Math.PI;
  return {
    center: [longitude, latitude] as [number, number],
    zoom: chunk.z - 1,
    size,
    crop: { left: VECTOR_CHUNK_PADDING, top: VECTOR_CHUNK_PADDING, width: chunk.width, height: chunk.height },
  };
};

/**
 * 載せる地図ごとに、PDFの範囲を覆うタイルを下の地図から順に並べる。
 * overzoomThresholdを超えるズームでは、画面表示のオーバーズームと同様に
 * 提供上限ズームの親タイルを拡大して描画する（例: 1:1000のz19で地理院地図はz18を2倍表示）。
 * モバイルのPMTilesはネイティブの描画がオーバーズームも行う（ベクタは拡大せずに描き直す）ので親タイルにしない
 */
export const listPdfTiles = (
  tileMaps: TileMapType[],
  region: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  tileZoom: number,
  isWeb: boolean
): PdfTileRequest[] => {
  const { leftTileX, rightTileX, bottomTileY, topTileY } = getTileRegion(region, tileZoom);
  return getPrintableTileMaps(tileMaps, isWeb).flatMap((map) => {
    if (isWeb && isVectorPmtilesMap(map)) {
      return listVectorChunks(map, tileZoom, {
        width: 256 * (rightTileX - leftTileX + 1),
        height: 256 * (bottomTileY - topTileY + 1),
      });
    }
    const dz = !isWeb && isPmtilesMap(map) ? 0 : Math.max(0, tileZoom - (map.overzoomThreshold ?? tileZoom));
    const scaleFactor = Math.pow(2, dz);
    const tiles: PdfTileRequest[] = [];
    for (let y = Math.floor(topTileY / scaleFactor); y <= Math.floor(bottomTileY / scaleFactor); y++) {
      for (let x = Math.floor(leftTileX / scaleFactor); x <= Math.floor(rightTileX / scaleFactor); x++) {
        tiles.push({
          map,
          z: tileZoom - dz,
          x,
          y,
          left: 256 * (x * scaleFactor - leftTileX),
          top: 256 * (y * scaleFactor - topTileY),
          width: 256 * scaleFactor,
          height: 256 * scaleFactor,
          opacity: 1 - map.transparency,
        });
      }
    }
    return tiles;
  });
};

//地図ごとの重ね順を保ったまま、タイル画像をHTMLにする。srcが無い（取得できなかった）タイルは出さない
export const buildTileMapHTML = (tiles: PdfTileRequest[], srcs: (string | undefined)[]) => {
  let html = '';
  let currentMap: TileMapType | undefined;
  tiles.forEach((tile, i) => {
    if (tile.map !== currentMap) {
      if (currentMap !== undefined) html += '</div>';
      html += '<div style="position: absolute; left: 0; top: 0;">';
      currentMap = tile.map;
    }
    const src = srcs[i];
    if (src === undefined) return;
    html += `<img src="${src}" style="position: absolute; width: ${tile.width}px; height: ${tile.height}px; left: ${
      tile.left
    }px; top: ${tile.top}px; margin: 0; padding: 0; opacity:${tile.opacity.toFixed(1)}" />`;
  });
  if (currentMap !== undefined) html += '</div>';
  return html;
};
