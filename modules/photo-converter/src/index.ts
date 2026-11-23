import { requireOptionalNativeModule } from 'expo-modules-core';

type PhotoConverterNative = {
  convertToJpeg(srcUri: string, dstUri: string, quality: number): Promise<void>;
};

const native = requireOptionalNativeModule<PhotoConverterNative>('PhotoConverter');

/** ネイティブモジュールが使えるか（Web・テスト環境、モジュールを含まない古いビルドではfalse） */
export const isPhotoConverterAvailable = (): boolean => native !== null;

/**
 * 写真をJPEGに変換して dstUri に書き出す。元のEXIF（撮影位置・撮影日時・向きなど）を引き継ぐ。
 * 使えない環境では例外を投げる（呼び出し側は isPhotoConverterAvailable で分岐する）
 */
export const convertPhotoToJpeg = async (srcUri: string, dstUri: string, quality: number): Promise<void> => {
  if (native === null) throw new Error('PhotoConverter native module is not available');
  await native.convertToJpeg(srcUri, dstUri, quality);
};
