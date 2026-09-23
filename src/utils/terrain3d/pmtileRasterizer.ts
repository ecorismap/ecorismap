/**
 * PMTiles（ベクタ/ラスタ）・pbfタイルのネイティブラスタライザ呼び出し。
 *
 * 2D地図で使っているreact-native-mapsパッチ内の描画実装
 * （Android: MapPMTileProvider / iOS: AIRGoogleMapPMTileOverlay）を
 * アプリ側モジュール "PMTileRasterizer" 経由で呼び、タイルをPNGファイル化する。
 * ラベル・match式・オーバーズーム込みで2Dと同じ見た目が得られる。
 */
import { NativeModules, Platform } from 'react-native';

export interface RenderPmtileOptions {
  /** 署名付与済み・pmtiles://除去済みのURL（アーカイブURL または {z}/{x}/{y}.pbfテンプレート） */
  urlTemplate: string;
  styleURL?: string;
  /** file://付きの2Dと同じキャッシュパス（TILE_FOLDER/{tileMapId}） */
  tileCachePath: string;
  z: number;
  x: number;
  y: number;
  minimumZ: number;
  maximumZ: number;
  maximumNativeZ: number;
  flipY: boolean;
  offlineMode: boolean;
  isVector: boolean;
  /** 出力PNGパス（file://可） */
  outputPath: string;
}

interface PmtileRasterizerModule {
  renderTile: (options: RenderPmtileOptions) => Promise<number>;
  clearProviders: () => Promise<void>;
}

const nativeModule: PmtileRasterizerModule | undefined =
  Platform.OS === 'web' ? undefined : (NativeModules.PMTileRasterizer as PmtileRasterizerModule | undefined);

/**
 * タイルを描画してoutputPathへPNGを書き出す。
 * @returns タイルの一辺px（512=ベクタ/256=ラスタ）。タイルなしは0
 * @throws 通信エラー・ヘッダ取得失敗など（呼び出し側でリトライ判断）
 */
export const renderPmtile = async (options: RenderPmtileOptions): Promise<number> => {
  if (nativeModule === undefined) return 0;
  return nativeModule.renderTile(options);
};

/** レイヤ設定変更時にネイティブ側のプロバイダキャッシュを破棄する */
export const clearPmtileProviders = async (): Promise<void> => {
  if (nativeModule === undefined) return;
  await nativeModule.clearProviders();
};
