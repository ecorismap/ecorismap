/**
 * 距離バッファ（軸方向深度=clip.w）からのワールド点復元の一致性テスト。
 *
 * placeOnDrawnTerrainは「投影 → その画素の軸深度 → pointAtAxisDepthで復元」を
 * 繰り返してドットをGPUが描いた地形へ載せる。この往復が恒等でないと、
 * ドットが地形から浮き沈みして位置ズレになる（実際に起きたバグ:
 * 軸深度を正規化レイに掛けていて、画面端で距離を15%過小評価していた）。
 * バグは画面中央では誤差0なので、テストは必ず画面四隅近くの点を含めること。
 */
import {
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  normalize3,
  orbitEye,
  orbitUp,
  pointAtAxisDepth,
  rayBasisFromCamera,
  rayDirForNdc,
} from '../matrices';

const FOV_RAD = Math.PI / 3; // 60度（CAMERA_FOV_DEGと同じ）
const TAN_HALF = Math.tan(FOV_RAD / 2);

/** 投影→軸深度→復元の往復誤差[m]を返す */
const roundtripError = (
  target: [number, number, number],
  distance: number,
  heading: number,
  pitch: number,
  aspect: number,
  point: [number, number, number]
): { error: number; ndcX: number; ndcY: number } | null => {
  const eye = orbitEye(target, distance, heading, pitch);
  const up = orbitUp(heading, pitch);
  const proj = mat4Perspective(FOV_RAD, aspect, Math.max(1, distance * 0.02), distance * 10);
  const m = mat4Multiply(proj, mat4LookAt(eye, target, up));
  const [x, y, z] = point;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (w <= 0) return null; // カメラ背面
  const ndcX = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  const ndcY = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) return null; // 画面外
  const basis = rayBasisFromCamera(eye, target, up);
  const restored = pointAtAxisDepth(basis, ndcX, ndcY, TAN_HALF, aspect, w);
  const error = Math.hypot(restored[0] - x, restored[1] - y, restored[2] - z);
  return { error, ndcX, ndcY };
};

describe('pointAtAxisDepth（軸深度からのワールド点復元）', () => {
  const aspect = 402 / 874; // iPhoneの縦画面相当
  const cameras: [number, number][] = [
    [0, 60], // 通常の3D視点
    [37, 75], // 寝かせた斜め視点（画面端の誤差が最大になる条件）
    [230, 30],
    [90, 0], // 真俯瞰（orbitUpの縮退ケース）
  ];

  it.each(cameras)('heading=%d pitch=%d: 投影→復元が恒等（画面四隅近くの点も含む）', (heading, pitch) => {
    const target: [number, number, number] = [1200, 800, -3400];
    const distance = 8000;
    // 注視点の周囲に点をばらまき、画面内に入ったもの全部で往復一致を確認する
    let tested = 0;
    let cornerTested = 0;
    for (const dx of [-4000, -1500, 0, 1500, 4000]) {
      for (const dz of [-4000, -1500, 0, 1500, 4000]) {
        for (const elev of [0, 350, 1200]) {
          const p: [number, number, number] = [target[0] + dx, elev, target[2] + dz];
          const result = roundtripError(target, distance, heading, pitch, aspect, p);
          if (result === null) continue;
          tested++;
          if (Math.abs(result.ndcX) > 0.5 || Math.abs(result.ndcY) > 0.5) cornerTested++;
          // 行列がFloat32なので厳密0にはならないが、深度8km規模でもcm級で戻ること
          expect(result.error).toBeLessThan(0.1);
        }
      }
    }
    expect(tested).toBeGreaterThan(5);
    expect(cornerTested).toBeGreaterThan(0); // 中央だけのテストではcosθバグを検出できない
  });

  it('正規化レイに軸深度を掛ける旧実装は画面端で大きくずれる（回帰ガード）', () => {
    const target: [number, number, number] = [0, 500, 0];
    const distance = 8000;
    const heading = 0;
    const pitch = 60;
    const eye = orbitEye(target, distance, heading, pitch);
    const up = orbitUp(heading, pitch);
    const basis = rayBasisFromCamera(eye, target, up);
    // 画面隅に近いNDC位置で、正しい復元と「正規化レイ×軸深度」を比較する
    const ndcX = 0.9;
    const ndcY = -0.9;
    const axisDepth = 9000;
    const correct = pointAtAxisDepth(basis, ndcX, ndcY, TAN_HALF, aspect, axisDepth);
    const dirNorm = normalize3(rayDirForNdc(basis, ndcX, ndcY, TAN_HALF, aspect));
    const wrong = [eye[0] + dirNorm[0] * axisDepth, eye[1] + dirNorm[1] * axisDepth, eye[2] + dirNorm[2] * axisDepth];
    const diff = Math.hypot(wrong[0] - correct[0], wrong[1] - correct[1], wrong[2] - correct[2]);
    // FOV60°・縦画面の隅では数百m規模の過小評価になる
    expect(diff).toBeGreaterThan(100);
  });

  const aspectForGuard = 402 / 874;
  it('rayDirForNdcのforward成分はちょうど1（軸深度をそのまま掛けられる前提の検証）', () => {
    for (const [heading, pitch] of cameras) {
      const eye = orbitEye([0, 0, 0], 1000, heading, pitch);
      const basis = rayBasisFromCamera(eye, [0, 0, 0], orbitUp(heading, pitch));
      for (const [nx, ny] of [
        [0, 0],
        [1, 1],
        [-1, 1],
        [0.7, -0.9],
      ]) {
        const dir = rayDirForNdc(basis, nx, ny, TAN_HALF, aspectForGuard);
        const alongForward = dir[0] * basis.forward[0] + dir[1] * basis.forward[1] + dir[2] * basis.forward[2];
        expect(alongForward).toBeCloseTo(1, 10);
      }
    }
  });
});
