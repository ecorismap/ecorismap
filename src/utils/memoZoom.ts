/**
 * マップメモ・手書きの _zoom と記号の基準ズームは、Google（256px タイル）基準のズームで揃える（作図監査 E-L8）。
 * ネイティブの地図（Google）のズームはそのまま使う。Web 版は memoZoom.web.ts
 */
export const MEMO_ZOOM_OFFSET = 0;

export const toMemoZoom = (mapZoom: number): number => mapZoom + MEMO_ZOOM_OFFSET;
