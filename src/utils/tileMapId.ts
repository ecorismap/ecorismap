import { isSafePathSegment } from './safePath';

/**
 * 地図IDの検証。
 *
 * 地図IDはオフラインタイル・スタイル・boundary.json等の保存先として `${TILE_FOLDER}/${id}/...` に
 * そのまま連結され、削除（deleteAsync）や書き込み（makeDirectoryAsync・copyAsync・downloadAsync等）に渡る。
 * expo-file-systemはパスをURLとして解釈し、`..`を正規化した結果がアプリ領域内なら許可するため、
 * 外部（プロジェクト設定・地図設定JSON・.ecorismap・バックアップ）から来たIDに次の文字があると
 * TILE_FOLDERの外（SQLite・projects・mmkv等の兄弟フォルダ）を指してしまう。
 * - `/` `\` : パス区切り
 * - `%` : パーセントデコードされるため `%2e%2e%2f` 等で区切りを作れる
 * - `?` `#` : URLのクエリ・フラグメントとして以降がパスから落ちる（`../SQLite?` → `../SQLite`）
 * - `;` : 旧iOSのURLパラメータ区切り
 * - 制御文字（NUL等）
 * - 空文字・`.`・`..` : TILE_FOLDER自身やその親を指す
 * アプリが採番するID（ULID）や固定ID（standard・hybrid・dem_mapterhorn等）はいずれにも該当しない。
 */
export const isSafeTileMapId = (id: unknown): id is string => isSafePathSegment(id);

/** 外部から取り込む地図一覧から、IDがフォルダ名として安全でない地図を取り除く（配列でなければそのまま返す） */
export const dropUnsafeTileMaps = <T extends { id: unknown }>(tileMaps: T[]): T[] =>
  Array.isArray(tileMaps) ? tileMaps.filter((tileMap) => isSafeTileMapId(tileMap?.id)) : tileMaps;
