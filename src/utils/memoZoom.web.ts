/**
 * マップメモ・手書きの _zoom と記号の基準ズームは、Google（256px タイル）基準のズームで揃える（作図監査 E-L8）。
 * Web の地図（maplibre）は 512px 基準で、同じ縮尺の Google より 1 小さい。揃えないと同じメモの線の太さ・
 * 記号の大きさが Web とスマホで 2 倍ずれる
 */
export const MEMO_ZOOM_OFFSET = 1;

export const toMemoZoom = (mapZoom: number): number => mapZoom + MEMO_ZOOM_OFFSET;
