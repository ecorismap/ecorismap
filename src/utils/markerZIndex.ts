// Google Maps SDKは同一zIndexのマーカーの描画順を保証せず、地図の再描画のたびに
// 順序が入れ替わり得る（重なったマーカーが点滅して見える。iOSで顕在化）。
// マーカーごとに一意なzIndexを与えて描画順を固定するためのユーティリティ。
// 種類ごとのバンドに分け、相対的な重なり順も固定する（値が大きいほど前面）。
// 使用側はiOSのみnativeのzIndexプロップに渡す（style.zIndexはGMSMarkerに届かない）。

// 1バンドの幅。バンド内で万一ハッシュが衝突しても、その2つが同一座標に
// 重ならない限り実害はない
const BAND_WIDTH = 0x1000000;

// マーカー種類ごとのバンド。値が大きいほど前面に描画される
export const MARKER_BAND = {
  MAPMEMO: 0, // マップメモ（ブラシ・スタンプ）は最背面（従来のstyle.zIndex=-1の意図を踏襲）
  LINE_ARROW: 1,
  POINT: 2,
  MEMBER: 3,
  POLYGON_LABEL: 4,
  LINE_LABEL: 5, // ラベルは従来(zIndex=9999)どおり他マーカーより前面
} as const;

// 選択中マーカーと現在地マーカーは全バンドより前面
export const SELECTED_MARKER_ZINDEX = 0x7ffffff0;
export const CURRENT_MARKER_ZINDEX = 0x7ffffff8;

// idの文字列から決定的にバンド内のzIndexを作る
export const markerZIndex = (band: number, id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) % (BAND_WIDTH - 1);
  }
  return band * BAND_WIDTH + h + 1;
};
