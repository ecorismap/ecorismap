import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

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

export async function exportDatabase(layerId: string) {
  // データベースをBlob形式でエクスポート
  //コピーして、layaerIdを含むテーブルのみをエクスポート
  try {
    const sourceDb = await getDatabase();
    const tempDbName = `temp_${layerId}.sqlite`;
    const tempDb = SQLite.openDatabaseSync(tempDbName, { useNewConnection: true });
    const tables = (await sourceDb.getAllAsync('SELECT name FROM sqlite_schema WHERE type="table"')) as {
      name: string;
    }[];
    for (const table of tables) {
      const tableName = table.name;
      const values = (await sourceDb.getAllAsync(`SELECT value FROM ${tableName}`)) as { value: string }[];
      console.log(`Exporting table ${tableName}...`);
      const createTableSQL = `CREATE TABLE ${tableName} (value TEXT)`;
      await tempDb.execAsync(createTableSQL);
      console.log(`Table ${tableName} created.`);
      // データを挿入する
      await tempDb.withTransactionAsync(async () => {
        const insertSQL = `INSERT INTO ${tableName} (value) VALUES (?)`;
        for (const { value } of values) {
          await tempDb.runAsync(insertSQL, [value.trim()]);
        }
      });
    }
    // 新しいデータベースをエクスポート
    await tempDb.closeAsync();
    const dbPath = `${FileSystem.documentDirectory}SQLite/${tempDbName}`;
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
  const importDb = await SQLite.deserializeDatabaseAsync(sqlite);
  const tables = (await importDb.getAllAsync('SELECT name FROM sqlite_schema WHERE type="table"')) as {
    name: string;
  }[];
  for (const table of tables) {
    const [_, layerId, fieldId] = table.name.split('_');
    const oldTableName = table.name;
    const newTableName =
      layerIdMap !== null && fieldIdMap !== null ? `_${layerIdMap[layerId]}_${fieldIdMap[fieldId]}` : table.name;
    const createTableSQL = `CREATE TABLE ${newTableName} (value TEXT)`;
    await sourceDb.execAsync(createTableSQL);
    const data = (await importDb.getAllAsync(`SELECT value FROM ${oldTableName}`)) as { value: string }[];

    // データを挿入する
    await sourceDb.withTransactionAsync(async () => {
      const insertSQL = `INSERT INTO ${newTableName} (value) VALUES (?)`;
      for (const { value } of data) {
        await sourceDb.runAsync(insertSQL, [value.trim()]);
      }
    });
  }
}
