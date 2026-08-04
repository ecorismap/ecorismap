// 辞書テーブルへの一括INSERT。
// 1件ずつrunAsyncするとネイティブではJS→ネイティブの往復が件数分発生し、
// 植物野帳プリセット（種名1万件超）で数十秒かかる。複数行VALUESでまとめて
// 挿入すればステートメント数が1/CHUNK_SIZEになり、1秒未満で完了する。
//
// CHUNK_SIZEはSQLiteのバインド変数上限（古いビルドでは999）を超えない値にする。
// ネイティブ・Webの両方から使うため独立したモジュールに置く。
const CHUNK_SIZE = 500;

type RunAsyncDb = { runAsync: (sql: string, params: string[]) => Promise<unknown> };

// tableNameはSQLに直接埋め込むため、呼び出し側でisValidTableName等の検証を済ませること
export async function bulkInsertValues(db: RunAsyncDb, tableName: string, values: string[]): Promise<void> {
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '(?)').join(',');
    await db.runAsync(
      `INSERT INTO "${tableName}" (value) VALUES ${placeholders}`,
      chunk.map((value) => value.trim())
    );
  }
}
