# 地理空間データルール

EcorisMapの地理空間データ処理に関する規約です。

## データ形式

### GeoJSON

#### 基本構造
```typescript
interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, any>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}
```

#### 座標系
- 内部処理: **WGS84 (EPSG:4326)**
- 座標順序: `[longitude, latitude]` (GeoJSON標準)

### サポートフォーマット

| 形式 | インポート | エクスポート | 用途 |
|------|-----------|-------------|------|
| GeoJSON | ✓ | ✓ | 標準交換形式 |
| GPX | ✓ | ✓ | GPSトラック |
| KML | ✓ | ✓ | Google Earth |
| CSV | ✓ | ✓ | スプレッドシート |
| JPEG (EXIF) | ✓ | - | 位置情報付き写真 |
| SQLite3 | ✓ | ✓ | 大量データ |

## 座標系変換

### GDAL使用
```typescript
// react-native-gdalwarpを使用
import { transformCoordinates } from 'react-native-gdalwarp';

// 変換例: UTM → WGS84
const wgs84Coords = await transformCoordinates(
  utmCoords,
  'EPSG:32654', // 元の座標系
  'EPSG:4326'   // 変換先
);
```

### 日本でよく使う座標系

| EPSG | 名称 | 用途 |
|------|------|------|
| 4326 | WGS84 | 国際標準 |
| 4612 | JGD2000 | 日本測地系 |
| 6668 | JGD2011 | 日本測地系2011 |
| 32651-32656 | UTM | 大縮尺地図 |

## 地図表示

### Mobile (react-native-maps)
```typescript
<MapView
  provider={PROVIDER_GOOGLE}
  region={region}
  onRegionChangeComplete={handleRegionChange}
>
  {features.map(feature => (
    <Marker
      key={feature.properties.id}
      coordinate={toLatLng(feature.geometry.coordinates)}
    />
  ))}
</MapView>
```

### Web (maplibre-gl)
```typescript
map.addSource('features', {
  type: 'geojson',
  data: featureCollection,
});

map.addLayer({
  id: 'points',
  type: 'circle',
  source: 'features',
  paint: {
    'circle-radius': 6,
    'circle-color': '#007cbf',
  },
});
```

## データ処理

### Turf.js活用
```typescript
import * as turf from '@turf/turf';

// 距離計算
const distance = turf.distance(point1, point2, { units: 'kilometers' });

// 面積計算
const area = turf.area(polygon);

// バッファ作成
const buffered = turf.buffer(point, 1, { units: 'kilometers' });

// 重心計算
const centroid = turf.centroid(polygon);

// 形状簡略化
const simplified = turf.simplify(feature, { tolerance: 0.01 });
```

### バリデーション
```typescript
// 座標値の範囲チェック
const isValidCoordinate = (lon: number, lat: number): boolean => {
  return lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
};

// GeoJSON構造のチェック
const isValidGeoJSON = (geojson: any): boolean => {
  // type, geometry, propertiesの存在確認
  return geojson.type === 'Feature'
    && geojson.geometry
    && geojson.properties;
};
```

## パフォーマンス

### 大量ポイント処理
- クラスタリングを検討
- ビューポート内のみ表示
- ズームレベルに応じた詳細度調整

### ポリゴン処理
- 複雑な形状は簡略化
- 大きなポリゴンは分割検討

## PMTiles

### 概要
効率的な地図タイルストレージ形式。

### 使用方法
```typescript
// PMTilesソースの追加
map.addSource('pmtiles', {
  type: 'vector',
  url: 'pmtiles://path/to/tiles.pmtiles',
});
```

## 注意事項

- 座標順序は必ずGeoJSON標準（lon, lat）に従う
- 大量データは遅延読み込みを検討
- 座標系変換は精度に注意
- ネイティブモジュール（GDAL）の依存関係を確認
