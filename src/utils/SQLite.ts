import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

export function getDatabase() {
  return SQLite.openDatabaseSync('dictionary.db', { useNewConnection: true });
}

export async function deleteDatabase(dbName: string = 'dictionary.db'): Promise<void> {
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
