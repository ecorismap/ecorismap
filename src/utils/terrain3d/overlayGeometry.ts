/**
 * レイヤデータ（ライン・ポリゴン）を地形にドレープするジオメトリ生成。
 *
 * ラインは進行方向に直交する帯（リボン）として三角形化し、
 * ポリゴンはearcutで三角形分割する。各頂点の高さは表示中タイルの
 * 標高グリッドからサンプリングし、地形にわずかに浮かせてz-fightingを避ける。
 * GPU非依存の純関数（jestでテスト可能）。
 */
import earcut from 'earcut';
import { LocationType } from '../../types';
import { Rgba } from './colorUtils';
import { lonLatToMercator, MercatorPoint } from './coords';

export interface OverlayGeometryData {
  /** ローカル座標(x=東,y=標高,z=南) */
  positions: Float32Array;
  indices: Uint32Array;
}

/** 全地物をまとめた1本のバッファ（色は頂点属性） */
export interface OverlayBatchData {
  positions: Float32Array;
  /** 頂点色 RGBA8（シェーダ側で正規化して読む） */
  colors: Uint8Array;
  indices: Uint32Array;
}

/**
 * 複数の地物ジオメトリを1本のバッファへ連結する。
 *
 * 1地物1ドローコールだと最大200件＋輪郭でフレーム毎のGL命令が跳ね上がるため、
 * 色を頂点属性に落として1ドローコールにまとめる。
 * 構築は時間スライスで進むので、追加と確定を分けられるようクラスにしてある。
 */
export class OverlayBatchBuilder {
  private positions: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];
  private vertexCount = 0;

  add(geometry: OverlayGeometryData, color: Rgba): void {
    const base = this.vertexCount;
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    const a = Math.round(color[3] * 255);
    for (let i = 0; i < geometry.positions.length; i++) this.positions.push(geometry.positions[i]);
    for (let i = 0; i < geometry.positions.length / 3; i++) this.colors.push(r, g, b, a);
    for (let i = 0; i < geometry.indices.length; i++) this.indices.push(base + geometry.indices[i]);
    this.vertexCount += geometry.positions.length / 3;
  }

  get isEmpty(): boolean {
    return this.indices.length === 0;
  }

  build(): OverlayBatchData | null {
    if (this.indices.length === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      colors: new Uint8Array(this.colors),
      indices: new Uint32Array(this.indices),
    };
  }
}

export type ElevationSampler = (latitude: number, longitude: number) => number | null;

/** ドレープ時に地形から浮かせる高さ[m]（exaggeration適用前） */
const LIFT_METERS = 3;
/** ラインの長い区間はこの長さ[m]以下になるよう分割して地形に沿わせる */
const MAX_SEGMENT_METERS = 150;

interface LocalPoint {
  x: number;
  z: number;
  y: number;
}

const toLocal = (
  location: LocationType,
  origin: MercatorPoint,
  elevScale: number,
  sampleElev: ElevationSampler
): LocalPoint => {
  const merc = lonLatToMercator(location.longitude, location.latitude);
  const elev = sampleElev(location.latitude, location.longitude) ?? 0;
  return {
    x: merc.mx - origin.mx,
    z: origin.my - merc.my,
    y: (elev + LIFT_METERS) * elevScale,
  };
};

/** 長い区間を分割して地形に沿わせた緯度経度列を返す */
const densify = (path: LocationType[], origin: MercatorPoint): LocationType[] => {
  const result: LocationType[] = [];
  for (let i = 0; i < path.length; i++) {
    const current = path[i];
    if (i > 0) {
      const prev = path[i - 1];
      const a = lonLatToMercator(prev.longitude, prev.latitude);
      const b = lonLatToMercator(current.longitude, current.latitude);
      const dist = Math.hypot(b.mx - a.mx, b.my - a.my);
      const splits = Math.min(64, Math.floor(dist / MAX_SEGMENT_METERS));
      for (let s = 1; s <= splits; s++) {
        const t = s / (splits + 1);
        result.push({
          latitude: prev.latitude + (current.latitude - prev.latitude) * t,
          longitude: prev.longitude + (current.longitude - prev.longitude) * t,
        });
      }
    }
    result.push(current);
  }
  void origin;
  return result;
};

/**
 * ラインを幅widthMeters（メルカトルm）のリボンとして三角形化する。
 * 頂点2点未満や幅0以下はnull。
 */
export const buildRibbon = (
  path: LocationType[],
  widthMeters: number,
  origin: MercatorPoint,
  elevScale: number,
  sampleElev: ElevationSampler
): OverlayGeometryData | null => {
  if (path.length < 2 || widthMeters <= 0) return null;
  const densified = densify(path, origin);
  const points = densified.map((p) => toLocal(p, origin, elevScale, sampleElev));
  const half = widthMeters / 2;
  const count = points.length;
  const positions = new Float32Array(count * 2 * 3);

  for (let i = 0; i < count; i++) {
    // 隣接区間の平均方向に直交するオフセット（簡易マイター）
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(count - 1, i + 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) {
      dx = 1;
      dz = 0;
    } else {
      dx /= len;
      dz /= len;
    }
    // 直交ベクトル
    const ox = -dz * half;
    const oz = dx * half;
    const p = points[i];
    positions[i * 6 + 0] = p.x + ox;
    positions[i * 6 + 1] = p.y;
    positions[i * 6 + 2] = p.z + oz;
    positions[i * 6 + 3] = p.x - ox;
    positions[i * 6 + 4] = p.y;
    positions[i * 6 + 5] = p.z - oz;
  }

  const indices = new Uint32Array((count - 1) * 6);
  let ptr = 0;
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices[ptr++] = a;
    indices[ptr++] = b;
    indices[ptr++] = c;
    indices[ptr++] = c;
    indices[ptr++] = b;
    indices[ptr++] = d;
  }
  return { positions, indices };
};

/**
 * ポリゴン（外周+穴）をearcutで三角形分割する。
 * 注意: 内部に頂点を追加しないため、大きなポリゴンは地形の起伏を貫通しうる（v3の既知制限）。
 */
export const buildPolygonFill = (
  coords: LocationType[],
  holes: { [key: string]: LocationType[] } | undefined,
  origin: MercatorPoint,
  elevScale: number,
  sampleElev: ElevationSampler
): OverlayGeometryData | null => {
  if (coords.length < 3) return null;
  const rings: LocationType[][] = [coords, ...(holes ? Object.values(holes).filter((h) => h.length >= 3) : [])];
  const flat: number[] = [];
  const holeIndices: number[] = [];
  const locals: LocalPoint[] = [];
  rings.forEach((ring, ringIndex) => {
    if (ringIndex > 0) holeIndices.push(locals.length);
    for (const location of ring) {
      const p = toLocal(location, origin, elevScale, sampleElev);
      locals.push(p);
      flat.push(p.x, p.z);
    }
  });
  const triangles = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2);
  if (triangles.length === 0) return null;
  const positions = new Float32Array(locals.length * 3);
  locals.forEach((p, i) => {
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  });
  return { positions, indices: new Uint32Array(triangles) };
};
