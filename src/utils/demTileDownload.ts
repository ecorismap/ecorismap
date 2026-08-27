/**
 * 可視領域用DEMタイルのオフラインダウンロード。
 *
 * 「標高タイル（可視領域用）」はRedux tileMapsに登録しない内部専用のダウンロードターゲットで、
 * ダウンロードモードのセレクタからのみ選択できる。タイルごとにGSI dem_pngを取得し、
 * 404（海・国外）ならAWS Terrain Tiles（terrarium）へフォールバックして保存する
 * （実行時のviewshed.ts fetchDemTileと同じ判定）。
 *
 * 保存構造: TILE_FOLDER/dem_viewshed/gsi/{z}/{x}/{y}, TILE_FOLDER/dem_viewshed/terrarium/{z}/{x}/{y}
 * GSI 404のタイルはgsi側に0バイトマーカーを書く（読み取り側はdemTileLoader.loadDownloadedDemTile）。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { TILE_FOLDER } from '../constants/AppConstants';
import {
  DEM_DOWNLOAD_MAX_ZOOM,
  DEM_DOWNLOAD_MIN_ZOOM,
  DEM_VIEWSHED_MAP_ID,
  GSI_DEM_URL,
  TERRARIUM_URL,
} from '../constants/DemSources';
import { t } from '../i18n/config';
import { TileMapType } from '../types';

/** 疑似地図。ダウンロード機構に通すための定義で、Redux tileMapsには決して追加しない */
export const getDemViewshedTileMap = (): TileMapType => ({
  id: DEM_VIEWSHED_MAP_ID,
  name: t('Home.download.demViewshed'),
  url: GSI_DEM_URL,
  attribution: '国土地理院, Mapzen/AWS Terrain Tiles',
  maptype: 'none',
  visible: false,
  transparency: 0,
  overzoomThreshold: DEM_DOWNLOAD_MAX_ZOOM,
  highResolutionEnabled: false,
  minimumZ: DEM_DOWNLOAD_MIN_ZOOM,
  maximumZ: DEM_DOWNLOAD_MAX_ZOOM,
  flipY: false,
});

const fillTemplate = (template: string, tile: { z: number; x: number; y: number }) =>
  template.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));

/**
 * 1タイル分のGSI→terrariumフォールバックダウンロード。
 * 成功パターンは「GSI 200（gsiのみ保存）」「GSI 404+terrarium 200（terrarium保存+gsi 0バイトマーカー）」
 * 「両方404（gsi 0バイトマーカーのみ=恒久欠損）」の3つ。一時エラー（5xx・通信断）は
 * 中間ファイルを削除してthrowし、再開時に再試行される。
 *
 * マーカーはterrarium処理の完了後に書く。これにより「gsi側にファイルが在る＝このタイルの
 * ペア処理完了」が成立し、再開時のlistExistingTiles('dem_viewshed/gsi')のスキップ判定が正しくなる。
 */
export const downloadDemTilePair = async (tile: { z: number; x: number; y: number }): Promise<void> => {
  const gsiPath = `${TILE_FOLDER}/${DEM_VIEWSHED_MAP_ID}/gsi/${tile.z}/${tile.x}/${tile.y}`;
  const terraPath = `${TILE_FOLDER}/${DEM_VIEWSHED_MAP_ID}/terrarium/${tile.z}/${tile.x}/${tile.y}`;

  let gsiStatus: number;
  try {
    gsiStatus = (await FileSystem.downloadAsync(fillTemplate(GSI_DEM_URL, tile), gsiPath)).status;
  } catch (e) {
    await FileSystem.deleteAsync(gsiPath, { idempotent: true }).catch(() => {});
    throw e;
  }
  if (gsiStatus === 200) return;
  if (gsiStatus !== 404) {
    await FileSystem.deleteAsync(gsiPath, { idempotent: true }).catch(() => {});
    throw new Error(`GSI DEM tile download failed: ${gsiStatus}`);
  }

  // GSI 404（海・国外）→ terrariumへフォールバック
  try {
    await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${DEM_VIEWSHED_MAP_ID}/terrarium/${tile.z}/${tile.x}`, {
      intermediates: true,
    }).catch(() => {});
    const terraStatus = (await FileSystem.downloadAsync(fillTemplate(TERRARIUM_URL, tile), terraPath)).status;
    if (terraStatus !== 200) {
      await FileSystem.deleteAsync(terraPath, { idempotent: true }).catch(() => {});
      if (terraStatus !== 404) {
        await FileSystem.deleteAsync(gsiPath, { idempotent: true }).catch(() => {});
        throw new Error(`Terrarium DEM tile download failed: ${terraStatus}`);
      }
      // 両方404=恒久欠損。マーカーだけ書いて完了扱い（エラー率に入れない）
    }
  } catch (e) {
    await FileSystem.deleteAsync(terraPath, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(gsiPath, { idempotent: true }).catch(() => {});
    throw e;
  }
  // GSIの404ボディを0バイトマーカーで上書き（=ペア処理完了の印）
  await FileSystem.writeAsStringAsync(gsiPath, '');
};
