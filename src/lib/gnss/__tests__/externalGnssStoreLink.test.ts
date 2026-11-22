import type { GnssReceiverStatus } from '../../../../modules/gnss-receiver/src';

const CONNECTED: GnssReceiverStatus = {
  link: 'connected',
  linkName: 'test',
  linkError: null,
  ntrip: 'off',
  ntripError: null,
  rtcmBytes: 0,
  lastCorrectionAt: 0,
};

let statusListener: ((status: GnssReceiverStatus) => void) | null = null;

jest.mock('../../../../modules/gnss-receiver/src', () => ({
  isGnssReceiverAvailable: () => true,
  getStatus: () => CONNECTED,
  addNmeaListener: () => ({ remove: jest.fn() }),
  addStatusListener: (listener: (status: GnssReceiverStatus) => void) => {
    statusListener = listener;
    return { remove: jest.fn() };
  },
}));

import {
  feedNmeaSentences,
  getActiveExternalFix,
  getExternalGnssSnapshot,
  isExternalFixActive,
  subscribeExternalGnss,
} from '../externalGnssStore';

const GGA_FIX = '$GNGGA,012345.00,3540.1234567,N,13945.1234567,E,4,12,0.55,35.123,M,39.456,M,1.0,0000*59';

describe('externalGnssStore の接続状態', () => {
  it('切断したら最後に使えた位置も消し、再接続直後に前回の位置を使わない（T-L8）', () => {
    const unsubscribe = subscribeExternalGnss(() => undefined);
    expect(statusListener).not.toBeNull();
    feedNmeaSentences([GGA_FIX], 10_000);
    expect(isExternalFixActive(10_000)).toBe(true);

    statusListener?.({ ...CONNECTED, link: 'disconnected' });
    expect(getExternalGnssSnapshot().lastUsableFix).toBeNull();
    expect(getExternalGnssSnapshot().fix).toBeNull();

    statusListener?.(CONNECTED);
    expect(isExternalFixActive(10_000)).toBe(false);
    expect(getActiveExternalFix(10_000)).toBeNull();
    unsubscribe();
  });
});
