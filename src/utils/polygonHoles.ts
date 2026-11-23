import { Position } from 'geojson';

//外周の変形が「平行移動＋回転」とみなせるときの許容誤差（画面px）。
//なげなわの一括変形は画面座標で剛体変換し緯度経度へ戻しているので、往復の丸め程度しかずれない
const RIGID_TOLERANCE_PX = 1.0;

/**
 * 外周が変形前 original から変形後 moved へ平行移動・回転だけで動いたとき、穴（内側のリング）にも
 * 同じ変換をかけた座標を返す（いずれも画面座標）。
 * 頂点数が違う・頂点を個別に動かした（剛体変換でない）・動いていない場合は undefined（穴はそのまま）。
 * なげなわの移動・回転は外周の座標しか持たないため、確定時に外周の動きから変換を求めて穴を追従させる
 */
export const followHolesToRigidRingTransform = (
  original: Position[],
  moved: Position[],
  holes: Position[][]
): Position[][] | undefined => {
  const n = original.length;
  if (n === 0 || n !== moved.length || holes.length === 0) return undefined;
  const mean = (ps: Position[]) => [
    ps.reduce((s, p) => s + p[0], 0) / ps.length,
    ps.reduce((s, p) => s + p[1], 0) / ps.length,
  ];
  const [ox, oy] = mean(original);
  const [mx, my] = mean(moved);
  //2次元の最小二乗の回転角（Procrustes）
  let dot = 0;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    const ax = original[i][0] - ox;
    const ay = original[i][1] - oy;
    const bx = moved[i][0] - mx;
    const by = moved[i][1] - my;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  }
  const angle = dot === 0 && cross === 0 ? 0 : Math.atan2(cross, dot);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const apply = (p: Position): Position => {
    const vx = p[0] - ox;
    const vy = p[1] - oy;
    return [mx + vx * cos - vy * sin, my + vx * sin + vy * cos];
  };
  let isMoved = false;
  for (let i = 0; i < n; i++) {
    const [x, y] = apply(original[i]);
    if (Math.hypot(x - moved[i][0], y - moved[i][1]) > RIGID_TOLERANCE_PX) return undefined;
    if (Math.hypot(original[i][0] - moved[i][0], original[i][1] - moved[i][1]) > 0) isMoved = true;
  }
  if (!isMoved) return undefined;
  return holes.map((hole) => hole.map(apply));
};
