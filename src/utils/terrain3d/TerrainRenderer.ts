/**
 * WebGPUによる地形描画（iOS=Metal / Android=Vulkan）。
 *
 * 描画モデル（maplibre方式）:
 *  - ジオメトリは全タイル共有の正規化グリッド1本。標高は頂点シェーダがDEMテクスチャから読む
 *  - タイルの違いはdynamic offsetで引くuniform 1本とテクスチャのバインドだけ
 *  - レイヤはフラグメントシェーダで最大8枚を合成し、1タイル=1ドローコールにする
 *
 * 規律:
 *  - リング毎の状態差（分割数・fillBase・レイヤ不透明度）はタイルuniformへ畳み込み、
 *    パイプラインとバインドグループの切り替えをフレーム内で起こさない
 *  - タイルのテクスチャバインドグループはTileDrawPassにキャッシュする（毎フレーム生成しない）
 *  - DEMは rgba8uint で上げ、シェーダ側は整数演算でデコードする（UNORM往復の丸め誤差を持ち込まない）
 */
import { RNCanvasContext } from 'react-native-webgpu';
import { MAX_TERRAIN_LAYERS } from './constants';
import { LayerTextureRef } from './layerTextureRef';
import { Mat4 } from './matrices';
import { OverlayBatchData } from './overlayGeometry';
import { buildSharedGridMesh } from './sharedGridMesh';

/**
 * 地形シェーダ。
 *
 * 頂点属性は全タイル共有の正規化グリッド（u, v, スカートフラグ）だけで、
 * 標高はDEMテクスチャからtextureLoadして読む（頂点テクスチャフェッチ）。
 *
 * 精度: GSI方式のデコード R*65536+G*256+B は rgba8uint の整数演算で厳密に求まる。
 * f32の仮数は24bitあるので2^24-1までは誤差なく表せる。
 *
 * レイヤ合成はプリマルチプライドのsrc-overで1パス。WGSLもテクスチャを可変添字で
 * 引けないためif連鎖で選ぶ。textureSampleLevelを使うのは、if連鎖が非一様制御フローと
 * 判定されてtextureSampleが使えないため（ミップマップは使っていないので挙動は同じ）。
 */
const TERRAIN_SHADER = `
struct Frame {
  viewProj: mat4x4<f32>,
  /** xyz=フォグ色（空色）, w=フォグ開始距離 */
  fog: vec4<f32>,
  /** xyz=光源方向, w=フォグ終了距離 */
  light: vec4<f32>,
  /** xyz=ベース色, w=環境光 */
  base: vec4<f32>,
  /** x=標高スケール */
  misc: vec4<f32>,
};

struct Tile {
  /** x=タイル西端のローカルX, y=タイル北端のローカルZ, z=タイル一辺[m], w=スカート底のローカルY(スケール済み) */
  tileParams: vec4<f32>,
  /** xy=DEM画素内のタイル原点, z=タイルが占める画素幅, w=エンコード(0=GSI, 1=terrarium) */
  demParams: vec4<f32>,
  /** x=NoData標高[m], y=fillBase, z=メッシュ分割数, w=レイヤ数 */
  misc: vec4<f32>,
  /** レイヤ毎の不透明度（vec4×2に詰める。uniform配列のstrideが16バイトのため） */
  layerOpacity: array<vec4<f32>, 2>,
  /**
   * レイヤ毎のUV矩形 xy=オフセット, z=スケール。
   * 自前のタイル画像なら(0,0,1)、届くまでは親タイルの部分矩形を指す
   */
  layerUv: array<vec4<f32>, ${MAX_TERRAIN_LAYERS}>,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var samp: sampler;
@group(1) @binding(0) var<uniform> tile: Tile;
@group(2) @binding(0) var demTex: texture_2d<u32>;
@group(2) @binding(1) var tex0: texture_2d<f32>;
@group(2) @binding(2) var tex1: texture_2d<f32>;
@group(2) @binding(3) var tex2: texture_2d<f32>;
@group(2) @binding(4) var tex3: texture_2d<f32>;
@group(2) @binding(5) var tex4: texture_2d<f32>;
@group(2) @binding(6) var tex5: texture_2d<f32>;
@group(2) @binding(7) var tex6: texture_2d<f32>;
@group(2) @binding(8) var tex7: texture_2d<f32>;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) viewDepth: f32,
};

fn decodeElev(px: vec2<f32>) -> f32 {
  let dim = vec2<i32>(textureDimensions(demTex));
  let p = clamp(vec2<i32>(px + 0.5), vec2<i32>(0), dim - vec2<i32>(1));
  let t = textureLoad(demTex, p, 0);
  if (tile.demParams.w > 0.5) {
    // terrarium: 海洋のバスメトリ（負値）は海面0mへクランプ
    return max(f32(t.r) * 256.0 + f32(t.g) + f32(t.b) / 256.0 - 32768.0, 0.0);
  }
  let x = t.r * 65536u + t.g * 256u + t.b;
  // NoData（内陸の欠測・海域）はタイル最低標高へ丸める
  if (x == 8388608u) { return tile.misc.x; }
  if (x < 8388608u) { return f32(x) * 0.01; }
  return (f32(x) - 16777216.0) * 0.01;
}

@vertex
fn vs(@location(0) grid: vec3<f32>) -> VSOut {
  let spanPx = tile.demParams.z;
  let tileSize = tile.tileParams.z;
  let px = tile.demParams.xy + grid.xy * spanPx;
  let h = decodeElev(px);

  // 法線: ハイトフィールドの中央差分 n = normalize(-dh/dx, 1, -dh/dz)。
  // 標高はスケール済みで比較する（exaggerationを反映した見た目の陰影に合わせる）
  let segments = tile.misc.z;
  let stepPx = spanPx / segments;
  let stepM = tileSize / segments;
  let hl = decodeElev(px - vec2<f32>(stepPx, 0.0));
  let hr = decodeElev(px + vec2<f32>(stepPx, 0.0));
  let hu = decodeElev(px - vec2<f32>(0.0, stepPx));
  let hd = decodeElev(px + vec2<f32>(0.0, stepPx));
  let inv = frame.misc.x / (2.0 * stepM);

  // スカート頂点(grid.z=1)はタイル共通の底へ落とす（頂点毎に垂らすと遠景で壁が林立する）
  let y = select(h * frame.misc.x, tile.tileParams.w, grid.z > 0.5);
  let pos = vec3<f32>(tile.tileParams.x + grid.x * tileSize, y, tile.tileParams.y + grid.y * tileSize);
  let clip = frame.viewProj * vec4<f32>(pos, 1.0);

  var out: VSOut;
  out.position = clip;
  out.uv = grid.xy;
  out.normal = normalize(vec3<f32>(-(hr - hl) * inv, 1.0, -(hd - hu) * inv));
  out.viewDepth = clip.w;
  return out;
}

fn layerTexel(i: i32, uv: vec2<f32>) -> vec4<f32> {
  if (i == 0) { return textureSampleLevel(tex0, samp, uv, 0.0); }
  if (i == 1) { return textureSampleLevel(tex1, samp, uv, 0.0); }
  if (i == 2) { return textureSampleLevel(tex2, samp, uv, 0.0); }
  if (i == 3) { return textureSampleLevel(tex3, samp, uv, 0.0); }
  if (i == 4) { return textureSampleLevel(tex4, samp, uv, 0.0); }
  if (i == 5) { return textureSampleLevel(tex5, samp, uv, 0.0); }
  if (i == 6) { return textureSampleLevel(tex6, samp, uv, 0.0); }
  return textureSampleLevel(tex7, samp, uv, 0.0);
}

fn layerAlpha(i: i32) -> f32 {
  return tile.layerOpacity[i / 4][i % 4];
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  var acc = vec3<f32>(0.0);
  var accA = 0.0;
  let layerCount = i32(tile.misc.w);
  for (var i = 0; i < ${MAX_TERRAIN_LAYERS}; i++) {
    if (i >= layerCount) { break; }
    // 自前のタイル画像なら等倍、届くまでは親タイルの部分矩形を引く。
    // 矩形の外側へ滲むのは隣のタイルの絵そのものなので、継ぎ目は出ない
    let rect = tile.layerUv[i];
    let t = layerTexel(i, rect.xy + in.uv * rect.z);
    let a = t.a * layerAlpha(i);
    acc = t.rgb * a + acc * (1.0 - a);
    accA = a + accA * (1.0 - a);
  }
  let fillBase = tile.misc.y;
  let alpha = accA + (1.0 - accA) * fillBase;
  let rgb = acc + frame.base.rgb * (1.0 - accA) * fillBase;
  let diffuse = max(dot(normalize(in.normal), frame.light.xyz), 0.0);
  let lit = rgb * (frame.base.w + (1.0 - frame.base.w) * diffuse);
  let fog = smoothstep(frame.fog.w, frame.light.w, in.viewDepth);
  return vec4<f32>(mix(lit, frame.fog.rgb * alpha, fog), alpha);
}

/**
 * 遮蔽判定用: 軸方向深度（clip.w = カメラ前方軸への射影距離）をRGB 24bitへ詰めて書き出す。
 *
 * ドットはキャンバスの外側（Reactのビュー）に重ねるので深度テストが効かない。
 * GPUが実際に描いた地形までの深度を読み戻し、点までの深度と比べて判定する
 * （JS側に地形の複製を持たないので、両者が食い違いようがない）。
 * NDC深度ではなく軸深度を書くのは、リング毎の深度レンジ分割に左右されず、
 * 許容差をメートルで考えられるため。
 * 注意: これは「レイに沿ったユークリッド距離」ではない。ワールド点の復元は
 * pointAtAxisDepth（matrices.ts）を通すこと（正規化レイに掛けると画面端で15%ずれる）
 */
@fragment
fn fs_depth(in: VSOut) -> @location(0) vec4<f32> {
  if (frame.misc.y <= 0.0) { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
  let d = clamp(in.viewDepth / frame.misc.y, 0.0, 1.0);
  let v = floor(d * 16777215.0);
  let r = floor(v / 65536.0);
  let g = floor((v - r * 65536.0) / 256.0);
  let b = v - r * 65536.0 - g * 256.0;
  return vec4<f32>(r / 255.0, g / 255.0, b / 255.0, 1.0);
}
`;

/**
 * オーバーレイ（ドレープしたライン・ポリゴン）用シェーダ。
 * 色は頂点属性にして全地物を1ドローコールで描く
 */
const OVERLAY_SHADER = `
struct Frame {
  viewProj: mat4x4<f32>,
  fog: vec4<f32>,
  light: vec4<f32>,
  base: vec4<f32>,
  misc: vec4<f32>,
};
@group(0) @binding(0) var<uniform> frame: Frame;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
  @location(1) viewDepth: f32,
};

@vertex
fn vs(@location(0) pos: vec3<f32>, @location(1) color: vec4<f32>) -> VSOut {
  let clip = frame.viewProj * vec4<f32>(pos, 1.0);
  var out: VSOut;
  out.position = clip;
  out.color = color;
  out.viewDepth = clip.w;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let fog = smoothstep(frame.fog.w, frame.light.w, in.viewDepth);
  return vec4<f32>(mix(in.color.rgb, frame.fog.rgb, fog), in.color.a * (1.0 - fog * 0.5));
}
`;

/** フレーム共通の描画パラメータ（表示描画と遮蔽判定パスで共有する） */
export interface TerrainFrameOptions {
  skyColor: [number, number, number];
  fogNear: number;
  fogFar: number;
  lightDir: [number, number, number];
  ambient: number;
  elevScale: number;
}

/**
 * 遮蔽判定用に読み戻した「カメラから地形までの軸方向深度（clip.w）」。
 * 値はメルカトルm。画面は縮小解像度なので、screen(dp)→格子は widthDp/width で割る
 */
export interface TerrainDepthMap {
  /** 各画素の軸方向深度[メルカトルm]（レイに沿った距離ではない）。地形が無い画素はInfinity */
  distances: Float32Array;
  width: number;
  height: number;
}

export interface TileGpuResources {
  buffers: GPUBuffer[];
  vertexBuffer: GPUBuffer;
  /** オーバーレイのみ（頂点色） */
  colorBuffer: GPUBuffer | null;
  indexBuffer: GPUBuffer;
  indexCount: number;
}

/** 1タイル＝1ドローコール分の描画データ */
export interface TileDrawPass {
  /** uTileParams: [originX, originZ, tileSize, skirtDrop] */
  tileParams: Float32Array;
  /** uDemParams: [demPx, demPy, spanPx, encoding] */
  demParams: Float32Array;
  /** NoData画素に与える標高[m]（タイル範囲の最低標高。旧実装のNoData→minElev丸めと同じ） */
  noDataElev: number;
  /** DEM標高テクスチャ（データなしのタイルは0mのゼロテクスチャ） */
  demTexture: GPUTexture;
  /** レイヤスロット（未取得・範囲外はnull→透明ダミーを割り当てる） */
  layerTextures: (LayerTextureRef | null)[];
  /**
   * レイヤ毎のUV矩形（8スロット×[offsetU, offsetV, scale, 予備]）。
   * 自前のテクスチャなら等倍(0,0,1)、親タイルを借りている間はその部分矩形
   */
  layerUv: Float32Array;
  /**
   * layerTexturesがこのタイル自身のズームで取得したものか。
   * 借り物（親タイル）は又貸しできない（孫のUV計算が親のズーム前提で狂うため）
   */
  ownTextures: boolean;
  /** 1枚でもレイヤテクスチャを持っているか（遠景の上に重ねる際のスキップ判定） */
  hasTexture: boolean;
  /** テクスチャのバインドグループ（レンダラーが遅延生成してここへ持たせる） */
  bindGroup?: GPUBindGroup;
}

/** リング単位の描画設定 */
export interface RingDrawOptions {
  /** このリングで使うメッシュ分割数（遠景ほど粗くして頂点数を抑える） */
  segments: number;
  /** テクスチャの透明部をベース色で埋めて不透明にするか（最背面のリングはtrue） */
  fillBase: boolean;
  /** レイヤスロット数（全タイル共通） */
  layerCount: number;
  /** レイヤ毎の不透明度（長さ8。未使用スロットは0） */
  layerOpacity: Float32Array;
}

export interface TerrainRingDraw extends RingDrawOptions {
  tiles: TileDrawPass[];
}

/**
 * 地形の想定標高範囲[m]（視錐台カリング用のバウンディングボックス）。
 * 実際の標高はGPU側にしか無いので、日本の陸域を包む固定範囲で近似する
 */
const CULL_MIN_ELEV = -500;
const CULL_MAX_ELEV = 4000;

/**
 * 使用フラグ定数。
 *
 * react-native-webgpuはネイティブ初期化時にこれらをグローバルへ設置するが、
 * パッケージからimportするとモジュールの評価順によってundefinedになることがある
 * （実測でそうなった）。参照はグローバルから取り、値はW3C仕様で固定なのでフォールバックも持つ。
 */
const gpuFlags = () => {
  const g = globalThis as unknown as {
    GPUBufferUsage?: Record<string, number>;
    GPUTextureUsage?: Record<string, number>;
    GPUShaderStage?: Record<string, number>;
  };
  return {
    // フォールバック値はW3C仕様のビット定義（importがモジュール評価順でundefinedになるため）
    buffer: g.GPUBufferUsage ?? {
      MAP_READ: 0x01,
      COPY_SRC: 0x04,
      COPY_DST: 0x08,
      INDEX: 0x10,
      VERTEX: 0x20,
      UNIFORM: 0x40,
    },
    texture: g.GPUTextureUsage ?? { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 },
    shader: g.GPUShaderStage ?? { VERTEX: 0x1, FRAGMENT: 0x2 },
  };
};

/**
 * リング数ごとの深度レンジ割り当て（描画順＝外側リングから内側・近景へ）。
 *
 * 内側のリングほど手前のレンジを占めるので、深度テスト（less-equal）で必ず内側が勝つ。
 * リング毎に深度をクリアし直すのと同じ分離を、1レンダーパスのまま実現するためのもの
 */
/**
 * 遮蔽判定パスのクリア色をパックした値。
 * この値のままの画素は「地形が描かれていない＝遮るものが無い」とみなす
 */
const DEPTH_CLEAR_PACKED = 0;

const DEPTH_RANGES: [number, number][][] = [
  [[0, 1]],
  [
    [0.5, 1],
    [0, 0.5],
  ],
  [
    [0.75, 1],
    [0.5, 0.75],
    [0, 0.5],
  ],
];

/** タイルuniform内でレイヤ毎のUV矩形が始まるfloat位置（vec4×3＋不透明度vec4×2の後ろ） */
const TILE_LAYER_UV_OFFSET = 20;
/**
 * タイルuniform1件分のfloat数（vec4×3＋不透明度vec4×2＋レイヤUV矩形vec4×8）。
 *
 * dynamic offsetのアライメント（多くの環境で256バイト）でストライドが切り上がるため、
 * 52float=208バイトまでは足してもバッファ量・転送量とも変わらない
 */
const TILE_UNIFORM_FLOATS = TILE_LAYER_UV_OFFSET + MAX_TERRAIN_LAYERS * 4;
/** 同時に描けるタイル数の上限（uniformバッファの確保数。近景＋遠景リングの合計に余裕を見る） */
const MAX_TILE_UNIFORMS = 256;
/** フレーム共通uniformのfloat数（mat4＋vec4×4） */
const FRAME_UNIFORM_FLOATS = 32;

/**
 * viewProjから視錐台の6平面を取り出す（Gribb-Hartmann法）。
 * 各平面は [a,b,c,d]（a*x+b*y+c*z+d>=0 が内側）。毎フレーム呼ぶので配列は使い回す
 */
const extractFrustumPlanes = (m: Mat4, out: Float32Array): void => {
  // 列優先(mat4Multiplyの出力)なので m[col*4+row]
  const set = (i: number, a: number, b: number, c: number, d: number) => {
    const len = Math.hypot(a, b, c) || 1;
    out[i * 4] = a / len;
    out[i * 4 + 1] = b / len;
    out[i * 4 + 2] = c / len;
    out[i * 4 + 3] = d / len;
  };
  set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]); // left
  set(1, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]); // right
  set(2, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]); // bottom
  set(3, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]); // top
  set(4, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]); // near
  set(5, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]); // far
};

/**
 * タイルのAABBが視錐台の外にあるか（各平面の「最も内側寄りの頂点」だけで判定）。
 * 下端はスカート底まで、上端は固定の想定上限で近似する
 */
const isTileCulled = (planes: Float32Array, tileParams: Float32Array, elevScale: number): boolean => {
  const x0 = tileParams[0];
  const z0 = tileParams[1];
  const size = tileParams[2];
  const x1 = x0 + size;
  const z1 = z0 + size;
  const y0 = Math.min(CULL_MIN_ELEV * elevScale, tileParams[3]);
  const y1 = CULL_MAX_ELEV * elevScale;
  for (let i = 0; i < 6; i++) {
    const a = planes[i * 4];
    const b = planes[i * 4 + 1];
    const c = planes[i * 4 + 2];
    const d = planes[i * 4 + 3];
    // 平面の法線側にある角（positive vertex）が外なら、AABB全体が外
    const px = a >= 0 ? x1 : x0;
    const py = b >= 0 ? y1 : y0;
    const pz = c >= 0 ? z1 : z0;
    if (a * px + b * py + c * pz + d < 0) return true;
  }
  return false;
};

export class TerrainRenderer {
  private device: GPUDevice;
  private context: RNCanvasContext;
  private pipeline: GPURenderPipeline;
  private overlayPipeline: GPURenderPipeline;
  private frameLayout: GPUBindGroupLayout;
  private tileLayout: GPUBindGroupLayout;
  private textureLayout: GPUBindGroupLayout;
  private frameBuffer: GPUBuffer;
  private frameBindGroup: GPUBindGroup;
  private tileBuffer: GPUBuffer;
  private tileBindGroup: GPUBindGroup;
  /** タイルuniformのdynamic offset単位（デバイスのアラインメント制約に合わせる） */
  private tileStride: number;
  /** フレーム共通uniformの転送バッファ（使い回す） */
  private frameData = new Float32Array(FRAME_UNIFORM_FLOATS);
  /** タイルuniformの転送バッファ（フレーム冒頭に一括で書き込む） */
  private tileData: Float32Array;
  private depthTexture: GPUTexture | null = null;
  private depthSize: [number, number] = [0, 0];
  /** 遮蔽判定用の距離バッファ（縮小解像度。rgba8に24bitで詰める） */
  private occPipeline: GPURenderPipeline | null = null;
  private occColor: GPUTexture | null = null;
  private occDepth: GPUTexture | null = null;
  private occReadBuffer: GPUBuffer | null = null;
  private occSize: [number, number] = [0, 0];
  private occBytesPerRow = 0;
  /** 読み戻し中は次の要求を受けない（mapAsync中のバッファは触れない） */
  private occBusy = false;
  /** 全タイル共有のグリッドメッシュ（分割数ごとに1本だけ作って使い回す） */
  private gridResources = new Map<number, TileGpuResources>();
  /** データなしDEM用の1x1テクスチャ（GSI方式でRGB(0,0,0)=0m） */
  private zeroDemTexture: GPUTexture;
  /** 未取得レイヤ用の1x1透明テクスチャ */
  private emptyLayerTexture: GPUTexture;
  /** 開発時の計測用: 直近フレームで実際に発行したタイルのドローコール数 */
  lastTileDrawCount = 0;
  /** 開発時の計測用: 直近フレームのsubmit＋present（＝GPU待ち）に要した時間[ms] */
  lastPresentMs = 0;
  /** 開発時の診断用: 距離バッファのうち地形が描かれた画素の割合 */
  lastDepthFillRatio = 0;
  /** 開発時の診断用: 距離バッファの取得回数と、直近で描いたタイル数 */
  depthCaptureCount = 0;
  lastDepthTileCount = 0;
  /** 開発時の診断用: 距離バッファ描画時のWebGPU検証エラー */
  lastDepthError = '';
  /** 視錐台カリング用の平面バッファ（毎フレーム使い回す） */
  private frustumPlanes = new Float32Array(24);
  private flags = gpuFlags();

  constructor(device: GPUDevice, context: RNCanvasContext, presentationFormat: GPUTextureFormat) {
    this.device = device;
    this.context = context;
    const flags = this.flags;

    this.frameLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: flags.shader.VERTEX | flags.shader.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: flags.shader.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this.tileLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: flags.shader.VERTEX | flags.shader.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
      ],
    });
    const textureEntries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: flags.shader.VERTEX, texture: { sampleType: 'uint' } },
    ];
    for (let i = 0; i < MAX_TERRAIN_LAYERS; i++) {
      textureEntries.push({ binding: i + 1, visibility: flags.shader.FRAGMENT, texture: { sampleType: 'float' } });
    }
    this.textureLayout = device.createBindGroupLayout({ entries: textureEntries });

    const terrainModule = device.createShaderModule({ code: TERRAIN_SHADER });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.frameLayout, this.tileLayout, this.textureLayout],
      }),
      vertex: {
        module: terrainModule,
        entryPoint: 'vs',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      fragment: {
        module: terrainModule,
        entryPoint: 'fs',
        targets: [
          {
            format: presentationFormat,
            // 地形の出力はプリマルチプライド（フラグメントシェーダ参照）
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less-equal', format: 'depth24plus' },
    });

    const overlayModule = device.createShaderModule({ code: OVERLAY_SHADER });
    this.overlayPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.frameLayout] }),
      vertex: {
        module: overlayModule,
        entryPoint: 'vs',
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          { arrayStride: 4, attributes: [{ shaderLocation: 1, offset: 0, format: 'unorm8x4' }] },
        ],
      },
      fragment: {
        module: overlayModule,
        entryPoint: 'fs',
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      // わずかに浮かせてあるが、遠距離では深度精度でめり込むためバイアスも併用
      // （旧実装の polygonOffset(-4, -4) 相当）
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
        depthBias: -4,
        depthBiasSlopeScale: -4,
      },
    });

    this.frameBuffer = device.createBuffer({
      size: FRAME_UNIFORM_FLOATS * 4,
      usage: this.flags.buffer.UNIFORM | this.flags.buffer.COPY_DST,
    });
    this.frameBindGroup = device.createBindGroup({
      layout: this.frameLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        {
          binding: 1,
          resource: device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
          }),
        },
      ],
    });

    const alignment = device.limits.minUniformBufferOffsetAlignment || 256;
    this.tileStride = Math.ceil((TILE_UNIFORM_FLOATS * 4) / alignment) * alignment;
    this.tileData = new Float32Array((this.tileStride / 4) * MAX_TILE_UNIFORMS);
    this.tileBuffer = device.createBuffer({
      size: this.tileStride * MAX_TILE_UNIFORMS,
      usage: this.flags.buffer.UNIFORM | this.flags.buffer.COPY_DST,
    });
    this.tileBindGroup = device.createBindGroup({
      layout: this.tileLayout,
      entries: [{ binding: 0, resource: { buffer: this.tileBuffer, size: TILE_UNIFORM_FLOATS * 4 } }],
    });

    this.zeroDemTexture = this.createSolidTexture(new Uint8Array([0, 0, 0, 255]), 'rgba8uint');
    this.emptyLayerTexture = this.createSolidTexture(new Uint8Array([0, 0, 0, 0]), 'rgba8unorm');
  }

  /** データなしDEM用のゼロテクスチャ（標高0mとして描く） */
  get zeroDem(): GPUTexture {
    return this.zeroDemTexture;
  }

  /** 描画先のサイズが変わったら深度テクスチャを作り直す */
  private ensureDepthTexture(width: number, height: number): GPUTexture {
    if (this.depthTexture !== null && this.depthSize[0] === width && this.depthSize[1] === height) {
      return this.depthTexture;
    }
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus',
      usage: this.flags.texture.RENDER_ATTACHMENT,
    });
    this.depthSize = [width, height];
    return this.depthTexture;
  }

  /** 指定分割数の共有グリッドメッシュ（初回だけ生成して以後は使い回す） */
  private sharedGrid(segments: number): TileGpuResources {
    const cached = this.gridResources.get(segments);
    if (cached !== undefined) return cached;
    const mesh = buildSharedGridMesh(segments);
    const vertexBuffer = this.createBufferFrom(mesh.grid, this.flags.buffer.VERTEX);
    const indexBuffer = this.createBufferFrom(mesh.indices, this.flags.buffer.INDEX);
    const created: TileGpuResources = {
      buffers: [vertexBuffer, indexBuffer],
      vertexBuffer,
      colorBuffer: null,
      indexBuffer,
      indexCount: mesh.indices.length,
    };
    this.gridResources.set(segments, created);
    return created;
  }

  /** TypedArrayからGPUバッファを作る（WebGPUの4バイト境界に合わせて切り上げる） */
  private createBufferFrom(data: Float32Array | Uint16Array | Uint32Array | Uint8Array, usage: number): GPUBuffer {
    const buffer = this.device.createBuffer({
      size: Math.ceil(data.byteLength / 4) * 4,
      usage: usage | this.flags.buffer.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  private createSolidTexture(rgba: Uint8Array, format: GPUTextureFormat): GPUTexture {
    const texture = this.device.createTexture({
      size: [1, 1],
      format,
      usage: this.flags.texture.TEXTURE_BINDING | this.flags.texture.COPY_DST,
    });
    this.device.queue.writeTexture({ texture }, rgba, { bytesPerRow: 4 }, [1, 1]);
    return texture;
  }

  /** オーバーレイの連結バッチ（座標＋頂点色）をGPUへアップロードする */
  createOverlayResources(data: OverlayBatchData): TileGpuResources {
    const vertexBuffer = this.createBufferFrom(data.positions, this.flags.buffer.VERTEX);
    const colorBuffer = this.createBufferFrom(data.colors, this.flags.buffer.VERTEX);
    const indexBuffer = this.createBufferFrom(data.indices, this.flags.buffer.INDEX);
    return {
      buffers: [vertexBuffer, colorBuffer, indexBuffer],
      vertexBuffer,
      colorBuffer,
      indexBuffer,
      indexCount: data.indices.length,
    };
  }

  deleteTileResources(resources: TileGpuResources): void {
    resources.buffers.forEach((b) => b.destroy());
  }

  /**
   * デコード済み画像をテクスチャ化する（PNG/JPEG/拡張子なしはImageBitmap経由）。
   */
  createTextureFromImageBitmap(bitmap: ImageBitmap): GPUTexture {
    const texture = this.device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      usage: this.flags.texture.TEXTURE_BINDING | this.flags.texture.COPY_DST | this.flags.texture.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
    return texture;
  }

  /**
   * 標高タイルをテクスチャ化する。
   *
   * 値は「色」ではなくRGBに詰めた数値なので、rgba8uintで上げてシェーダ側は整数のまま扱う
   * （UNORM正規化の往復や補間でエンコード値が壊れるのを避ける）。
   */
  createDemTexture(data: Uint8Array, width: number, height: number): GPUTexture {
    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8uint',
      usage: this.flags.texture.TEXTURE_BINDING | this.flags.texture.COPY_DST,
    });
    this.device.queue.writeTexture({ texture }, data, { bytesPerRow: width * 4 }, [width, height]);
    return texture;
  }

  createTextureFromRgba(data: Uint8Array, width: number, height: number): GPUTexture {
    const texture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: this.flags.texture.TEXTURE_BINDING | this.flags.texture.COPY_DST,
    });
    this.device.queue.writeTexture({ texture }, data, { bytesPerRow: width * 4 }, [width, height]);
    return texture;
  }

  deleteTexture(texture: GPUTexture): void {
    texture.destroy();
  }

  /** タイルのテクスチャバインドグループ（テクスチャ差し替え時はpass毎作り直される） */
  private tileBindGroupFor(tile: TileDrawPass): GPUBindGroup {
    if (tile.bindGroup !== undefined) return tile.bindGroup;
    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: tile.demTexture.createView() }];
    for (let i = 0; i < MAX_TERRAIN_LAYERS; i++) {
      const texture = tile.layerTextures[i]?.texture ?? this.emptyLayerTexture;
      entries.push({ binding: i + 1, resource: texture.createView() });
    }
    const group = this.device.createBindGroup({ layout: this.textureLayout, entries });
    tile.bindGroup = group;
    return group;
  }

  /**
   * 遮蔽判定用の距離バッファを描いて読み戻す。
   *
   * 表示と同じジオメトリ・同じ深度レンジ分割で描くので、得られるのは
   * 「画面に見えている地形までの距離」そのもの。JS側に地形の複製を持たないため、
   * 判定が描画と食い違いようがない（maplibreのdepthAtPointと同じ考え方）。
   *
   * 解像度は表示の1/scale。読み戻し中の再入はnullで弾く。
   */
  async captureDepth(
    rings: TerrainRingDraw[],
    viewProj: Mat4,
    options: TerrainFrameOptions,
    depthRange: number,
    scale: number
  ): Promise<TerrainDepthMap | null> {
    if (this.occBusy || depthRange <= 0) return null;
    const device = this.device;
     
    const canvas = this.context.canvas as any;
    const width = Math.max(1, Math.floor(canvas.width / scale));
    const height = Math.max(1, Math.floor(canvas.height / scale));
    this.occBusy = true;
    try {
      this.writeFrameUniform(viewProj, options, depthRange);
      const visible = this.packVisibleTiles(rings, viewProj, options.elevScale);
      // 1枚も描けないなら比較対象にならない。撮らずに次の機会へ回す
      // （ここで空のバッファを返すと「地形なし＝遮るものなし」として固定されてしまう）
      const tileCount = visible.reduce((n, ring) => n + ring.length, 0);
      if (tileCount === 0) return null;
      const { color, depth, buffer, bytesPerRow } = this.ensureOccResources(width, height);
      // パイプラインはレンダーパスを開く前に用意する（パス中の生成は避ける）
      const pipeline = this.ensureOccPipeline();

      if (__DEV__) device.pushErrorScope('validation');
      const encoder = device.createCommandEncoder();
      const ringCount = Math.max(1, rings.length);
      const depthRanges = DEPTH_RANGES[Math.min(ringCount, DEPTH_RANGES.length) - 1];
      const pass = encoder.beginRenderPass({
        // 地形が無い画素は距離が最大（＝何にも遮られない）になるよう白でクリアする
        colorAttachments: [
          { view: color.createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' },
        ],
        depthStencilAttachment: {
          view: depth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      for (let r = 0; r < ringCount; r++) {
        const ringVisible = visible[r] ?? [];
        if (ringVisible.length === 0) continue;
        const [minDepth, maxDepth] = depthRanges[r];
        pass.setViewport(0, 0, width, height, minDepth, maxDepth);
        const grid = this.sharedGrid(rings[r].segments);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, this.frameBindGroup);
        pass.setVertexBuffer(0, grid.vertexBuffer);
        pass.setIndexBuffer(grid.indexBuffer, 'uint16');
        for (const { tile, slot } of ringVisible) {
          pass.setBindGroup(1, this.tileBindGroup, [slot * this.tileStride]);
          pass.setBindGroup(2, this.tileBindGroupFor(tile));
          pass.drawIndexed(grid.indexCount);
        }
      }
      pass.end();
      if (__DEV__) {
        this.depthCaptureCount++;
        this.lastDepthTileCount = visible.reduce((n, r) => n + r.length, 0);
      }
      encoder.copyTextureToBuffer({ texture: color }, { buffer, bytesPerRow }, { width, height });
      device.queue.submit([encoder.finish()]);
      if (__DEV__) {
        device
          .popErrorScope()
          .then((e) => {
            this.lastDepthError = e === null ? '' : String(e.message).slice(0, 60);
          })
          .catch(() => undefined);
      }

      await buffer.mapAsync(this.flags.buffer.MAP_READ);
      const src = new Uint8Array(buffer.getMappedRange());
      const distances = new Float32Array(width * height);
      // クリア色のままの画素（地形なし）と、実際に描かれた画素を区別する
      let drawn = 0;
      for (let y = 0; y < height; y++) {
        const row = y * bytesPerRow;
        for (let x = 0; x < width; x++) {
          const i = row + x * 4;
          const packed = src[i] * 65536 + src[i + 1] * 256 + src[i + 2];
          if (packed !== DEPTH_CLEAR_PACKED) drawn++;
          distances[y * width + x] =
            packed === DEPTH_CLEAR_PACKED ? Infinity : (packed / 16777215) * depthRange;
        }
      }
      buffer.unmap();
      if (__DEV__) this.lastDepthFillRatio = drawn / distances.length;
      const finite = drawn;
      // 1画素も地形が入っていないバッファは使い物にならない。
      // これを採用すると「地形なし」で固定され、遮蔽も配置補正も効かなくなる
      if (finite === 0) return null;
      return { distances, width, height };
    } catch {
      return null;
    } finally {
      this.occBusy = false;
    }
  }

  /** 遮蔽判定パス用のパイプライン（表示と同じ頂点シェーダ、距離を書くフラグメント） */
  private ensureOccPipeline(): GPURenderPipeline {
    if (this.occPipeline !== null) return this.occPipeline;
    const module = this.device.createShaderModule({ code: TERRAIN_SHADER });
    this.occPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.frameLayout, this.tileLayout, this.textureLayout],
      }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      // 距離をそのまま書くのでブレンドは無し
      fragment: { module, entryPoint: 'fs_depth', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less-equal', format: 'depth24plus' },
    });
    return this.occPipeline;
  }

  private ensureOccResources(
    width: number,
    height: number
  ): { color: GPUTexture; depth: GPUTexture; buffer: GPUBuffer; bytesPerRow: number } {
    if (this.occSize[0] !== width || this.occSize[1] !== height) {
      this.occColor?.destroy();
      this.occDepth?.destroy();
      this.occReadBuffer?.destroy();
      this.occColor = this.device.createTexture({
        size: [width, height],
        format: 'rgba8unorm',
        usage: this.flags.texture.RENDER_ATTACHMENT | this.flags.texture.COPY_SRC,
      });
      this.occDepth = this.device.createTexture({
        size: [width, height],
        format: 'depth24plus',
        usage: this.flags.texture.RENDER_ATTACHMENT,
      });
      // copyTextureToBufferの行ピッチは256バイト境界に揃える必要がある
      this.occBytesPerRow = Math.ceil((width * 4) / 256) * 256;
      this.occReadBuffer = this.device.createBuffer({
        size: this.occBytesPerRow * height,
        usage: this.flags.buffer.COPY_DST | this.flags.buffer.MAP_READ,
      });
      this.occSize = [width, height];
    }
    return {
      color: this.occColor!,
      depth: this.occDepth!,
      buffer: this.occReadBuffer!,
      bytesPerRow: this.occBytesPerRow,
    };
  }

  /**
   * フレーム共通uniformを書く。
   * depthRangeは遮蔽判定パスで視線距離を0..1へ正規化する除数（表示描画では使わない）
   */
  private writeFrameUniform(viewProj: Mat4, options: TerrainFrameOptions, depthRange: number): void {
    const f = this.frameData;
    f.set(viewProj, 0);
    f[16] = options.skyColor[0];
    f[17] = options.skyColor[1];
    f[18] = options.skyColor[2];
    f[19] = options.fogNear;
    f[20] = options.lightDir[0];
    f[21] = options.lightDir[1];
    f[22] = options.lightDir[2];
    f[23] = options.fogFar;
    f[24] = 0.62;
    f[25] = 0.61;
    f[26] = 0.56;
    f[27] = options.ambient;
    f[28] = options.elevScale;
    f[29] = depthRange;
    this.device.queue.writeBuffer(this.frameBuffer, 0, f);
  }

  /**
   * 視錐台カリングを通ったタイルのuniformを1本のバッファへ詰める。
   * 描画時はdynamic offsetで引く。戻り値はリング毎の描画対象
   */
  private packVisibleTiles(
    rings: TerrainRingDraw[],
    viewProj: Mat4,
    elevScale: number
  ): { tile: TileDrawPass; slot: number }[][] {
    // 画面外のタイルは描かない（頂点数がフレーム時間に直結するため効果が大きい）
    extractFrustumPlanes(viewProj, this.frustumPlanes);
    const stridePerTile = this.tileStride / 4;
    const visible: { tile: TileDrawPass; slot: number }[][] = rings.map(() => []);
    let slot = 0;
    // 近景（ringsの末尾）から先にスロットを割り当てる。
    // 手前から詰めないと、溢れたときに黙って落ちるのが必ず近景になる
    for (let r = rings.length - 1; r >= 0; r--) {
      const ring = rings[r];
      const ringVisible = visible[r];
      for (const tile of ring.tiles) {
        if (slot >= MAX_TILE_UNIFORMS) break;
        if (isTileCulled(this.frustumPlanes, tile.tileParams, elevScale)) continue;
        const base = slot * stridePerTile;
        this.tileData.set(tile.tileParams, base);
        this.tileData.set(tile.demParams, base + 4);
        this.tileData[base + 8] = tile.noDataElev;
        // 自前の画像も親タイルも無いタイルだけ、灰色地形として不透明に描く
        // （透過させると背後に何も無い起動直後に地形が消えてしまう）
        this.tileData[base + 9] = ring.fillBase || !tile.hasTexture ? 1 : 0;
        this.tileData[base + 10] = ring.segments;
        this.tileData[base + 11] = ring.layerCount;
        this.tileData.set(ring.layerOpacity, base + 12);
        this.tileData.set(tile.layerUv, base + TILE_LAYER_UV_OFFSET);
        ringVisible.push({ tile, slot });
        slot++;
      }
    }
    if (slot > 0) this.device.queue.writeBuffer(this.tileBuffer, 0, this.tileData, 0, slot * stridePerTile);
    return visible;
  }

  /**
   * 1フレーム描画。ringsは外側（粗ズーム）→内側→近景の順。
   * リング毎にレンダーパスを分けてデプスをクリアするため、リング間でメッシュの高さが
   * 食い違って（DEM解像度差）もz-fightingしない。
   */
  drawFrame(
    rings: TerrainRingDraw[],
    viewProj: Mat4,
    options: TerrainFrameOptions,
    /** ドレープオーバーレイのバッチ。先頭から順に描くので、前面に出したいものを後ろに置く */
    overlayBatches: (TileGpuResources | null)[] = []
  ): void {
    const device = this.device;
     
    const canvas = this.context.canvas as any;
    const width = Math.max(1, Math.floor(canvas.width));
    const height = Math.max(1, Math.floor(canvas.height));
    const depthView = this.ensureDepthTexture(width, height).createView();
    const colorView = this.context.getCurrentTexture().createView();

    this.writeFrameUniform(viewProj, options, 0);
    const visible = this.packVisibleTiles(rings, viewProj, options.elevScale);

    const encoder = device.createCommandEncoder();
    let tileDraws = 0;
    const ringCount = Math.max(1, rings.length);
    // リング毎に深度レンジを分ける（外側ほど奥）。リング間・近景とはDEM解像度差で
    // メッシュの高さが食い違うため深度を切り離す必要があるが、レンジで分ければ
    // 内側が必ず手前に来るので、パスを分けて深度をクリアし直さなくて済む
    // （パスを分けるとタイルGPUでフルスクリーンのload/storeがリング数ぶん往復する）
    const depthRanges = DEPTH_RANGES[Math.min(ringCount, DEPTH_RANGES.length) - 1];
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          clearValue: [options.skyColor[0], options.skyColor[1], options.skyColor[2], 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    for (let r = 0; r < ringCount; r++) {
      const ringVisible = visible[r] ?? [];
      if (ringVisible.length === 0) continue;
      const [minDepth, maxDepth] = depthRanges[r];
      pass.setViewport(0, 0, width, height, minDepth, maxDepth);
      const grid = this.sharedGrid(rings[r].segments);
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.frameBindGroup);
      pass.setVertexBuffer(0, grid.vertexBuffer);
      pass.setIndexBuffer(grid.indexBuffer, 'uint16');
      for (const { tile, slot: tileSlot } of ringVisible) {
        pass.setBindGroup(1, this.tileBindGroup, [tileSlot * this.tileStride]);
        pass.setBindGroup(2, this.tileBindGroupFor(tile));
        pass.drawIndexed(grid.indexCount);
        tileDraws++;
      }
    }
    // オーバーレイ（ドレープしたライン・ポリゴン）は近景と同じ深度レンジで、その上に描く。
    // パイプラインとフレームのバインドグループは全バッチ共通なので、設定は1回で済ませる
    const drawableBatches = overlayBatches.filter(
      (batch): batch is TileGpuResources & { colorBuffer: GPUBuffer } =>
        batch !== null && batch.indexCount > 0 && batch.colorBuffer !== null
    );
    if (drawableBatches.length > 0) {
      const [minDepth, maxDepth] = depthRanges[ringCount - 1];
      pass.setViewport(0, 0, width, height, minDepth, maxDepth);
      pass.setPipeline(this.overlayPipeline);
      pass.setBindGroup(0, this.frameBindGroup);
      for (const batch of drawableBatches) {
        pass.setVertexBuffer(0, batch.vertexBuffer);
        pass.setVertexBuffer(1, batch.colorBuffer);
        pass.setIndexBuffer(batch.indexBuffer, 'uint32');
        pass.drawIndexed(batch.indexCount);
      }
    }
    pass.end();
    // submit/presentはJSスレッドを同期でブロックする（vsync待ち＋iOSはコマンド
    // スケジュール待ち）。JS計算が重いのかGPU待ちなのかを切り分けられるよう別々に計る
    const encodeEndMs = __DEV__ ? performance.now() : 0;
    device.queue.submit([encoder.finish()]);
    this.context.present();
    if (__DEV__) {
      this.lastTileDrawCount = tileDraws;
      this.lastPresentMs = performance.now() - encodeEndMs;
    }
  }

  dispose(): void {
    this.gridResources.forEach((r) => this.deleteTileResources(r));
    this.gridResources.clear();
    this.zeroDemTexture.destroy();
    this.emptyLayerTexture.destroy();
    this.depthTexture?.destroy();
    this.depthTexture = null;
    this.occColor?.destroy();
    this.occDepth?.destroy();
    this.occReadBuffer?.destroy();
    this.occColor = null;
    this.occDepth = null;
    this.occReadBuffer = null;
    this.frameBuffer.destroy();
    this.tileBuffer.destroy();
  }
}
