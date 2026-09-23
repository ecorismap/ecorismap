import {
  bathymetryAncestor,
  encodeGsiElevation,
  encodeGsiRgba,
  exaggerateDepths,
  fillSeaWithBathymetry,
} from '../bathymetryFill';
import { decodeElevation } from '../terrainShading';

describe('encodeGsiElevation', () => {
  const roundTrip = (m: number) => {
    const out = new Uint8Array(3);
    encodeGsiElevation(m, out, 0);
    return decodeElevation(out[0], out[1], out[2]);
  };

  it('decodeElevationの逆変換になる（正値・0・負値）', () => {
    expect(roundTrip(1234.56)).toBeCloseTo(1234.56, 5);
    expect(roundTrip(0)).toBe(0);
    expect(roundTrip(-8123.45)).toBeCloseTo(-8123.45, 5);
    expect(roundTrip(-0.01)).toBeCloseTo(-0.01, 5);
  });

  it('NaNはNoData(2^23)になる', () => {
    expect(roundTrip(NaN)).toBeNaN();
  });

  it('encodeGsiRgbaは1画素版と同じRGBを書き、アルファを255にする', () => {
    const elev = new Float32Array([1234.56, 0, -8123.45, NaN]);
    const bulk = new Uint8Array(16);
    encodeGsiRgba(elev, bulk);
    for (let i = 0; i < elev.length; i++) {
      const single = new Uint8Array(3);
      encodeGsiElevation(elev[i], single, 0);
      expect([bulk[i * 4], bulk[i * 4 + 1], bulk[i * 4 + 2]]).toEqual([...single]);
      expect(bulk[i * 4 + 3]).toBe(255);
    }
  });
});

describe('bathymetryAncestor', () => {
  it('z10以下は自分自身、それより細かいズームはz10の祖先', () => {
    expect(bathymetryAncestor(9, 5, 6)).toEqual({ z: 9, x: 5, y: 6 });
    expect(bathymetryAncestor(12, 3641, 1602)).toEqual({ z: 10, x: 910, y: 400 });
  });
});

describe('fillSeaWithBathymetry', () => {
  const size = 4;

  it('NaNの画素だけを祖先の値で埋める', () => {
    const elev = new Float32Array([NaN, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, NaN]);
    const ancestor = new Float32Array(size * size).fill(-300);
    const tile = { z: 3, x: 1, y: 1 };
    const filled = fillSeaWithBathymetry(elev, size, tile, ancestor, tile, false);
    expect(filled).toBe(2);
    expect(elev[0]).toBe(-300);
    expect(elev[15]).toBe(-300);
    expect(elev[1]).toBe(5);
  });

  it('子タイルの範囲に当たる祖先の区画から引く（西半分が浅く東半分が深い祖先）', () => {
    // 祖先: 左2列=-100、右2列=-900
    const ancestor = new Float32Array(size * size).map((_, i) => (i % size < 2 ? -100 : -900));
    const west = new Float32Array(size * size).fill(NaN);
    const east = new Float32Array(size * size).fill(NaN);
    fillSeaWithBathymetry(west, size, { z: 2, x: 0, y: 0 }, ancestor, { z: 1, x: 0, y: 0 }, false);
    fillSeaWithBathymetry(east, size, { z: 2, x: 1, y: 0 }, ancestor, { z: 1, x: 0, y: 0 }, false);
    expect(west[0]).toBe(-100);
    expect(east[size - 1]).toBe(-900);
  });

  it('isSea判定で0m以下の画素も埋め、正値の陸は残す', () => {
    const elev = new Float32Array(size * size).fill(0);
    elev[5] = 12;
    const ancestor = new Float32Array(size * size).fill(-50);
    fillSeaWithBathymetry(elev, size, { z: 11, x: 0, y: 0 }, ancestor, { z: 10, x: 0, y: 0 }, true);
    expect(elev[0]).toBe(-50);
    expect(elev[5]).toBe(12);
  });

  it('祖先の正値は0mに丸める', () => {
    const elev = new Float32Array(size * size).fill(NaN);
    const ancestor = new Float32Array(size * size).fill(30);
    fillSeaWithBathymetry(elev, size, { z: 1, x: 0, y: 0 }, ancestor, { z: 1, x: 0, y: 0 }, false);
    expect(elev[0]).toBe(0);
  });
});

describe('exaggerateDepths', () => {
  it('0m未満だけに倍率を掛け、陸・0m・NoDataはそのまま', () => {
    const elev = new Float32Array([-100, 0, 250, NaN]);
    exaggerateDepths(elev, 3);
    expect(elev[0]).toBe(-300);
    expect(elev[1]).toBe(0);
    expect(elev[2]).toBe(250);
    expect(elev[3]).toBeNaN();
  });
});
