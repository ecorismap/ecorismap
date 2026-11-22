import type { GnssReceiverStatus } from '../../../../modules/gnss-receiver/src';
import {
  getReconnectDelayMs,
  isLinkLostByError,
  isLocationInUse,
  RECONNECT_GIVE_UP_MS,
  shouldApplyNtripOnConnect,
  shouldGiveUpReconnect,
  shouldReleaseInBackground,
} from '../autoReconnect';

const STATUS: GnssReceiverStatus = {
  link: 'connected',
  linkName: 'rx',
  linkError: null,
  ntrip: 'off',
  ntripError: null,
  rtcmBytes: 0,
  lastCorrectionAt: 0,
};
const DISCONNECTED: GnssReceiverStatus = { ...STATUS, link: 'disconnected', linkName: null };

describe('getReconnectDelayMs', () => {
  it('5秒から倍にして60秒で頭打ちにする', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(getReconnectDelayMs)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ]);
  });
});

describe('shouldGiveUpReconnect', () => {
  it('切れてから30分でやめる', () => {
    expect(shouldGiveUpReconnect(0, RECONNECT_GIVE_UP_MS - 1)).toBe(false);
    expect(shouldGiveUpReconnect(0, RECONNECT_GIVE_UP_MS)).toBe(true);
  });
});

describe('isLinkLostByError', () => {
  it('接続中からエラー付きで切れたときだけ真', () => {
    expect(isLinkLostByError(STATUS, { ...DISCONNECTED, linkError: 'BLE disconnected' })).toBe(true);
  });

  it('切断ボタン（linkErrorなし）は含まない', () => {
    expect(isLinkLostByError(STATUS, DISCONNECTED)).toBe(false);
  });

  it('接続の試行の失敗（connecting から）は含まない', () => {
    expect(isLinkLostByError({ ...STATUS, link: 'connecting' }, { ...DISCONNECTED, linkError: 'timed out' })).toBe(
      false
    );
  });
});

describe('isLocationInUse', () => {
  it('GPSがONか記録中なら使っている', () => {
    expect(isLocationInUse('off', 'off')).toBe(false);
    expect(isLocationInUse('show', 'off')).toBe(true);
    expect(isLocationInUse('follow', 'off')).toBe(true);
    expect(isLocationInUse('off', 'on')).toBe(true);
  });
});

describe('shouldReleaseInBackground', () => {
  const base = { appState: 'background' as const, inUse: false, canAutoConnect: true, status: STATUS };

  it('位置を使っていないバックグラウンドで、つながっていれば切り離す', () => {
    expect(shouldReleaseInBackground(base)).toBe(true);
  });

  it('受信機が切れていても NTRIP が動いていれば止める', () => {
    expect(shouldReleaseInBackground({ ...base, status: { ...DISCONNECTED, ntrip: 'connected' } })).toBe(true);
  });

  it('何もつながっていなければ何もしない', () => {
    expect(shouldReleaseInBackground({ ...base, status: DISCONNECTED })).toBe(false);
  });

  it('GPSがONか記録中、前面・inactive、自動接続できないときは切り離さない', () => {
    expect(shouldReleaseInBackground({ ...base, inUse: true })).toBe(false);
    expect(shouldReleaseInBackground({ ...base, appState: 'active' })).toBe(false);
    expect(shouldReleaseInBackground({ ...base, appState: 'inactive' })).toBe(false);
    expect(shouldReleaseInBackground({ ...base, canAutoConnect: false })).toBe(false);
  });
});

describe('shouldApplyNtripOnConnect', () => {
  it('設定で有効なまま動いていれば張り直さない', () => {
    expect(shouldApplyNtripOnConnect('connected', true)).toBe(false);
    expect(shouldApplyNtripOnConnect('connecting', true)).toBe(false);
    expect(shouldApplyNtripOnConnect('error', true)).toBe(false);
  });
  it('止まっていれば始める。設定で無効なら止めるために呼ぶ', () => {
    expect(shouldApplyNtripOnConnect('off', true)).toBe(true);
    expect(shouldApplyNtripOnConnect('connected', false)).toBe(true);
    expect(shouldApplyNtripOnConnect('off', false)).toBe(true);
  });
});
