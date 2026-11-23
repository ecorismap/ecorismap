import * as FileSystem from 'expo-file-system/legacy';

/**
 * 3D 地形のテクスチャのディスクキャッシュ（`${layer.id}_${z}_${x}_${y}.${ext}`）。
 * 描画処理（tileTextureLoader）から切り離しておくのは、地図の編集・取り込みの経路から
 * ネイティブのラスタライザなどを読み込まずに片付けを呼べるようにするため。
 */
export const TERRAIN_TEXTURE_CACHE_DIR = `${FileSystem.cacheDirectory}terrain3d_tex`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 1つの地図のテクスチャキャッシュだけを消す。ID が別の地図の接頭辞でも巻き込まない */
export const removeTerrainTextureCacheForMap = async (tileMapId: string): Promise<void> => {
  const files = await FileSystem.readDirectoryAsync(TERRAIN_TEXTURE_CACHE_DIR).catch(() => [] as string[]);
  const pattern = new RegExp(`^${escapeRegExp(tileMapId)}_\\d+_\\d+_\\d+\\.[a-z]+$`);
  for (const name of files) {
    if (!pattern.test(name)) continue;
    await FileSystem.deleteAsync(`${TERRAIN_TEXTURE_CACHE_DIR}/${name}`, { idempotent: true }).catch(() => undefined);
  }
};
