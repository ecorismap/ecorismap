// テーブル名はプレースホルダ(?)にできずSQLへ直接埋め込むしかないため、使用前に検証する。
// 辞書テーブルは `_${layerId}_${fieldId}`（ULID）形式だが、インポートしたSQLiteファイルから
// sqlite_schemaで読み取る名前は外部入力なので、想定外の文字を含むものは扱わない。
// sqlite_で始まる名前はSQLiteの予約（sqlite_sequence等）なので除外する。
//
// ネイティブ・Webの両方から使うため独立したモジュールに置く。
// SQLite.ts / SQLite.web.ts のどちらか一方にしか無いと、もう一方のプラットフォームで
// import が undefined になり呼び出し時に例外になる。
const TABLE_NAME_PATTERN = /^[0-9A-Za-z_-]+$/;

export const isValidTableName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 128 &&
  TABLE_NAME_PATTERN.test(name) &&
  !name.toLowerCase().startsWith('sqlite_');
