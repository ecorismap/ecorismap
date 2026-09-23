import { buildTrackOverlaySpecs, LOW_ACCURACY_ALPHA_RATIO, trackWidthMeters } from '../trackOverlay';
import { Rgba } from '../colorUtils';
import { TrackSegmentType } from '../../../types';

const color: Rgba = [0, 0, 1, 0.93];

const segment = (count: number, isLowAccuracy = false): TrackSegmentType => ({
  coordinates: Array.from({ length: count }, (_, i) => ({ latitude: 35 + i * 0.001, longitude: 138 })),
  isLowAccuracy,
});

describe('buildTrackOverlaySpecs', () => {
  it('1点以下のセグメントはリボンにならないので捨てる', () => {
    const specs = buildTrackOverlaySpecs([segment(1), segment(0), segment(2)], 'cur', 10, color);
    expect(specs).toHaveLength(1);
    expect(specs[0].coords).toHaveLength(2);
  });

  it('低精度区間は色相を変えずにアルファだけ下げる（2Dの破線の代わり）', () => {
    const specs = buildTrackOverlaySpecs([segment(2), segment(2, true)], 'cur', 10, color);
    expect(specs[0].color).toEqual(color);
    expect(specs[1].color.slice(0, 3)).toEqual(color.slice(0, 3));
    expect(specs[1].color[3]).toBeCloseTo(color[3] * LOW_ACCURACY_ALPHA_RATIO, 6);
  });

  it('idは接頭辞＋連番で一意になる', () => {
    const saved = buildTrackOverlaySpecs([segment(2), segment(2)], 'saved-3', 10, color);
    const current = buildTrackOverlaySpecs([segment(2)], 'cur', 10, color);
    const ids = [...saved, ...current].map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('全セグメントがline指定になる', () => {
    const specs = buildTrackOverlaySpecs([segment(3), segment(4, true)], 'cur', 12, color);
    expect(specs.every((s) => s.kind === 'line')).toBe(true);
    expect(specs.every((s) => s.widthMeters === 12)).toBe(true);
  });
});

describe('trackWidthMeters', () => {
  it('ズームが1段上がると幅は半分になる', () => {
    expect(trackWidthMeters(15)).toBeCloseTo(trackWidthMeters(14) / 2, 6);
  });

  it('z14で1px≒9.55mなので4pxは約38m', () => {
    expect(trackWidthMeters(14)).toBeGreaterThan(30);
    expect(trackWidthMeters(14)).toBeLessThan(45);
  });
});
