import { TileMapType } from '../types';

/**
 * PDF から作った地図か。
 * 複数ページの PDF のページ地図は url が `file://地図名` で `.pdf` で終わらないため、url の拡張子だけで判定すると
 * PDF として扱われない（共有されない・オフラインで基準ズームが切り詰められる）。取り込みで必ず付く
 * attribution 'PDF' も見る（既存のページ地図もこれで判定できる）（M-M11）
 */
export const isPdfTileMap = (tileMap: Pick<TileMapType, 'url' | 'attribution'>): boolean => {
  if (tileMap.attribution === 'PDF') return true;
  const url = tileMap.url.toLowerCase();
  // 署名や Basic 認証の付いた URL でも拡張子で判定できるよう、問い合わせ部分は除く
  const path = url.split(/[?#]/)[0];
  return path.endsWith('.pdf') || url.startsWith('pdf://');
};

const LEGACY_PAGE_NAME = /_page(\d+)$/;

/**
 * 複数ページの PDF を地図 source からダウンロードして作ったページ地図を、ページ番号ごとに返す。
 * 再ダウンロードでこれらを置き換え、押すたびにページ地図が増えないようにする（M-M11）。
 * pdfSourceId を持たない以前のページ地図は、当時の作り方（url=`file://元の地図名`、名前=`元の地図名_pageNN`）で拾う
 */
export const findPdfPageMaps = (
  tileMaps: readonly TileMapType[],
  source: Pick<TileMapType, 'id' | 'name'>
): Map<number, TileMapType> => {
  const pages = new Map<number, TileMapType>();
  for (const m of tileMaps) {
    if (m.id === source.id || m.isGroup) continue;
    if (m.pdfSourceId === source.id && m.pdfPage !== undefined) {
      pages.set(m.pdfPage, m);
      continue;
    }
    if (m.pdfSourceId !== undefined || m.attribution !== 'PDF' || m.url !== `file://${source.name}`) continue;
    const match = LEGACY_PAGE_NAME.exec(m.name);
    if (match === null) continue;
    const page = Number(match[1]);
    // 新しい形式の同じページがあればそちらを使う
    if (!pages.has(page)) pages.set(page, m);
  }
  return pages;
};
