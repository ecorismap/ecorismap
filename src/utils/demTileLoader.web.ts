/**
 * 標高タイルのPNGバイト列を取得する（Web版）。
 * ブラウザ自身のHTTPキャッシュがディスク層を担うため、ここでは素朴にfetchするだけ。
 *
 * @returns PNGバイト列。404はnull。ネットワークエラーはthrow（呼び出し側でキャッシュさせないため）
 */
export const loadDemTilePng = async (url: string, _key: string): Promise<ArrayBuffer | null> => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return await response.arrayBuffer();
};

/** Webにはオフラインダウンロード機能がないため常にnull */
export const loadLocalDemTilePng = async (_fileUri: string): Promise<ArrayBuffer | null> => null;

/**
 * Web版の等値線数値ラベル（contourLabels）はmaplibre-contourが担うため未使用。
 * PNGならそのまま返し、WebPはnull（呼ばれない前提の簡易実装）。
 */
export const loadDemTileAsPngBytes = async (url: string, key: string): Promise<ArrayBuffer | null> => {
  const bytes = await loadDemTilePng(url, key);
  if (bytes === null) return null;
  const head = new Uint8Array(bytes);
  const isWebp = head.length > 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
  return isWebp ? null : bytes;
};

export const loadLocalDemTileAsPngBytes = async (_fileUri: string): Promise<ArrayBuffer | null> => null;

/** Webはブラウザキャッシュ任せなので何もしない */
export const clearDemTileDiskCache = async (): Promise<void> => {};
