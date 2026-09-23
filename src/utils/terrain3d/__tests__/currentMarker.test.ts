import { currentMarkerKind, screenMarkerAngle } from '../currentMarker';

describe('screenMarkerAngle', () => {
  it('北向きの端末・北向きのカメラでは回さない', () => {
    expect(screenMarkerAngle(0, 0)).toBe(0);
  });

  it('カメラが東を向いていれば、北を指す端末は画面上で270度（左）を向く', () => {
    expect(screenMarkerAngle(0, 90)).toBe(270);
  });

  it('カメラと同じ方位を向いていれば常に画面の真上', () => {
    expect(screenMarkerAngle(120, 120)).toBe(0);
    expect(screenMarkerAngle(350, 350)).toBe(0);
  });

  it('0/360のまたぎを正規化する', () => {
    expect(screenMarkerAngle(350, 20)).toBe(330);
    expect(screenMarkerAngle(20, 350)).toBe(30);
  });

  it('カメラを回した角度がそのまま差し引かれる', () => {
    expect(screenMarkerAngle(45, 0)).toBe(45);
    expect(screenMarkerAngle(45, 30)).toBe(15);
  });
});

describe('currentMarkerKind', () => {
  it('staleは精度に関わらず灰色', () => {
    expect(currentMarkerKind(1, true)).toBe('gray');
    expect(currentMarkerKind(undefined, true)).toBe('gray');
  });

  it('精度30m超で灰色、15m超で橙、それ以下は赤', () => {
    expect(currentMarkerKind(31, false)).toBe('gray');
    expect(currentMarkerKind(30, false)).toBe('orange');
    expect(currentMarkerKind(16, false)).toBe('orange');
    expect(currentMarkerKind(15, false)).toBe('red');
    expect(currentMarkerKind(5, false)).toBe('red');
  });

  it('精度が無い場合は赤（2Dのaccuracy未設定と同じ扱い）', () => {
    expect(currentMarkerKind(undefined, false)).toBe('red');
    expect(currentMarkerKind(null, false)).toBe('red');
  });
});
