/**
 * Web版（maplibre-gl）の3D地形の標高タイルのURLを差し替える（陸の標高 ⇔ GEBCOの海底を埋めた標高）。
 *
 * `setTiles` だけでは、差し替えの時点で読み込み中だったタイルに古いURLの標高が残る。
 * - setTilesの反映は非同期で、反映までの間に読み始めたタイルは古いURLで取りに行く
 * - 反映されるとmaplibreは表示中のタイルを読み直すが、読み込み中のタイルは古い要求を止めずに
 *   新しい要求を重ねる。古い要求が先に着くと、後から着いた新しいURLの結果は捨てられる
 *   （RasterDEMTileSource.loadTile。読み込み済みのタイルは 'expired' にされるので正しく置き換わる）
 * 3D表示中に地図一覧を変えるとスタイルが作り直されて地形がいったん外れ、直後に地形を戻すので、
 * ちょうどこの「読み込み中」に当たり、GEBCO海底地形図を追加しても海が平らなままになった。
 * 新しいURLが反映された時点でタイルを捨て（読み込み中の要求も止まる）、新しいURLで読み直させる
 */
import type { Map as MaplibreMap, MapSourceDataEvent, RasterDEMTileSource } from 'maplibre-gl';

export function setWebTerrainDemTiles(map: MaplibreMap, sourceId: string, tileUrl: string): void {
  const source = map.getSource(sourceId) as RasterDEMTileSource | undefined;
  if (source === undefined || source.tiles?.[0] === tileUrl) return;

  const onData = (e: MapSourceDataEvent) => {
    // 新しいURLが反映されたときの通知だけを待つ（タイルごとの通知などは読み飛ばす）
    if (e.sourceDataType !== 'content' || e.sourceDataChanged !== true) return;
    source.off('data', onData);
    // スタイルの作り直しなどでソースが置き換わっていたら、新しいソースには手を出さない
    if (map.getSource(sourceId) !== source) return;
    // この通知は、maplibreのタイル管理が受け取って読み直しを始めるより先に届く。
    // 先に捨てておけば、続く読み直しは新しいURLで一から読む
    map.style.tileManagers[sourceId]?.clearTiles();
    map.triggerRepaint();
  };
  source.on('data', onData);
  source.setTiles([tileUrl]);
}
