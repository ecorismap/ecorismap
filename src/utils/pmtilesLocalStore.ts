import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { TILE_FOLDER } from '../constants/AppConstants';
import { TileMapType } from '../types';
import { db } from './db';

/**
 * Web の PMTiles レコードに style だけを書く。
 * put はレコードを丸ごと置き換え、取り込んだ PMTiles 本体（blob）と boundary を消してしまうため update を使う。
 */
export const saveStyleToPmtilesDb = async (mapId: string, style: string) => {
  const updated = await db.pmtiles.update(mapId, { style });
  if (updated === 0) {
    await db.pmtiles.put({ mapId, blob: undefined, boundary: '', style });
  }
};

export type PmtilesSaveCleanup = {
  /** 配信元が変わった: タイル（数字ディレクトリ・.pbf）と boundary、Web では取り込んだ本体も捨てる */
  source: boolean;
  /** スタイルが変わった: ネイティブが描いて保存した画像（{z}/{x}/{y}、拡張子なし）だけを捨てる */
  renderedTiles: boolean;
  /** スタイル欄を空にした: 端末内の style.json を捨てる（残すと iOS は空の styleURL でそれを読み、前のスタイルが出続ける） */
  style: boolean;
};

const isBlank = (value: string | undefined) => value === undefined || value === '';

/**
 * 地図編集の保存時に、端末内の何を片付けるか。
 * ネイティブは描画済み画像をディスクから先に読むので、スタイルを変えたら（style:// への切り替えも）画像は消す。
 * 配信元が変わったら、スタイルにかかわらず旧ソースのタイルが混ざらないよう全部消す。
 */
export const getPmtilesSaveCleanup = (
  previous: Pick<TileMapType, 'url' | 'styleURL'> | undefined,
  next: Pick<TileMapType, 'url' | 'styleURL'>
): PmtilesSaveCleanup => {
  if (previous === undefined) return { source: false, renderedTiles: false, style: false };
  const source = previous.url !== next.url;
  const styleChanged = (previous.styleURL ?? '') !== (next.styleURL ?? '');
  return {
    source,
    renderedTiles: source || styleChanged,
    style: styleChanged && !isBlank(previous.styleURL) && isBlank(next.styleURL),
  };
};

// タイルはズームごとの数字ディレクトリか .pbf。style.json や取り込んだ .pmtiles 本体はここに当てはまらない
export const isTileCacheEntry = (name: string) => /^\d+$/.test(name) || name.toLowerCase().endsWith('.pbf');

// ネイティブが描いて保存した画像は拡張子なしの数字名。ダウンロードした {y}.pbf はスタイルに依らないので残す
const isRenderedTileFile = (name: string) => /^\d+$/.test(name);

const removeRenderedTiles = async (folder: string, zDirs: string[]) => {
  for (const z of zDirs) {
    if (!/^\d+$/.test(z)) continue;
    const xDirs = await FileSystem.readDirectoryAsync(`${folder}/${z}`).catch(() => [] as string[]);
    for (const x of xDirs) {
      if (!/^\d+$/.test(x)) continue;
      const files = await FileSystem.readDirectoryAsync(`${folder}/${z}/${x}`).catch(() => [] as string[]);
      for (const file of files) {
        if (!isRenderedTileFile(file)) continue;
        await FileSystem.deleteAsync(`${folder}/${z}/${x}/${file}`, { idempotent: true });
      }
    }
  }
};

/**
 * 地図そのものは残したまま、保存時に古くなったものだけを消す。
 * フォルダごと消すのは地図の削除のときだけ（取り込んだ実体や、使い続ける style.json は残す）。
 */
export const cleanupPmtilesOnSave = async (mapId: string, cleanup: PmtilesSaveCleanup) => {
  if (!cleanup.source && !cleanup.renderedTiles && !cleanup.style) return;
  if (Platform.OS === 'web') {
    // Web は maplibre が描くので描画済み画像は無い
    if (!cleanup.source && !cleanup.style) return;
    const record = await db.pmtiles.get(mapId);
    if (record === undefined) return;
    // 取り込んだ本体は配信元を変えたら不要。残すと起動時の updatePmtilesURL が url を古い本体に書き戻す
    const blob = cleanup.source ? undefined : record.blob;
    const style = cleanup.style ? undefined : record.style;
    if (blob === undefined && style === undefined) {
      await db.pmtiles.delete(mapId);
      return;
    }
    // boundary の '' は地図一覧のタップ時に取り直される（Maps.tsx の loadBoundary）
    const boundary = cleanup.source ? '' : record.boundary;
    await db.pmtiles.update(mapId, { blob, style, boundary });
    return;
  }
  const folder = `${TILE_FOLDER}/${mapId}`;
  const info = await FileSystem.getInfoAsync(folder);
  if (!info.exists || !info.isDirectory) return;
  const entries = await FileSystem.readDirectoryAsync(folder);
  if (cleanup.source) {
    for (const name of entries) {
      if (isTileCacheEntry(name) || name === 'boundary.json') {
        await FileSystem.deleteAsync(`${folder}/${name}`, { idempotent: true });
      }
    }
  } else if (cleanup.renderedTiles) {
    await removeRenderedTiles(folder, entries);
  }
  if (cleanup.style && entries.includes('style.json')) {
    await FileSystem.deleteAsync(`${folder}/style.json`, { idempotent: true });
  }
};
