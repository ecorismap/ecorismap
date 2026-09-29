import { getTileRegion } from '../Tile';
import { TileMapType } from '../../types';

//PDFに載せられない理由。出力前の通知で地図名と一緒に示す
export type UnprintableReason = 'basemap' | 'terrain' | 'vector' | 'local';

export const getUnprintableReason = (map: TileMapType, isWeb: boolean): UnprintableReason | undefined => {
  //標準地図・衛星写真（Google/Apple）は利用規約上タイルとして取り出せない
  if (map.id === 'standard' || map.id === 'hybrid') return 'basemap';
  //hillshade://やrelief://はローカルに生DEMタイルしか持たずPDFに描画できない
  if (map.url.startsWith('hillshade://') || map.url.startsWith('relief://')) return 'terrain';
  //ベクタタイルは画像にできない。判定は地図表示（Home.web.tsxのisVectorTile）と同じく、
  //PMTiles/pbfのURLかつisVectorのとき。isVectorだけではラスタ（地理院写真のjpg等）にも付いていて当てにならない
  const isVectorUrl = map.url.startsWith('pmtiles://') || map.url.includes('.pmtiles') || map.url.includes('.pbf');
  if ((isVectorUrl && map.isVector) || map.url.includes('.pbf')) return 'vector';
  //Webは端末内の地図（取り込んだPDF/GeoTIFF、PMTiles等）のタイルを取り出せない
  if (
    isWeb &&
    (map.url.includes('file://') ||
      map.url.includes('pmtiles://') ||
      map.url.includes('.pmtiles') ||
      map.url.includes('pdf://') ||
      map.url.includes('.pdf') ||
      map.url.includes('blob:'))
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

//PDFに貼るタイル1枚分。left/topはSVGと同じタイルピクセル座標（HTML側でtileScale倍に拡大される）
export type PdfTileRequest = {
  map: TileMapType;
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
  size: number;
};

/**
 * 載せる地図ごとに、PDFの範囲を覆うタイルを下の地図から順に並べる。
 * overzoomThresholdを超えるズームでは、画面表示のオーバーズームと同様に
 * 提供上限ズームの親タイルを拡大して描画する（例: 1:1000のz19で地理院地図はz18を2倍表示）
 */
export const listPdfTiles = (
  tileMaps: TileMapType[],
  region: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  tileZoom: number,
  isWeb: boolean
): PdfTileRequest[] => {
  const { leftTileX, rightTileX, bottomTileY, topTileY } = getTileRegion(region, tileZoom);
  return getPrintableTileMaps(tileMaps, isWeb).flatMap((map) => {
    const dz = Math.max(0, tileZoom - (map.overzoomThreshold ?? tileZoom));
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
          size: 256 * scaleFactor,
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
    html += `<img src="${src}" style="position: absolute; width: ${tile.size}px; height: ${tile.size}px; left: ${
      tile.left
    }px; top: ${tile.top}px; margin: 0; padding: 0; opacity:${(1 - tile.map.transparency).toFixed(1)}" />`;
  });
  if (currentMap !== undefined) html += '</div>';
  return html;
};
