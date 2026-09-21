/**
 * 素のWebGL2による地形描画（three.js非依存）。
 *
 * expo-glとthree.jsの相性問題（メモリ: expo-gl-three-incompatibility）のため、
 * シェーダ・バッファ・テクスチャを直接扱う。
 *
 * 規律:
 *  - 描画ループ中の同期GL呼び出し（getError/getParameter/readPixels）は禁止（デッドロック）
 *  - 毎フレーム先頭でbindFramebuffer(null)（iOSはレイアウト毎にデフォルトFBOが差し替わる）
 */
import { ExpoWebGLRenderingContext } from 'expo-gl';
import { TileGeometryData } from './demMeshBuilder';
import { Mat4 } from './matrices';
import { OverlayGeometryData } from './overlayGeometry';
import { Rgba } from './colorUtils';

const VERTEX_SHADER = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUv;
layout(location=2) in vec3 aNormal;
uniform mat4 uViewProj;
out vec2 vUv;
out vec3 vNormal;
out float vViewDepth;
void main() {
  vec4 clip = uViewProj * vec4(aPosition, 1.0);
  gl_Position = clip;
  vUv = aUv;
  vNormal = aNormal;
  vViewDepth = clip.w;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec3 vNormal;
in float vViewDepth;
uniform sampler2D uMap;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uLightDir;
uniform float uAmbient;
uniform float uUseTexture;
uniform vec3 uBaseColor;
// 1=タイルの最下層パス。テクスチャの透明部（衛星写真のNODATA等）をベース色で埋めて不透明にする。
// 0=上層パス。透明部はそのまま透過させて下のレイヤを見せる
uniform float uIsBase;
out vec4 outColor;
void main() {
  vec4 texel = mix(vec4(uBaseColor, 1.0), texture(uMap, vUv), uUseTexture);
  vec3 base = mix(texel.rgb, mix(uBaseColor, texel.rgb, texel.a), uIsBase);
  float alpha = uOpacity * mix(texel.a, 1.0, uIsBase);
  float diffuse = max(dot(normalize(vNormal), uLightDir), 0.0);
  vec3 lit = base * (uAmbient + (1.0 - uAmbient) * diffuse);
  float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
  outColor = vec4(mix(lit, uFogColor, fog), alpha);
}
`;

/** オーバーレイ（ドレープしたライン・ポリゴン）用の単色シェーダ */
const OVERLAY_VERTEX_SHADER = `#version 300 es
layout(location=0) in vec3 aPosition;
uniform mat4 uViewProj;
out float vViewDepth;
void main() {
  vec4 clip = uViewProj * vec4(aPosition, 1.0);
  gl_Position = clip;
  vViewDepth = clip.w;
}
`;

const OVERLAY_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in float vViewDepth;
uniform vec4 uColor;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
out vec4 outColor;
void main() {
  float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
  outColor = vec4(mix(uColor.rgb, uFogColor, fog), uColor.a * (1.0 - fog * 0.5));
}
`;

export interface TileGpuResources {
  vao: WebGLVertexArrayObject;
  buffers: WebGLBuffer[];
  indexCount: number;
}

interface UniformLocations {
  viewProj: WebGLUniformLocation | null;
  map: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  fogColor: WebGLUniformLocation | null;
  fogNear: WebGLUniformLocation | null;
  fogFar: WebGLUniformLocation | null;
  lightDir: WebGLUniformLocation | null;
  ambient: WebGLUniformLocation | null;
  useTexture: WebGLUniformLocation | null;
  baseColor: WebGLUniformLocation | null;
  isBase: WebGLUniformLocation | null;
}

export interface OverlayPass {
  resources: TileGpuResources;
  color: Rgba;
}

export interface DrawPass {
  resources: TileGpuResources;
  /** nullならuBaseColorの灰色地形 */
  texture: WebGLTexture | null;
  opacity: number;
  /** レイヤ順（0が最下層）。polygonOffsetでz-fightingを避ける */
  layerIndex: number;
}

const compileShader = (gl: ExpoWebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  // 初期化時のみ許される同期呼び出し
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log ?? 'unknown'}`);
  }
  return shader;
};

export class TerrainRenderer {
  private gl: ExpoWebGLRenderingContext;
  private program: WebGLProgram;
  private uniforms: UniformLocations;
  private overlayProgram: WebGLProgram;
  private overlayUniforms: {
    viewProj: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
    fogColor: WebGLUniformLocation | null;
    fogNear: WebGLUniformLocation | null;
    fogFar: WebGLUniformLocation | null;
  };

  constructor(gl: ExpoWebGLRenderingContext) {
    this.gl = gl;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error('createProgram failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    const overlayVs = compileShader(gl, gl.VERTEX_SHADER, OVERLAY_VERTEX_SHADER);
    const overlayFs = compileShader(gl, gl.FRAGMENT_SHADER, OVERLAY_FRAGMENT_SHADER);
    const overlayProgram = gl.createProgram();
    if (!overlayProgram) throw new Error('createProgram failed');
    gl.attachShader(overlayProgram, overlayVs);
    gl.attachShader(overlayProgram, overlayFs);
    gl.linkProgram(overlayProgram);
    if (!gl.getProgramParameter(overlayProgram, gl.LINK_STATUS)) {
      throw new Error(`overlay program link failed: ${gl.getProgramInfoLog(overlayProgram) ?? 'unknown'}`);
    }
    gl.deleteShader(overlayVs);
    gl.deleteShader(overlayFs);
    this.overlayProgram = overlayProgram;
    const ou = (name: string) => gl.getUniformLocation(overlayProgram, name);
    this.overlayUniforms = {
      viewProj: ou('uViewProj'),
      color: ou('uColor'),
      fogColor: ou('uFogColor'),
      fogNear: ou('uFogNear'),
      fogFar: ou('uFogFar'),
    };

    const u = (name: string) => gl.getUniformLocation(program, name);
    this.uniforms = {
      viewProj: u('uViewProj'),
      map: u('uMap'),
      opacity: u('uOpacity'),
      fogColor: u('uFogColor'),
      fogNear: u('uFogNear'),
      fogFar: u('uFogFar'),
      lightDir: u('uLightDir'),
      ambient: u('uAmbient'),
      useTexture: u('uUseTexture'),
      baseColor: u('uBaseColor'),
      isBase: u('uIsBase'),
    };
  }

  /** ジオメトリデータをVAO/VBO/IBOへアップロードする */
  createTileResources(data: TileGeometryData): TileGpuResources {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray failed');
    gl.bindVertexArray(vao);
    const buffers: WebGLBuffer[] = [];
    const attach = (location: number, array: Float32Array, size: number) => {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error('createBuffer failed');
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, array, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    attach(0, data.positions, 3);
    attach(1, data.uvs, 2);
    attach(2, data.normals, 3);
    const ibo = gl.createBuffer();
    if (!ibo) throw new Error('createBuffer failed');
    buffers.push(ibo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, buffers, indexCount: data.indices.length };
  }

  /** オーバーレイジオメトリ（positionのみ）をVAOへアップロードする */
  createOverlayResources(data: OverlayGeometryData): TileGpuResources {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray failed');
    gl.bindVertexArray(vao);
    const buffers: WebGLBuffer[] = [];
    const vbo = gl.createBuffer();
    if (!vbo) throw new Error('createBuffer failed');
    buffers.push(vbo);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer();
    if (!ibo) throw new Error('createBuffer failed');
    buffers.push(ibo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, buffers, indexCount: data.indices.length };
  }

  deleteTileResources(resources: TileGpuResources): void {
    const gl = this.gl;
    gl.deleteVertexArray(resources.vao);
    resources.buffers.forEach((b) => gl.deleteBuffer(b));
  }

  /**
   * localUriの画像をネイティブデコードでテクスチャ化する（PNG/JPEG/拡張子なし対応）。
   * 失敗時はthrow（呼び出し側でRGBAフォールバック）。
   */
  createTextureFromLocalUri(uri: string, width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.setTileTextureParams();
    const source = { localUri: uri, width, height } as unknown as TexImageSource;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return texture;
  }

  createTextureFromRgba(data: Uint8Array, width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.setTileTextureParams();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return texture;
  }

  deleteTexture(texture: WebGLTexture): void {
    this.gl.deleteTexture(texture);
  }

  private setTileTextureParams(): void {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * 1フレーム描画。passesはタイル×レイヤの描画単位（layerIndex昇順に並んでいること）。
   * farPassRingsは遠景リング（外側→内側の順）。各リングを描くたびにデプスバッファを
   * クリアするため、リング間・近景とメッシュの高さが食い違ってもz-fightingしない
   */
  drawFrame(
    passes: DrawPass[],
    viewProj: Mat4,
    options: {
      skyColor: [number, number, number];
      fogNear: number;
      fogFar: number;
      lightDir: [number, number, number];
      ambient: number;
    },
    overlayPasses: OverlayPass[] = [],
    farPassRings: DrawPass[][] = []
  ): void {
    const gl = this.gl;
    // iOSはレイアウト毎にデフォルトFBOが差し替わるため毎フレーム再バインドする
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(options.skyColor[0], options.skyColor[1], options.skyColor[2], 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.viewProj, false, viewProj);
    gl.uniform3fv(this.uniforms.fogColor, options.skyColor);
    gl.uniform1f(this.uniforms.fogNear, options.fogNear);
    gl.uniform1f(this.uniforms.fogFar, options.fogFar);
    gl.uniform3fv(this.uniforms.lightDir, options.lightDir);
    gl.uniform1f(this.uniforms.ambient, options.ambient);
    gl.uniform1i(this.uniforms.map, 0);
    gl.uniform3f(this.uniforms.baseColor, 0.62, 0.61, 0.56);
    gl.activeTexture(gl.TEXTURE0);

    let blendEnabled = false;
    const drawPassList = (list: DrawPass[]) => {
      for (const pass of list) {
        const useTexture = pass.texture !== null;
        const needsBlend = pass.opacity < 1 || pass.layerIndex > 0;
        if (needsBlend !== blendEnabled) {
          blendEnabled = needsBlend;
          if (needsBlend) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          } else {
            gl.disable(gl.BLEND);
          }
        }
        gl.uniform1f(this.uniforms.isBase, pass.layerIndex === 0 ? 1 : 0);
        if (pass.layerIndex > 0) {
          gl.enable(gl.POLYGON_OFFSET_FILL);
          gl.polygonOffset(-pass.layerIndex, -pass.layerIndex);
        } else {
          gl.disable(gl.POLYGON_OFFSET_FILL);
        }
        gl.uniform1f(this.uniforms.useTexture, useTexture ? 1 : 0);
        gl.uniform1f(this.uniforms.opacity, pass.opacity);
        if (pass.texture) gl.bindTexture(gl.TEXTURE_2D, pass.texture);
        gl.bindVertexArray(pass.resources.vao);
        gl.drawElements(gl.TRIANGLES, pass.resources.indexCount, gl.UNSIGNED_INT, 0);
      }
    };
    for (const ring of farPassRings) {
      if (ring.length === 0) continue;
      drawPassList(ring);
      // リング間・近景とはメッシュの高さが食い違う（DEM解像度差）ため、深度を切り離す
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    drawPassList(passes);
    gl.bindVertexArray(null);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.BLEND);

    // オーバーレイ（ドレープしたライン・ポリゴン）を地形の上に描く。
    // わずかに浮かせてあるが、遠距離では深度精度でめり込むためpolygonOffsetも併用
    if (overlayPasses.length > 0) {
      gl.useProgram(this.overlayProgram);
      gl.uniformMatrix4fv(this.overlayUniforms.viewProj, false, viewProj);
      gl.uniform3fv(this.overlayUniforms.fogColor, options.skyColor);
      gl.uniform1f(this.overlayUniforms.fogNear, options.fogNear);
      gl.uniform1f(this.overlayUniforms.fogFar, options.fogFar);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-4, -4);
      for (const pass of overlayPasses) {
        gl.uniform4fv(this.overlayUniforms.color, pass.color);
        gl.bindVertexArray(pass.resources.vao);
        gl.drawElements(gl.TRIANGLES, pass.resources.indexCount, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
    }
    gl.endFrameEXP();
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteProgram(this.overlayProgram);
  }
}
