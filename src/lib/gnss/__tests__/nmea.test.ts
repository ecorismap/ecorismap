import { NmeaFixAssembler, parseNmeaCoordinate, parseNmeaSentence } from '../nmea';
import { estimateHorizontalAccuracy, gnssFixToLocation } from '../toLocation';

const RMC = '$GNRMC,012345.00,A,3540.1234567,N,13945.1234567,E,1.944,90.5,071126,,,R,V*17';
const GGA_FIX = '$GNGGA,012345.00,3540.1234567,N,13945.1234567,E,4,12,0.55,35.123,M,39.456,M,1.0,0000*59';
const GST = '$GNGST,012345.00,0.012,0.010,0.008,45.0,0.009,0.012,0.020*7B';
const GGA_FLOAT = '$GNGGA,012346.00,3540.1234567,N,13945.1234567,E,5,10,0.80,35.200,M,39.456,M,2.0,0000*50';
const GGA_NOFIX = '$GNGGA,012347.00,,,,,0,00,99.99,,,,,,*7B';
const GGA_SW = '$GPGGA,012348.00,3330.0000000,S,07030.0000000,W,1,08,1.20,100.0,M,20.0,M,,*50';

describe('parseNmeaSentence', () => {
  it('チェックサムが合えばトーカーと文種に分ける', () => {
    const s = parseNmeaSentence(GGA_FIX);
    expect(s?.talker).toBe('GN');
    expect(s?.type).toBe('GGA');
  });

  it('チェックサムが合わない文は捨てる', () => {
    expect(parseNmeaSentence(GGA_FIX.replace('*59', '*58'))).toBeNull();
    expect(parseNmeaSentence(GGA_FIX.replace('35.123', '35.124'))).toBeNull();
  });

  it('$で始まらない行は捨てる', () => {
    expect(parseNmeaSentence('GNGGA,1,2,3')).toBeNull();
  });
});

describe('parseNmeaCoordinate', () => {
  it('度分を十進度にする（南緯・西経は負）', () => {
    expect(parseNmeaCoordinate('3540.1234567', 'N')).toBeCloseTo(35 + 40.1234567 / 60, 10);
    expect(parseNmeaCoordinate('13945.1234567', 'E')).toBeCloseTo(139 + 45.1234567 / 60, 10);
    expect(parseNmeaCoordinate('3330.0000000', 'S')).toBeCloseTo(-33.5, 10);
  });

  it('空欄はnull', () => {
    expect(parseNmeaCoordinate('', 'N')).toBeNull();
    expect(parseNmeaCoordinate('3540.0', '')).toBeNull();
  });
});

describe('NmeaFixAssembler', () => {
  it('GGAでエポックを確定し、同時刻のRMC・GSTを組み合わせる', () => {
    const a = new NmeaFixAssembler();
    expect(a.feed(RMC, 1000)).toBeNull();
    expect(a.feed(GST, 1000)).toBeNull();
    const fix = a.feed(GGA_FIX, 1000);
    expect(fix).not.toBeNull();
    expect(fix?.fixQuality).toBe(4);
    expect(fix?.satellites).toBe(12);
    expect(fix?.hdop).toBe(0.55);
    expect(fix?.altitudeMsl).toBe(35.123);
    expect(fix?.geoidSeparation).toBe(39.456);
    expect(fix?.diffAge).toBe(1.0);
    expect(fix?.speed).toBeCloseTo(1.944 * 0.514444, 5);
    expect(fix?.course).toBe(90.5);
    expect(fix?.stdLat).toBe(0.009);
    expect(fix?.stdLon).toBe(0.012);
    expect(fix?.stdAlt).toBe(0.02);
  });

  it('GGAの後に来るGSTは次のエポックで使い、時刻の違うRMCは使わない', () => {
    const a = new NmeaFixAssembler();
    a.feed(RMC, 1000);
    a.feed(GGA_FIX, 1000);
    a.feed(GST, 1000);
    const next = a.feed(GGA_FLOAT, 2000);
    expect(next?.fixQuality).toBe(5);
    expect(next?.stdLat).toBe(0.009);
    expect(next?.speed).toBeNull();
  });

  it('古すぎるGSTは使わない', () => {
    const a = new NmeaFixAssembler();
    a.feed(GST, 1000);
    expect(a.feed(GGA_FLOAT, 5000)?.stdLat).toBeNull();
  });

  it('位置のないGGAは結果を返さない', () => {
    expect(new NmeaFixAssembler().feed(GGA_NOFIX, 1000)).toBeNull();
  });

  it('GP始まりのGGAや南西半球も読める', () => {
    const fix = new NmeaFixAssembler().feed(GGA_SW, 1000);
    expect(fix?.latitude).toBeCloseTo(-33.5, 10);
    expect(fix?.longitude).toBeCloseTo(-70.5, 10);
    expect(fix?.diffAge).toBeNull();
  });
});

describe('gnssFixToLocation', () => {
  it('アンテナ高を引いた標高とGST由来の精度を返す', () => {
    const a = new NmeaFixAssembler();
    a.feed(GST, 1000);
    const fix = a.feed(GGA_FIX, 1000)!;
    const loc = gnssFixToLocation(fix, 1.8);
    expect(loc.altitude).toBeCloseTo(35.123 - 1.8, 6);
    expect(loc.accuracy).toBeCloseTo(Math.hypot(0.009, 0.012), 6);
    expect(loc.altitudeAccuracy).toBe(0.02);
    expect(loc.timestamp).toBe(1000);
    expect(loc.gnss).toEqual({
      fixQuality: 4,
      satellites: 12,
      hdop: 0.55,
      diffAge: 1.0,
      ellipsoidHeight: expect.closeTo(35.123 + 39.456 - 1.8, 6),
    });
  });

  it('GSTがなければ測位品質とHDOPから精度を見積もる', () => {
    const a = new NmeaFixAssembler();
    expect(estimateHorizontalAccuracy(a.feed(GGA_FIX, 1000)!)).toBe(0.05);
    expect(estimateHorizontalAccuracy(a.feed(GGA_FLOAT, 9000)!)).toBe(0.5);
    expect(estimateHorizontalAccuracy(a.feed(GGA_SW, 9000)!)).toBeCloseTo(3.6, 6);
  });
});
