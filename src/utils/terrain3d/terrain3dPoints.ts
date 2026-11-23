/**
 * 3Dで表示するポイントの選定（表示とタップのピックで同じ結果を使う）。
 *
 * 表示は投影コストのため上限件数で打ち切る。ピックが全件を見ると、
 * 描かれていない点がタップで選ばれてしまうので、両者はここを通す。
 */
import { DataType, LayerType, PointRecordType } from '../../types';

/** 3Dで同時に表示するポイント数の上限（投影計算のコスト対策） */
export const MAX_3D_POINTS = 300;

export interface Terrain3DPointEntry {
  layer: LayerType;
  record: PointRecordType;
  latitude: number;
  longitude: number;
  selected: boolean;
}

export const isSelectedPoint = (
  selectedRecord: { layerId: string; record: { id: string } } | undefined,
  layerId: string,
  recordId: string
): boolean => selectedRecord !== undefined && selectedRecord.layerId === layerId && selectedRecord.record.id === recordId;

/**
 * 可視レイヤ・可視レコードをデータ順に上限まで選ぶ。
 * 選択中の点は上限で漏れないよう必ず含め、最前面に描けるよう配列の末尾に置く
 */
export const selectTerrain3DPoints = (
  pointDataSet: readonly DataType[],
  layers: readonly LayerType[],
  selectedRecord: { layerId: string; record: { id: string } } | undefined,
  maxPoints: number = MAX_3D_POINTS
): Terrain3DPointEntry[] => {
  const result: Terrain3DPointEntry[] = [];
  let selectedEntry: Terrain3DPointEntry | null = null;
  for (const dataSet of pointDataSet) {
    const layer = layers.find((v) => v.id === dataSet.layerId);
    if (!layer?.visible) continue;
    for (const record of dataSet.data as PointRecordType[]) {
      if (!record.visible || record.coords === undefined) continue;
      const selected = selectedEntry === null && isSelectedPoint(selectedRecord, dataSet.layerId, record.id);
      const entry: Terrain3DPointEntry = {
        layer,
        record,
        latitude: record.coords.latitude,
        longitude: record.coords.longitude,
        selected,
      };
      if (selected) selectedEntry = entry;
      else if (result.length < maxPoints) result.push(entry);
      // 上限に達したら、まだ見つかっていない選択点を探すときだけ先を見る
      if (result.length >= maxPoints && (selectedRecord === undefined || selectedEntry !== null)) break;
    }
    if (result.length >= maxPoints && (selectedRecord === undefined || selectedEntry !== null)) break;
  }
  if (selectedEntry !== null) {
    if (result.length >= maxPoints) result.length = maxPoints - 1;
    result.push(selectedEntry);
  }
  return result;
};
