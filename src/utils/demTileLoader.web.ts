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

/** Webはブラウザキャッシュ任せなので何もしない */
export const clearDemTileDiskCache = async (): Promise<void> => {};
