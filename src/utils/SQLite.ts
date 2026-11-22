import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { isValidTableName } from './SQLiteTableName';
import { bulkInsertValues } from './SQLiteBulkInsert';

//Web版(SQLite.web.ts)と共通の実装を再エクスポートする（どちらのプラットフォームからも同じimportで使える）
export { isValidTableName } from './SQLiteTableName';

export async function getDatabase() {
  return SQLite.openDatabaseSync('dictionary.sqlite', { useNewConnection: true });
}

export async function deleteDatabase(dbName: string = 'dictionary.sqlite'): Promise<void> {
  try {
    const db = await SQLite.openDatabaseAsync(dbName);

    // データベースを閉じる
    await db.closeAsync();
    console.log('Database closed successfully');

    // データベースファイルのパスを取得
    const dbPath = `${FileSystem.documentDirectory}SQLite/${dbName}`;

    // ファイルの存在を確認
    const { exists } = await FileSystem.getInfoAsync(dbPath);

    if (exists) {
      // ファイルを削除
      await FileSystem.deleteAsync(dbPath, { idempotent: true });
      console.log(`Database file ${dbName} deleted successfully`);
    } else {
      console.log(`Database file ${dbName} does not exist`);
    }

    // SQLiteのキャッシュをクリア
    SQLite.deleteDatabaseSync(dbName);
    console.log('SQLite cache cleared');
  } catch (error) {
    //console.error('Error deleting database:', error);
    //throw error;
  }
}

/**
 * レイヤの辞書表（`_${layerId}_${fieldId}`）が手元にあるか。設定の保存で辞書を上げる前に確かめる。
 * 辞書を取得できなかった端末（取得の失敗・別の端末で作った辞書）には表が無く、そのまま書き出すと空の辞書を上げて
 * クラウドの辞書を消してしまうため
 */
export async function hasDictionaryTables(layerId: string): Promise<boolean> {
  const db = await getDatabase();
  const tables = (await db.getAllAsync('SELECT name FROM sqlite_schema WHERE type="table"')) as { name: string }[];
  // LIKEだと _ がワイルドカードになるためJS側で前方一致で絞る（exportDatabase と同じ）
  const layerTablePrefix = `_${layerId}_`;
  return tables.some(({ name }) => name.startsWith(layerTablePrefix));
}

export async function exportDatabase(layerId: string) {
  // データベースをBlob形式でエクスポート
  //コピーして、layaerIdを含むテーブルのみをエクスポート
  try {
    const sourceDb = await getDatabase();
    const tempDbName = `temp_${layerId}.sqlite`;
    const dbPath = `${FileSystem.documentDirectory}SQLite/${tempDbName}`;
    //すでに存在する場合は削除
    await deleteDatabase(tempDbName);
    const tempDb = SQLite.openDatabaseSync(tempDbName, { useNewConnection: true });
    const tables = (await sourceDb.getAllAsync('SELECT name FROM sqlite_schema WHERE type="table"')) as {
      name: string;
    }[];
    // 辞書テーブルは `_${layerId}_${fieldId}` 形式。LIKEだと _ がワイルドカードになるためJS側で前方一致で絞る
    const layerTablePrefix = `_${layerId}_`;
    for (const table of tables.filter(({ name }) => name.startsWith(layerTablePrefix))) {
      const tableName = table.name;
      if (!isValidTableName(tableName)) {
        console.warn(`Skipped table with unexpected name: ${tableName}`);
        continue;
      }
      const values = (await sourceDb.getAllAsync(`SELECT value FROM "${tableName}"`)) as { value: string }[];
      console.log(`Exporting table ${tableName}...`);
      const createTableSQL = `CREATE TABLE "${tableName}" (value TEXT)`;
      await tempDb.execAsync(createTableSQL);
      console.log(`Table ${tableName} created.`);
      // データを挿入する
      await tempDb.withTransactionAsync(async () => {
        await bulkInsertValues(
          tempDb,
          tableName,
          values.map(({ value }) => value)
        );
      });
    }
    // 新しいデータベースをエクスポート
    await tempDb.closeAsync();

    const sqliteFile = await FileSystem.getInfoAsync(dbPath);
    if (!sqliteFile.exists) {
      throw new Error('Database file does not exist');
    }
    return sqliteFile.uri;
  } catch (error) {
    console.error('Error exporting database:', error);
    throw error;
  }
}

export async function importDictionary(
  sqlite: any,
  layerIdMap: { [key: string]: string } | null = null,
  fieldIdMap: { [key: string]: string } | null = null
) {
  const sourceDb = await getDatabase();
  let importDb: SQLite.SQLiteDatabase;
  if (sqlite === '') {
    importDb = await SQLite.openDatabaseAsync('temp.sqlite', { useNewConnection: true });
  } else {
    importDb = await SQLite.deserializeDatabaseAsync(sqlite);
  }
  const tables = (await importDb.getAllAsync('SELECT name FROM sqlite_schema WHERE type="table"')) as {
    name: string;
  }[];
  for (const table of tables) {
    const oldTableName = table.name;
    let newTableName = oldTableName;
    if (layerIdMap !== null && fieldIdMap !== null) {
      const [head, layerId, fieldId, ...rest] = oldTableName.split('_');
      const newLayerId = layerIdMap[layerId];
      const newFieldId = fieldIdMap[fieldId];
      // 対応の無いテーブル（他レイヤの辞書や形式外の名前）は取り込まない。
      // そのまま進めると `_undefined_undefined` のような不要なテーブルが作られて上書きを繰り返す
      if (head !== '' || rest.length > 0 || newLayerId === undefined || newFieldId === undefined) {
        console.warn(`Skipped table without mapping: ${oldTableName}`);
        continue;
      }
      newTableName = `_${newLayerId}_${newFieldId}`;
    }

    // インポートしたファイル由来の名前をそのままSQLに埋めないよう、読み書き両方の名前を検証する
    if (!isValidTableName(oldTableName) || !isValidTableName(newTableName)) {
      console.warn(`Skipped table with unexpected name: ${oldTableName} -> ${newTableName}`);
      continue;
    }

    // 読み出しを先に済ませ、削除・作成・挿入を1つのトランザクションにまとめる。
    // SQLiteのDDLはトランザクション内で巻き戻せるので、途中で失敗しても既存の辞書表は元のまま残る
    // （以前は削除してから挿入していたため、失敗すると空の表だけが残っていた）
    const data = (await importDb.getAllAsync(`SELECT value FROM "${oldTableName}"`)) as {
      value: string | number | null;
    }[];

    await sourceDb.withTransactionAsync(async () => {
      await sourceDb.execAsync(`DROP TABLE IF EXISTS "${newTableName}"`);
      await sourceDb.execAsync(`CREATE TABLE "${newTableName}" (value TEXT)`);
      await bulkInsertValues(
        sourceDb,
        newTableName,
        data.map(({ value }) => value)
      );
    });
  }
  await deleteDatabase('temp.sqlite');
}
