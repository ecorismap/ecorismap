/**
 * 3D地形エンジン用の最小限の4x4行列ユーティリティ（列優先）。
 * three.js非依存で実装するための自前実装。jestでテスト可能。
 */

export type Mat4 = Float32Array;

export const mat4Identity = (): Mat4 => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

/** 透視投影行列（右手系、NDC z: -1..1） */
export const mat4Perspective = (fovYRad: number, aspect: number, near: number, far: number): Mat4 => {
  const f = 1 / Math.tan(fovYRad / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
};

/** 視点行列（右手系）。eyeからtargetを見る。upは正規化不要 */
export const mat4LookAt = (
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number]
): Mat4 => {
  // z軸 = eye - target（視線の逆向き）
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz);
  if (len === 0) zz = 1;
  else {
    zx /= len;
    zy /= len;
    zz /= len;
  }
  // x軸 = up × z
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz);
  if (len === 0) {
    // upとzが平行（真上から見下ろす等）。zに直交する適当な軸を選ぶ
    xx = 1;
    xy = 0;
    xz = 0;
  } else {
    xx /= len;
    xy /= len;
    xz /= len;
  }
  // y軸 = z × x
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = yx;
  m[2] = zx;
  m[3] = 0;
  m[4] = xy;
  m[5] = yy;
  m[6] = zy;
  m[7] = 0;
  m[8] = xz;
  m[9] = yz;
  m[10] = zz;
  m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
};

/** out = a * b */
export const mat4Multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] + a[4 + row] * b[col * 4 + 1] + a[8 + row] * b[col * 4 + 2] + a[12 + row] * b[col * 4 + 3];
    }
  }
  return out;
};

/** v' = m * (v,1)。同次除算込み */
export const mat4TransformPoint = (m: Mat4, v: [number, number, number]): [number, number, number] => {
  const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
  const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
  const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
  const w = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
  return w !== 0 ? [x / w, y / w, z / w] : [x, y, z];
};

/**
 * orbitカメラの視点位置を計算する。
 * @param target 注視点（ローカル座標、y=標高）
 * @param distance 注視点からの距離
 * @param headingDeg 方位角[度]（0=北を見る=カメラは南側）
 * @param pitchDeg 俯角[度]（0=真上から、90=水平）
 */
export const orbitEye = (
  target: [number, number, number],
  distance: number,
  headingDeg: number,
  pitchDeg: number
): [number, number, number] => {
  const h = (headingDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  const horizontal = distance * Math.sin(p);
  const vertical = distance * Math.cos(p);
  // ローカル座標: x=東, z=南。heading=0のときカメラは南(+z)側から北を見る
  return [target[0] - Math.sin(h) * horizontal, target[1] + vertical, target[2] + Math.cos(h) * horizontal];
};

/** カメラの上方向ベクトル（pitch=0の真俯瞰でも破綻しないようheadingから導出） */
export const orbitUp = (headingDeg: number, pitchDeg: number): [number, number, number] => {
  const h = (headingDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  // 画面上方向 = 視線を上に90度回した向き。水平成分は北向き(heading方向)、垂直成分はsin(p)
  return [Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)];
};

export const normalize3 = (v: [number, number, number]): [number, number, number] => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};

export const cross3 = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * 視線の正規直交基底（カメラ位置＋forward/right/upv）。
 * mat4LookAtと同じ軸の取り方なので、この基底で作ったレイは
 * 同じeye/target/upから作った行列の投影と厳密に対応する
 */
export interface RayBasis {
  eye: [number, number, number];
  forward: [number, number, number];
  right: [number, number, number];
  upv: [number, number, number];
}

export const rayBasisFromCamera = (
  eye: [number, number, number],
  target: [number, number, number],
  up: [number, number, number]
): RayBasis => {
  const forward = normalize3([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = normalize3(cross3(forward, up));
  const upv = cross3(right, forward);
  return { eye, forward, right, upv };
};

/**
 * NDC位置へ向かうレイ方向（非正規化・forward成分がちょうど1）。
 * right/upvはforwardと直交なので、このベクトルに「視線前方軸への射影深度
 * （透視投影のclip.w）」を掛けるとその画素のワールド点に正確に届く。
 * 正規化してしまうと軸深度にcosθ補正（1/dot(dir,forward)）が必要になる
 */
export const rayDirForNdc = (
  basis: RayBasis,
  ndcX: number,
  ndcY: number,
  tanHalfFovY: number,
  aspect: number
): [number, number, number] => {
  const { forward, right, upv } = basis;
  return [
    forward[0] + tanHalfFovY * (ndcX * aspect * right[0] + ndcY * upv[0]),
    forward[1] + tanHalfFovY * (ndcX * aspect * right[1] + ndcY * upv[1]),
    forward[2] + tanHalfFovY * (ndcX * aspect * right[2] + ndcY * upv[2]),
  ];
};

/**
 * スクリーン位置（NDC）と軸方向深度（clip.w = -z_view）からワールド点を復元する。
 * 距離バッファに入っているのは「レイに沿ったユークリッド距離」ではなく
 * この軸深度なので、復元は必ずこの関数を通すこと
 */
export const pointAtAxisDepth = (
  basis: RayBasis,
  ndcX: number,
  ndcY: number,
  tanHalfFovY: number,
  aspect: number,
  axisDepth: number
): [number, number, number] => {
  const dir = rayDirForNdc(basis, ndcX, ndcY, tanHalfFovY, aspect);
  return [basis.eye[0] + dir[0] * axisDepth, basis.eye[1] + dir[1] * axisDepth, basis.eye[2] + dir[2] * axisDepth];
};
