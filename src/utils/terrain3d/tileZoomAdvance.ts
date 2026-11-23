/**
 * 表示ズーム（activeZoom）の切り替え判定。
 *
 * ズームを進めた瞬間は旧ズームのタイルが標高の引き先から外れるが、新しいタイルは
 * 届いていない（readyGenは増えない）。世代を進めないと、最後の新タイルの到着直後に
 * 旧ズームの標高で作り直したオーバーレイが「暫定」のまま二度と作り直されない（V-M4(B)）。
 * そのため、表示ズームが実際に変わったことも新しい世代として数える
 */
export const advanceActiveZoom = (
  activeZoom: number | null,
  texZoom: number,
  newZoomReady: boolean,
  neededCount: number
): { activeZoom: number | null; changed: boolean } => {
  if (!newZoomReady || neededCount === 0 || activeZoom === texZoom) return { activeZoom, changed: false };
  return { activeZoom: texZoom, changed: true };
};
