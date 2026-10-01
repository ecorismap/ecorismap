import { requireOptionalNativeModule } from 'expo-modules-core';

export type DemDecodeEncoding = 'gsi' | 'terrarium';

export type DemDecodeResult = {
  width: number;
  height: number;
  /** 標高[m]（行優先）。gsiのNoDataはNaN。terrariumの負値（海底）はそのまま */
  elevation: Float32Array;
  min: number;
  max: number;
  /** ネイティブ側の内訳[ms]（ファイル読み込み・画像展開・標高変換） */
  timing: { readMs: number; decodeMs: number; convertMs: number };
};

type DemDecoderNative = {
  decodeFile(fileUri: string, encoding: DemDecodeEncoding): Promise<ArrayBuffer>;
};

/** ネイティブが返すArrayBufferの先頭に置かれたヘッダのFloat32個数 */
const HEADER_FLOATS = 8;

const native = requireOptionalNativeModule<DemDecoderNative>('DemDecoder');

/** ネイティブモジュールが使えるか（Web・テスト環境ではfalse） */
export const isDemDecoderAvailable = (): boolean => native !== null;

/**
 * 標高タイルのファイル（WebP/PNG）をネイティブで標高へデコードする。
 * 展開も標高変換もJSスレッドの外で行われ、結果はコピーなしで受け取る。
 */
export const decodeDemFile = async (fileUri: string, encoding: DemDecodeEncoding): Promise<DemDecodeResult> => {
  if (native === null) throw new Error('DemDecoder native module is not available');
  return parseDecodeResult(await native.decodeFile(fileUri, encoding));
};

/** ネイティブが返すArrayBuffer（ヘッダ＋標高）を読む。標高はコピーせずビューで返す */
export const parseDecodeResult = (buffer: ArrayBuffer): DemDecodeResult => {
  const header = new Float32Array(buffer, 0, HEADER_FLOATS);
  return {
    width: header[0],
    height: header[1],
    elevation: new Float32Array(buffer, HEADER_FLOATS * 4),
    min: header[2],
    max: header[3],
    timing: { readMs: header[4], decodeMs: header[5], convertMs: header[6] },
  };
};
