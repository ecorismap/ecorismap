import { cameraClearance, cameraLiftMeters } from '../cameraClearance';
import { orbitEye } from '../matrices';

describe('視点が地形に埋まらない持ち上げ量（V-M2）', () => {
  const elevScale = 1.8;
  const distance = 2900;

  it('視点の真下が低ければ持ち上げない', () => {
    expect(cameraLiftMeters(1000, 900, distance, 80, elevScale)).toBe(0);
  });

  it('標高が取れなければ持ち上げない', () => {
    expect(cameraLiftMeters(1000, null, distance, 80, elevScale)).toBe(0);
  });

  it('背後の登り斜面に埋まるときは、地表＋余裕の高さまで注視点ごと持ち上げる', () => {
    const target = 1000;
    const groundAtEye = 1500;
    const pitch = 80;
    const lift = cameraLiftMeters(target, groundAtEye, distance, pitch, elevScale);
    expect(lift).toBeGreaterThan(0);
    // 持ち上げた注視点から組んだ視点が、真下の地表＋余裕にちょうど載る
    const eye = orbitEye([0, (target + lift) * elevScale, 0], distance, 0, pitch);
    expect(eye[1]).toBeCloseTo(groundAtEye * elevScale + cameraClearance(distance), 6);
  });

  it('リプレイの俯角（68°）でも同じように効く', () => {
    expect(cameraLiftMeters(500, 1300, distance, 68, elevScale)).toBeGreaterThan(0);
  });

  it('余裕はニア面より大きく、近距離でも下限を下回らない', () => {
    expect(cameraClearance(distance)).toBeGreaterThan(distance * 0.02);
    expect(cameraClearance(10)).toBeGreaterThanOrEqual(10);
  });
});
