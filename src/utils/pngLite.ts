/**
 * 最小限のPNGデコーダ。
 *
 * fast-pngはモジュール読み込み時に TextDecoder('latin1') を生成するが、
 * ExpoのネイティブTextDecoderポリフィルはUTF-8のみ対応でクラッシュするため、
 * 標高タイルのデコードに必要な範囲だけpako(zlib)で自前実装する。
 *
 * 対応: ビット深度8・非インターレース・カラータイプ0(グレー)/2(RGB)/3(パレット)/4(グレーα)/6(RGBA)
 */
import { inflate } from 'pako';

export interface DecodedPngLite {
  width: number;
  height: number;
  /** ピクセルあたりのチャンネル数（パレットは1） */
  channels: number;
  /** 生ピクセル値（width*height*channels）。パレットの場合はインデックス */
  data: Uint8Array;
  /** PLTEチャンクのRGB並び（3バイト/色）。パレット形式のときのみ */
  palette?: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS_BY_COLOR_TYPE: { [colorType: number]: number } = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** PNGバイナリをデコードする。対応外の形式・壊れたデータはnull */
export const decodePngLite = (buffer: ArrayBuffer | Uint8Array): DecodedPngLite | null => {
  try {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length < 8 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let palette: Uint8Array | undefined;
    const idatParts: Uint8Array[] = [];

    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const dataStart = offset + 8;
      if (dataStart + length > bytes.length) return null;
      if (type === 'IHDR') {
        width = view.getUint32(dataStart);
        height = view.getUint32(dataStart + 4);
        bitDepth = bytes[dataStart + 8];
        colorType = bytes[dataStart + 9];
        const interlace = bytes[dataStart + 12];
        if (bitDepth !== 8 || interlace !== 0 || CHANNELS_BY_COLOR_TYPE[colorType] === undefined) return null;
      } else if (type === 'PLTE') {
        palette = bytes.subarray(dataStart, dataStart + length);
      } else if (type === 'IDAT') {
        idatParts.push(bytes.subarray(dataStart, dataStart + length));
      } else if (type === 'IEND') {
        break;
      }
      offset = dataStart + length + 4; // CRCは検証しない
    }

    if (width === 0 || height === 0 || idatParts.length === 0) return null;
    if (colorType === 3 && palette === undefined) return null;

    const compressed = new Uint8Array(idatParts.reduce((sum, p) => sum + p.length, 0));
    let pos = 0;
    for (const part of idatParts) {
      compressed.set(part, pos);
      pos += part.length;
    }
    const raw = inflate(compressed);

    const channels = CHANNELS_BY_COLOR_TYPE[colorType];
    const stride = width * channels;
    if (raw.length < height * (stride + 1)) return null;

    // スキャンラインごとのフィルタを解除する
    const data = new Uint8Array(height * stride);
    for (let row = 0; row < height; row++) {
      const filter = raw[row * (stride + 1)];
      const src = row * (stride + 1) + 1;
      const dst = row * stride;
      const prev = dst - stride;
      switch (filter) {
        case 0: // None
          data.set(raw.subarray(src, src + stride), dst);
          break;
        case 1: // Sub
          for (let i = 0; i < stride; i++) {
            const left = i >= channels ? data[dst + i - channels] : 0;
            data[dst + i] = (raw[src + i] + left) & 0xff;
          }
          break;
        case 2: // Up
          for (let i = 0; i < stride; i++) {
            const up = row > 0 ? data[prev + i] : 0;
            data[dst + i] = (raw[src + i] + up) & 0xff;
          }
          break;
        case 3: // Average
          for (let i = 0; i < stride; i++) {
            const left = i >= channels ? data[dst + i - channels] : 0;
            const up = row > 0 ? data[prev + i] : 0;
            data[dst + i] = (raw[src + i] + ((left + up) >> 1)) & 0xff;
          }
          break;
        case 4: // Paeth
          for (let i = 0; i < stride; i++) {
            const left = i >= channels ? data[dst + i - channels] : 0;
            const up = row > 0 ? data[prev + i] : 0;
            const upLeft = row > 0 && i >= channels ? data[prev + i - channels] : 0;
            const p = left + up - upLeft;
            const pa = Math.abs(p - left);
            const pb = Math.abs(p - up);
            const pc = Math.abs(p - upLeft);
            const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
            data[dst + i] = (raw[src + i] + paeth) & 0xff;
          }
          break;
        default:
          return null;
      }
    }

    return { width, height, channels, data, palette };
  } catch {
    return null;
  }
};
