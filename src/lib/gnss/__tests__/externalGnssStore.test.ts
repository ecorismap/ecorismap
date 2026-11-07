import {
  EXTERNAL_FIX_STALE_MS,
  feedNmeaSentences,
  getExternalGnssSnapshot,
  isExternalFixActive,
  resetExternalGnssForTest,
  subscribeExternalFix,
} from '../externalGnssStore';

const GGA_FIX = '$GNGGA,012345.00,3540.1234567,N,13945.1234567,E,4,12,0.55,35.123,M,39.456,M,1.0,0000*59';
const GGA_NOFIX_POS = '$GPGGA,012348.00,3330.0000000,S,07030.0000000,W,1,08,1.20,100.0,M,20.0,M,,*50';

describe('externalGnssStore', () => {
  beforeEach(() => resetExternalGnssForTest({ link: 'connected' }));

  it('接続中で新しい位置があれば外部受信機を使う', () => {
    feedNmeaSentences([GGA_FIX], 10_000);
    expect(isExternalFixActive(10_000)).toBe(true);
    expect(isExternalFixActive(10_000 + EXTERNAL_FIX_STALE_MS)).toBe(true);
  });

  it('位置が途絶えたら内蔵GPSへ戻す', () => {
    feedNmeaSentences([GGA_FIX], 10_000);
    expect(isExternalFixActive(10_001 + EXTERNAL_FIX_STALE_MS)).toBe(false);
  });

  it('未接続なら位置があっても使わない', () => {
    feedNmeaSentences([GGA_FIX], 10_000);
    const snap = getExternalGnssSnapshot();
    expect(isExternalFixActive(10_000, { ...snap, status: { ...snap.status, link: 'disconnected' } })).toBe(false);
  });

  it('エポックごとに購読者へ通知する', () => {
    const received: number[] = [];
    const unsubscribe = subscribeExternalFix((fix) => received.push(fix.fixQuality));
    feedNmeaSentences([GGA_FIX, GGA_NOFIX_POS], 10_000);
    unsubscribe();
    feedNmeaSentences([GGA_FIX], 11_000);
    expect(received).toEqual([4, 1]);
  });
});
