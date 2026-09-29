import { TileMapType } from '../../types';

//PDFに載せられない理由。出力前の通知で地図名と一緒に示す
export type UnprintableReason = 'basemap' | 'terrain' | 'vector' | 'local';

export const getUnprintableReason = (map: TileMapType, isWeb: boolean): UnprintableReason | undefined => {
  //標準地図・衛星写真（Google/Apple）は利用規約上タイルとして取り出せない
  if (map.id === 'standard' || map.id === 'hybrid') return 'basemap';
  //hillshade://やrelief://はローカルに生DEMタイルしか持たずPDFに描画できない
  if (map.url.startsWith('hillshade://') || map.url.startsWith('relief://')) return 'terrain';
  //ベクタタイルは画像にできない
  if (map.isVector || map.url.includes('.pbf')) return 'vector';
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
