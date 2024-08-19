import Dexie, { Table } from 'dexie';

// インターフェースを定義して各テーブルのスキーマを表現
interface GeoTiffItem {
  mapId: string;
  blob: Blob;
  boundary: string; // JSONとして保存される境界データ
  pdf: string; // PDFファイルのDataURI
}

interface PMTilesItem {
  mapId: string;
  blob: Blob | undefined;
  boundary: string; // JSONとして保存される境界データ
  style: string | undefined; // JSONとして保存されるスタイルデータ
}

// データベースクラスを拡張
class TilesDatabase extends Dexie {
  geotiff!: Table<GeoTiffItem, string>; // 文字列は主キー（mapId）の型
  pmtiles!: Table<PMTilesItem, string>;

  constructor() {
    super('tilesDB');
    this.version(1).stores({
      geotiff: 'mapId, blob, boundary',
      pmtiles: 'mapId, blob, boundary, style',
    });
  }
}

// データベースのインスタンスを作成
export const db = new TilesDatabase();
