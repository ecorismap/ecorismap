/**
 * 3Dの外（データ一覧・データ編集・プロジェクトからの「ジャンプ」）から来たカメラ移動の扱い。
 *
 * 眺望中は注視点を毎フレーム立ち位置から導出し直すので、中心を書き換えても次のフレームで
 * 上書きされ、ジャンプしても視点が動かなかった（V-L3）。中心を伴う移動が来たら眺望を解いてから動かす。
 * GPS追従・ヘディングアップはanimateCamera経由で来るので、この判定には通さない
 * （現在地からの眺望は立ち位置の追従で別に扱う）
 */
export const shouldLeaveVistaForJump = (
  vistaActive: boolean,
  target: { center?: { latitude: number; longitude: number } }
): boolean => vistaActive && target.center !== undefined;
