// SQLite.web.ts

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { isValidTableName } from './SQLiteTableName';
import { bulkInsertValues } from './SQLiteBulkInsert';

//ネイティブ版(SQLite.ts)と共通の実装を再エクスポートする。
//useDictionaryInput / useFieldList は '../utils/SQLite' からimportするため、
//Web版にも同じ名前のエクスポートが必要（無いとundefinedを呼び出して例外になる）
export { isValidTableName } from './SQLiteTableName';

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
  private static sqlite3: any;

  constructor(_dbName: string) {
    // dbNameは使用しない（sql.js-httpvifsではメモリDBを使用）
  }

  private static async initSqlite() {
    if (!WebSQLiteDatabase.sqlite3) {
      // Metro バンドルでは sqlite3.wasm がバンドル隣に配置されないため、
      // public/static/ へコピーした wasm を locateFile で参照する
      // （scripts/copy-web-assets.js がコピー）。
      // document.baseURI 基準の絶対URLに解決し、サブディレクトリ配信でも正しく参照させる(dev はルート配信)。
      WebSQLiteDatabase.sqlite3 = await sqlite3InitModule({
        locateFile: (file: string) => new URL(`static/${file}`, document.baseURI).href,
      });
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
      // 辞書テーブルは `_${layerId}_${fieldId}` 形式。LIKEだと _ がワイルドカードになるためJS側で前方一致で絞る
      const layerTablePrefix = `_${layerId}_`;
      const tables = (
        this.getAllSync("SELECT name FROM sqlite_master WHERE type='table'") as { name: string }[]
      ).filter(({ name }) => name.startsWith(layerTablePrefix));

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
        const oldTableName = table.name;
        let newTableName = oldTableName;
        if (layerIdMap !== null && fieldIdMap !== null) {
          const [head, layerId, fieldId, ...rest] = oldTableName.split('_');
          const newLayerId = layerIdMap[layerId];
          const newFieldId = fieldIdMap[fieldId];
          // 対応の無いテーブル（他レイヤの辞書や形式外の名前）は取り込まない。
          // そのまま進めると `_undefined_undefined` のような不要なテーブルが作られて上書きを繰り返す
          if (head !== '' || rest.length > 0 || newLayerId === undefined || newFieldId === undefined) {
            console.log(`skip table without mapping: ${oldTableName}`);
            continue;
          }
          newTableName = `_${newLayerId}_${newFieldId}`;
        }
        //テーブル名はSQLに直接埋め込むため、外部ファイル由来の想定外の名前は扱わない
        if (!isValidTableName(oldTableName) || !isValidTableName(newTableName)) {
          console.log(`skip invalid table name: ${oldTableName}`);
          continue;
        }

        // ネイティブと同じく value 列だけを読む。value 列の無い表はここで例外になり、
        // トランザクション（DROP）より前に失敗するので既存の辞書表は上書きされずに残る
        // （SELECT * だと value が undefined の空行で既存表を置き換えていた）
        const data = importDb.exec({
          sql: `SELECT value FROM "${oldTableName}"`,
          rowMode: 'object',
          returnValue: 'resultRows',
        }) as {
          value: string | number | null;
        }[];

        // 削除・作成・挿入を1つのトランザクションにまとめ、途中で失敗しても既存の辞書表を残す
        await this.withTransactionAsync(async () => {
          await this.execAsync(`DROP TABLE IF EXISTS "${newTableName}"`);
          await this.execAsync(`CREATE TABLE "${newTableName}" (value TEXT)`);
          if (data.length > 0) {
            await bulkInsertValues(
              this,
              newTableName,
              data.map(({ value }) => value)
            );
          }
        });
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

/**
 * レイヤの辞書表（`_${layerId}_${fieldId}`）が手元にあるか。設定の保存で辞書を上げる前に確かめる。
 * 辞書を取得できなかった端末には表が無く、そのまま書き出すと空の辞書を上げてクラウドの辞書を消してしまうため
 */
export async function hasDictionaryTables(layerId: string): Promise<boolean> {
  const db = await getDatabase();
  const tables = db.getAllSync("SELECT name FROM sqlite_master WHERE type='table'") as { name: string }[];
  // LIKEだと _ がワイルドカードになるためJS側で前方一致で絞る（exportDatabaseForLayer と同じ）
  const layerTablePrefix = `_${layerId}_`;
  return tables.some(({ name }) => name.startsWith(layerTablePrefix));
}

export async function exportDatabase(layerId: string) {
  try {
    const db = await getDatabase();
    const binaryArray = await db.exportDatabaseForLayer(layerId);
    // Blobオブジェクトを作成
    // ArrayBufferに確実に変換
    const arrayBuffer = binaryArray.buffer instanceof ArrayBuffer 
      ? binaryArray.buffer.slice(binaryArray.byteOffset, binaryArray.byteOffset + binaryArray.byteLength)
      : new ArrayBuffer(0);
    const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' });
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
