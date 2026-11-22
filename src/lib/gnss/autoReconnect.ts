import type { AppStateStatus } from 'react-native';
import type { GnssReceiverStatus, NtripState } from '../../../modules/gnss-receiver/src';

/**
 * 外部GNSS受信機の自動再接続（T-L7）とバックグラウンドでの切り離し（T-M6）の判定。
 * 副作用は useExternalGnssAutoConnect に置き、ここは純粋な判定だけにする。
 */

/** 再接続の待ち時間。1回目は5秒後、以後は倍にして60秒で頭打ち */
export const RECONNECT_INITIAL_DELAY_MS = 5_000;
export const RECONNECT_MAX_DELAY_MS = 60_000;
/**
 * リンクが切れてからこれだけ経っても戻らなければ、再接続をやめる。
 * 受信機の電源切れ・圏外のまま試し続けて電池を使わないため。
 * やめた後も、前面復帰・USB装着・GPSのON・記録開始のきっかけでまた試す。
 */
export const RECONNECT_GIVE_UP_MS = 30 * 60_000;

/** attempt回目（0始まり）の再接続までの待ち時間 */
export const getReconnectDelayMs = (attempt: number): number =>
  Math.min(RECONNECT_INITIAL_DELAY_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_DELAY_MS);

/**
 * つながってからこれだけ続けば、切断のエピソード（待ち時間の段階と30分の起点）を終える。
 * つながってはすぐ切れるリンク（電波ぎりぎりのBLE・接触の悪いUSB）で、短い接続のたびに
 * 5秒待ちと30分の起点がやり直しになり、再接続が際限なく続かないようにする
 */
export const RECONNECT_STABLE_MS = 60_000;

export const shouldGiveUpReconnect = (lostAt: number, now: number): boolean => now - lostAt >= RECONNECT_GIVE_UP_MS;

/**
 * 接続中のリンクがエラーで切れたか。
 * 「切断」ボタンやバックグラウンドでの切り離し（detachLink）は linkError を空にするので含まない。
 * 接続の試行の失敗（connecting → disconnected）も含まない（試行の結果は呼び出し側で見る）
 */
export const isLinkLostByError = (prev: GnssReceiverStatus, next: GnssReceiverStatus): boolean =>
  prev.link === 'connected' && next.link === 'disconnected' && next.linkError !== null;

/** 位置を使っているか（GPSがONか記録中）。このときは受信機を切り離さず、切れたら再接続する */
export const isLocationInUse = (gpsState: 'follow' | 'show' | 'off', trackingState: 'on' | 'off'): boolean =>
  gpsState !== 'off' || trackingState === 'on';

/**
 * バックグラウンドで受信機とNTRIPを切り離すか（T-M6）。
 * 位置を使っていないときだけ。自動接続できない（autoConnectがOFF・前回の受信機を覚えていない）なら
 * 前面に戻ってもつなぎ直せないので、切り離さない
 */
export const shouldReleaseInBackground = (params: {
  appState: AppStateStatus;
  inUse: boolean;
  canAutoConnect: boolean;
  status: GnssReceiverStatus;
}): boolean => {
  const { appState, inUse, canAutoConnect, status } = params;
  if (appState !== 'background' || inUse || !canAutoConnect) return false;
  return status.link !== 'disconnected' || status.ntrip !== 'off';
};

/**
 * 受信機につないだときに NTRIP を（設定に合わせて）張り直すか。
 * NTRIP はリンクが切れても止めない（T-L10）ので、設定で有効なまま動いていれば張り直さない。
 * 張り直すと再接続のたびにキャスターへのログインがやり直しになる。
 * 設定で無効なのに動いているときは、止めるために呼ぶ（startNtripIfEnabled が止める）
 */
export const shouldApplyNtripOnConnect = (ntripState: NtripState, canStartNtrip: boolean): boolean =>
  !canStartNtrip || ntripState === 'off';
