import {
  dropInactiveExternalLocation,
  EXTERNAL_FIX_STALE_MS,
  feedNmeaSentences,
  getActiveExternalFix,
  getExternalGnssSnapshot,
  isExternalFixActive,
  resetExternalGnssForTest,
  subscribeExternalFix,
} from '../externalGnssStore';

const GGA_FIX = '$GNGGA,012345.00,3540.1234567,N,13945.1234567,E,4,12,0.55,35.123,M,39.456,M,1.0,0000*59';
// 途切れの間も座標を入れたまま品質0で出す受信機のGGA
const GGA_QUALITY0_POS = '$GNGGA,012346.00,3540.1234567,N,13945.1234567,E,0,00,99.99,35.123,M,39.456,M,,*42';
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

  it('品質0のエポックを挟んでも、最後に使えた位置から猶予内なら外部受信機を使い続ける（T-L8）', () => {
    feedNmeaSentences([GGA_FIX], 10_000);
    feedNmeaSentences([GGA_QUALITY0_POS], 11_000);
    // 表示用の最新エポックは品質0のまま
    expect(getExternalGnssSnapshot().fix?.fixQuality).toBe(0);
    expect(isExternalFixActive(11_000)).toBe(true);
    expect(isExternalFixActive(10_000 + EXTERNAL_FIX_STALE_MS)).toBe(true);
    // 位置は最後に使えたもの
    expect(getActiveExternalFix(11_000)?.fixQuality).toBe(4);
    expect(getActiveExternalFix(11_000)?.receivedAt).toBe(10_000);
  });

  it('品質0が猶予を超えて続いたら内蔵GPSへ戻す（T-L8）', () => {
    feedNmeaSentences([GGA_FIX], 10_000);
    feedNmeaSentences([GGA_QUALITY0_POS], 11_000);
    feedNmeaSentences([GGA_QUALITY0_POS], 15_500);
    expect(isExternalFixActive(10_001 + EXTERNAL_FIX_STALE_MS)).toBe(false);
    expect(getActiveExternalFix(10_001 + EXTERNAL_FIX_STALE_MS)).toBeNull();
  });

  it('品質0しか来ていなければ外部受信機を使わない', () => {
    feedNmeaSentences([GGA_QUALITY0_POS], 10_000);
    expect(isExternalFixActive(10_000)).toBe(false);
  });

  describe('dropInactiveExternalLocation（T-L11）', () => {
    const external = { latitude: 35, longitude: 139, gnss: { fixQuality: 4 } };
    const internal = { latitude: 35, longitude: 139 };

    it('外部受信機が使える位置を出している間は外部位置をそのまま使う', () => {
      feedNmeaSentences([GGA_FIX], 10_000);
      expect(dropInactiveExternalLocation(external, 10_000)).toBe(external);
    });

    it('途絶・未接続になった後に残った外部位置は捨てる', () => {
      feedNmeaSentences([GGA_FIX], 10_000);
      expect(dropInactiveExternalLocation(external, 10_001 + EXTERNAL_FIX_STALE_MS)).toBeUndefined();
      resetExternalGnssForTest({ link: 'disconnected' });
      expect(dropInactiveExternalLocation(external, 10_000)).toBeUndefined();
    });

    it('内蔵GPSの位置は受信機の状態に関係なく使う', () => {
      resetExternalGnssForTest({ link: 'disconnected' });
      expect(dropInactiveExternalLocation(internal, 10_000)).toBe(internal);
      expect(dropInactiveExternalLocation(null, 10_000)).toBeUndefined();
    });
  });
});
