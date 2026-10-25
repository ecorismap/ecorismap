/**
 * 外部（クラウドのプロジェクト設定・他メンバーのレコード・.ecorismap・バックアップ）から来た値を
 * ファイルパスに使う前の検証。
 *
 * expo-file-systemはパスをURLとして解釈し、`..`を正規化した結果がアプリ領域内なら許可するため、
 * IDや写真名に次の文字があると想定したフォルダの外（SQLite・mmkv・他プロジェクト等）を指してしまう。
 * - `/` `\` : パス区切り
 * - `%` : パーセントデコードされるため `%2e%2e%2f` 等で区切りを作れる
 * - `?` `#` : URLのクエリ・フラグメントとして以降がパスから落ちる（`../SQLite?` → `../SQLite`）
 * - `;` : 旧iOSのURLパラメータ区切り
 * - 制御文字（NUL等）
 * - 空文字・`.`・`..` : フォルダ自身やその親を指す
 * アプリが採番するID（ULID）や固定ID、カメラ・ライブラリ由来の写真名はいずれにも該当しない。
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_SEGMENT_CHARS = /[/\\%?#;\u0000-\u001f\u007f]/;

/** パスの1区切り（フォルダ名・ファイル名）として安全か */
export const isSafePathSegment = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && value !== '.' && value !== '..' && !UNSAFE_SEGMENT_CHARS.test(value);

const toFilePath = (uri: string): string | undefined => {
  const path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
};

/**
 * uriが指定フォルダの配下を指しているか。
 * 他メンバーのレコードの写真uriは送り手の端末のパスがそのまま届くため、
 * 削除や書き出しに使う前に自分の写真フォルダ配下であることを確かめる。
 */
export const isUriInsideFolder = (uri: unknown, folder: string): uri is string => {
  if (typeof uri !== 'string' || uri === '') return false;
  const path = toFilePath(uri);
  const base = toFilePath(folder)?.replace(/\/+$/, '');
  if (path === undefined || base === undefined || base === '') return false;
  // デコード後に残る%は二重エンコード（expo側でさらにデコードされうる）なので拒否する
  // eslint-disable-next-line no-control-regex
  if (/[\\%?#;\u0000-\u001f\u007f]/.test(path)) return false;
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) return false;
  // 末尾の/を落としてから比べる（`${folder}/` をフォルダ配下と誤認して丸ごと消さないため）
  return path.replace(/\/+$/, '').startsWith(`${base}/`);
};
