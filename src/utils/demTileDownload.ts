/**
 * 標高タイル（Mapterhorn）のオフラインダウンロード。
 *
 * 「標高タイル」はRedux tileMapsに登録しない内部専用のダウンロードターゲットで、
 * ダウンロードモードのセレクタからのみ選択できる。可視領域・3D地形・長押し標高が
 * 実行時に参照する（demSource.tsがネットワークより先に見る）。
 *
 * 保存構造: TILE_FOLDER/dem_mapterhorn/{z}/{x}/{y}.webp
 * 404（外洋）は0バイトのマーカーを書く（読み取り側はdemSource.getDemTile）。
 */
import * as FileSystem from 'expo-file-system/legacy';
import {
  DEM_DOWNLOAD_MAX_ZOOM,
  DEM_DOWNLOAD_MIN_ZOOM,
  DEM_MAPTERHORN_MAP_ID,
  MAPTERHORN_URL,
} from '../constants/DemSources';
import { t } from '../i18n/config';
import { TileMapType } from '../types';
import { downloadedDemTileUri } from './demSource';

/** 疑似地図。ダウンロード機構に通すための定義で、Redux tileMapsには決して追加しない */
export const getDemTileMap = (): TileMapType => ({
  id: DEM_MAPTERHORN_MAP_ID,
  name: t('Home.download.demViewshed'),
  url: MAPTERHORN_URL,
  attribution: '© Mapterhorn',
  maptype: 'none',
  visible: false,
  transparency: 0,
  overzoomThreshold: DEM_DOWNLOAD_MAX_ZOOM,
  highResolutionEnabled: false,
  minimumZ: DEM_DOWNLOAD_MIN_ZOOM,
  maximumZ: DEM_DOWNLOAD_MAX_ZOOM,
  flipY: false,
});

/**
 * 1タイル分のダウンロード。
 * 200は保存、404（外洋）は0バイトマーカーを書いて完了扱い。
 * 一時エラー（5xx・通信断）は中間ファイルを削除してthrowし、再開時に再試行される。
 */
export const downloadDemTile = async (tile: { z: number; x: number; y: number }): Promise<void> => {
  const path = downloadedDemTileUri(tile.z, tile.x, tile.y);
  const url = MAPTERHORN_URL.replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y));
  let status: number;
  try {
    status = (await FileSystem.downloadAsync(url, path)).status;
  } catch (e) {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    throw e;
  }
  if (status === 200) return;
  if (status === 404) {
    // 本文（エラーメッセージ）を0バイトのマーカーで上書きする
    await FileSystem.writeAsStringAsync(path, '');
    return;
  }
  await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
  throw new Error(`DEM tile download failed: ${status}`);
};
