import { LayerType } from '../types';

/**
 * 参照欄の「＋」・辞書入力から参照先レイヤへ記録を足せないか。
 * 実行中プロジェクトのCOMMONレイヤはメンバーのアップロード対象に入らず手元だけに残るので、一覧からの追加と同じく止める。
 * 画面遷移paramsのレイヤは古いことがあるので、最新のlayersをidで引いて判定する
 */
export const isReferenceAddLocked = (
  referenceLayer: LayerType,
  layers: LayerType[],
  isRunningProject: boolean
): boolean => {
  if (!isRunningProject) return false;
  const layer = layers.find((l) => l.id === referenceLayer.id) ?? referenceLayer;
  return layer.permission === 'COMMON';
};
