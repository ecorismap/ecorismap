import { useTileSignatures } from '../../hooks/useTileSignatures';

// 署名付きタイル配信の署名をtileMapsに追随して取得する。表示を持たない常駐コンポーネント。
// アプリのルート（Provider配下）に1つだけ置く。
export const TileSignatureSync = (): null => {
  useTileSignatures();
  return null;
};
