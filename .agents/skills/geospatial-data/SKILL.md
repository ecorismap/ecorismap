---
name: geospatial-data
description: 地理空間データ処理のベストプラクティス。GeoJSON、座標系変換、Turf.js、GDAL、地図表示（react-native-maps、maplibre-gl）、PMTilesについて。地理空間データやGeoJSONの処理について質問があるときに使用。
---

# 地理空間データ処理

EcorisMapにおける地理空間データ処理のベストプラクティスです。

## データ形式

### GeoJSON（標準形式）

```typescript
// Feature
interface GeoJSONFeature {
  type: 'Feature';
  id?: string;
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, any>;
}

// FeatureCollection
interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}
```

### 座標系

- 内部処理: **WGS84 (EPSG:4326)**
- 座標順序: `[longitude, latitude]` (GeoJSON標準)
- 注意: Google Maps等は`(lat, lng)`順なので変換が必要

### サポートフォーマット

| 形式 | 用途 |
|------|------|
| GeoJSON | 標準交換形式 |
| GPX | GPSトラック |
| KML | Google Earth |
| CSV | スプレッドシート（位置情報付き） |
| JPEG (EXIF) | 位置情報付き写真 |
| SQLite3 | 大量データ |

## Turf.js活用

### 距離・面積計算

```typescript
import * as turf from '@turf/turf';

// 2点間の距離
const distance = turf.distance(point1, point2, { units: 'kilometers' });

// ポリゴンの面積
const area = turf.area(polygon); // 平方メートル

// 線の長さ
const length = turf.length(line, { units: 'kilometers' });
```

### 空間演算

```typescript
// バッファ作成
const buffered = turf.buffer(point, 1, { units: 'kilometers' });

// 重心計算
const centroid = turf.centroid(polygon);

// バウンディングボックス
const bbox = turf.bbox(featureCollection);

// 形状簡略化
const simplified = turf.simplify(feature, { tolerance: 0.01 });

// 点がポリゴン内にあるか
const isInside = turf.booleanPointInPolygon(point, polygon);
```

### 座標変換

```typescript
// 座標の反転（lat,lng ⇔ lng,lat）
const flipped = turf.flip(feature);

// 座標の変換
const transformed = turf.transformRotate(feature, 45);
```

## GDAL（react-native-gdalwarp）

### 座標系変換

```typescript
import { transformCoordinates } from 'react-native-gdalwarp';

// UTM → WGS84
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

### Mobile（react-native-maps）

```typescript
import MapView, { Marker, Polyline, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';

<MapView
  provider={PROVIDER_GOOGLE}
  region={region}
  onRegionChangeComplete={handleRegionChange}
>
  {features.map(feature => {
    if (feature.geometry.type === 'Point') {
      return (
        <Marker
          key={feature.id}
          coordinate={{
            latitude: feature.geometry.coordinates[1],
            longitude: feature.geometry.coordinates[0],
          }}
        />
      );
    }
    // LineString, Polygonも同様に処理
  })}
</MapView>
```

### Web（maplibre-gl）

```typescript
// ソース追加
map.addSource('features', {
  type: 'geojson',
  data: featureCollection,
});

// ポイントレイヤー
map.addLayer({
  id: 'points',
  type: 'circle',
  source: 'features',
  filter: ['==', '$type', 'Point'],
  paint: {
    'circle-radius': 6,
    'circle-color': '#007cbf',
  },
});

// ラインレイヤー
map.addLayer({
  id: 'lines',
  type: 'line',
  source: 'features',
  filter: ['==', '$type', 'LineString'],
  paint: {
    'line-width': 2,
    'line-color': '#ff0000',
  },
});
```

## PMTiles

### 設定

```typescript
import { Protocol } from 'pmtiles';

// プロトコル登録
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// ソース追加
map.addSource('pmtiles', {
  type: 'vector',
  url: 'pmtiles://path/to/tiles.pmtiles',
});
```

## パフォーマンス最適化

### ビューポートカリング

```typescript
// 表示範囲内のフィーチャーのみ処理
const getVisibleFeatures = (features: Feature[], bounds: Bounds): Feature[] => {
  return features.filter(f => {
    const coords = f.geometry.coordinates;
    return isWithinBounds(coords, bounds);
  });
};
```

### クラスタリング

```typescript
import Supercluster from 'supercluster';

const cluster = new Supercluster({
  radius: 40,
  maxZoom: 16,
});

cluster.load(features);
const clusters = cluster.getClusters(bbox, zoom);
```

### 形状簡略化

```typescript
// ズームレベルに応じた簡略化
const getSimplifiedFeature = (feature: Feature, zoom: number) => {
  const tolerance = 0.1 / Math.pow(2, zoom);
  return turf.simplify(feature, { tolerance });
};
```

## バリデーション

```typescript
// 座標値チェック
const isValidCoordinate = (lon: number, lat: number): boolean => {
  return lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
};

// GeoJSON構造チェック
const isValidGeoJSON = (geojson: any): boolean => {
  return (
    geojson &&
    geojson.type === 'Feature' &&
    geojson.geometry &&
    geojson.geometry.type &&
    geojson.geometry.coordinates &&
    geojson.properties !== undefined
  );
};

// 座標配列の深さチェック
const getCoordinateDepth = (coords: any): number => {
  let depth = 0;
  let current = coords;
  while (Array.isArray(current)) {
    depth++;
    current = current[0];
  }
  return depth;
};
```

## データ変換

### GPX → GeoJSON

```typescript
import { gpx } from '@mapbox/togeojson';

const geojson = gpx(new DOMParser().parseFromString(gpxString, 'text/xml'));
```

### KML → GeoJSON

```typescript
import { kml } from '@mapbox/togeojson';

const geojson = kml(new DOMParser().parseFromString(kmlString, 'text/xml'));
```

### CSV → GeoJSON

```typescript
const csvToGeoJSON = (csv: string, latCol: string, lngCol: string): FeatureCollection => {
  const rows = parseCSV(csv);
  const features = rows.map(row => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [parseFloat(row[lngCol]), parseFloat(row[latCol])],
    },
    properties: row,
  }));
  return { type: 'FeatureCollection', features };
};
```
