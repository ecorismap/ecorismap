// SQLite.web.ts

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

interface SQLiteDatabase {
  closeAsync: () => Promise<void>;
  execAsync: (sql: string, params?: any[]) => Promise<void>;
  runAsync: (sql: string, params?: any[]) => Promise<void>;
  withTransactionAsync: (callback: () => Promise<void>) => Promise<void>;
  getAllSync: (sql: string, params?: any[]) => any[];
  exportSQLite: () => Uint8Array;
  exportDatabaseForLayer: (layerId: string) => Promise<Uint8Array>;
  openDatabase: () => Promise<void>;
  importDatabase: (
    sqlite: ArrayBuffer,
    layerIdMap: { [key: string]: string } | null,
    fieldIdMap: { [key: string]: string } | null
  ) => Promise<void>;
  clearStorage: () => void;
  isOpen: () => boolean;
}

class WebSQLiteDatabase implements SQLiteDatabase {
  private db: any;
  private dbName: string;
  private static sqlite3: any;

  constructor(dbName: string) {
    this.dbName = dbName;
  }

  private static async initSqlite() {
    if (!WebSQLiteDatabase.sqlite3) {
      WebSQLiteDatabase.sqlite3 = await sqlite3InitModule();
    }
    return WebSQLiteDatabase.sqlite3;
  }

  async openDatabase(): Promise<void> {
    const sqlite3 = await WebSQLiteDatabase.initSqlite();
    this.db = new sqlite3.oo1.JsStorageDb('session', 'c');
    //this.db = new sqlite3.oo1.DB(`/${this.dbName}`, 'ct');
  }
  async closeAsync(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  clearStorage() {
    if (this.db) {
      console.log('db sizeA =', this.db.storageSize());
      this.db.clearStorage();
      console.log('db sizeB =', this.db.storageSize());
    }
  }
  isOpen(): boolean {
    return this.db?.isOpen();
  }
  async execAsync(sql: string, params: any[] = []): Promise<void> {
    if (!this.db?.isOpen()) {
      await this.openDatabase();
    }
    this.db.exec(sql, params);
  }

  async runAsync(sql: string, params: any[] = []): Promise<void> {
    if (!this.db?.isOpen()) {
      await this.openDatabase();
    }
    this.db.prepare(sql).bind(params).stepFinalize();
  }

  async withTransactionAsync(callback: () => Promise<void>): Promise<void> {
    if (!this.db?.isOpen()) {
      await this.openDatabase();
    }
    try {
      this.db.exec('BEGIN TRANSACTION');
      await callback();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  getAllSync(sql: string, params: any[] = []): any[] {
    if (!this.db?.isOpen()) {
      throw new Error('Database is not open');
    }
    const allRows = this.db.exec({
      sql: sql,
      bind: params,
      rowMode: 'object',
      returnValue: 'resultRows',
    });
    return allRows;
  }

  exportSQLite(): Uint8Array {
    if (!this.db?.isOpen()) {
      throw new Error('Database is not open');
    }
    const byteArray = WebSQLiteDatabase.sqlite3.capi.sqlite3_js_db_export(this.db) as Uint8Array;
    console.log('exported', { bytes: byteArray.byteLength });
    return byteArray;
  }

  async exportDatabaseForLayer(layerId: string) {
    if (!this.db?.isOpen()) {
      await this.openDatabase();
    }

    // 新しい一時データベースを作成
    const tempDb = new WebSQLiteDatabase.sqlite3.oo1.DB(':memory:', 'c');

    try {
      // 関連するテーブルを見つける
      const tables = this.getAllSync("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?", [
        `%${layerId}%`,
      ]);

      // 各テーブルをコピー
      for (const table of tables) {
        const tableName = table.name;

        // テーブル構造をコピー
        const createTableSql = this.getAllSync(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [
          tableName,
        ])[0].sql;
        tempDb.exec(createTableSql);

        // データをコピー
        const data = this.getAllSync(`SELECT * FROM "${tableName}"`);
        if (data.length > 0) {
          const insertSql = `INSERT INTO "${tableName}" VALUES (?)`;
          data.forEach(({ value }) => {
            tempDb.exec({
              sql: insertSql,
              bind: [value],
            });
          });
        }
      }

      // 新しいデータベースをエクスポート
      const byteArray = WebSQLiteDatabase.sqlite3.capi.sqlite3_js_db_export(tempDb);
      console.log('exported', { bytes: byteArray.byteLength });
      return byteArray;
    } finally {
      // 一時データベースを閉じる
      tempDb.close();
    }
  }

  async importDatabase(
    sqlite: any,
    layerIdMap: { [key: string]: string } | null = null,
    fieldIdMap: { [key: string]: string } | null = null
  ) {
    if (!this.db?.isOpen()) {
      await this.openDatabase();
    }
    try {
      const importDb = new WebSQLiteDatabase.sqlite3.oo1.DB(':memory:', 'c');
      const p = WebSQLiteDatabase.sqlite3.wasm.allocFromTypedArray(sqlite);

      const rc = WebSQLiteDatabase.sqlite3.capi.sqlite3_deserialize(
        importDb.pointer,
        'main',
        p,
        sqlite.byteLength,
        sqlite.byteLength,
        WebSQLiteDatabase.sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE
      );
      importDb.checkRc(rc);
      const tables = importDb.exec({
        sql: "SELECT name FROM sqlite_master WHERE type='table'",
        rowMode: 'object',
        returnValue: 'resultRows',
      });

      for (const table of tables) {
        //table.nameは_layerId_fieldIdの形式.これをlayerIdMapとfieldIdMapを使って変換する.
        const [_, layerId, fieldId] = table.name.split('_');
        const oldTableName = table.name;
        const newTableName =
          layerIdMap !== null && fieldIdMap !== null ? `_${layerIdMap[layerId]}_${fieldIdMap[fieldId]}` : table.name;
        const createTableSQL = `CREATE TABLE IF NOT EXISTS "${newTableName}" (value TEXT)`;
        await this.execAsync(createTableSQL);
        const data = importDb.exec({
          sql: `SELECT * FROM "${oldTableName}"`,
          rowMode: 'object',
          returnValue: 'resultRows',
        }) as {
          value: string;
        }[];
        if (data.length > 0) {
          const insertSql = `INSERT INTO "${newTableName}" (value) VALUES (?)`;
          for (const { value } of data) {
            await this.runAsync(insertSql, [value]);
          }
        }
      }
      importDb.close();
    } catch (error) {
      console.error('Error importing database:', error);

      throw error;
    }
  }
}

let globalDatabase: SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLiteDatabase> {
  if (!globalDatabase) {
    globalDatabase = new WebSQLiteDatabase('dictionary.sqlite');
  }

  if (!globalDatabase.isOpen()) {
    console.log('Opening database...');
    await globalDatabase.openDatabase();
  }

  return globalDatabase;
}

export async function deleteDatabase(dbName: string = 'dictionary.sqlite'): Promise<void> {
  try {
    const db = await getDatabase();
    db.clearStorage();
    await db.closeAsync();
    console.log(`Database ${dbName} deleted successfully`);
  } catch (error) {
    console.error('Error deleting database:', error);
    throw error;
  }
}

export async function exportDatabase(layerId: string) {
  try {
    const db = await getDatabase();
    const binaryArray = await db.exportDatabaseForLayer(layerId);
    // Blobオブジェクトを作成
    const blob = new Blob([binaryArray], { type: 'application/x-sqlite3' });
    // // ダウンロードリンクを作成
    const url = URL.createObjectURL(blob);
    return url;
  } catch (error) {
    console.error('Error exporting database:', error);
    throw error;
  }
}

export async function importDictionary(
  sqlite: ArrayBuffer,
  layerIdMap: { [key: string]: string } | null = null,
  fieldIdMap: { [key: string]: string } | null = null
) {
  try {
    const db = await getDatabase();
    await db.importDatabase(sqlite, layerIdMap, fieldIdMap);
    await db.closeAsync();
  } catch (error) {
    console.error('Error importing database:', error);
    throw error;
  }
}
