import { getDatabase } from './SQLite';
import { PresetDictionary } from './Preset';
import { bulkInsertValues } from './SQLiteBulkInsert';

// プリセット適用で作成したレイヤの辞書語彙を辞書DBに登録する。
// テーブル名は辞書型フィールドの規約（_<layerId>_<fieldId>）に従う
export async function importPresetDictionaries(layerId: string, dictionaries: PresetDictionary[]) {
  if (dictionaries.length === 0) return;
  const db = await getDatabase();
  for (const { fieldId, values } of dictionaries) {
    const tableName = `_${layerId}_${fieldId}`;
    await db.execAsync(`DROP TABLE IF EXISTS "${tableName}"`);
    await db.execAsync(`CREATE TABLE "${tableName}" (value TEXT)`);
    await db.withTransactionAsync(async () => {
      await bulkInsertValues(db, tableName, values);
    });
  }
}
