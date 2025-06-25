# Hillshade (陰影起伏) 機能の使い方

EcorisMapでMapLibre NativeのようなDEM（数値標高モデル）による陰影起伏表現が可能になりました。

## 使用方法

### 1. 地図タイルの追加

地図設定画面で、URLに`hillshade://`プレフィックスを付けてDEMタイルのURLを指定します：

#### Mapbox Terrain RGB形式（デフォルト）
```
hillshade://https://api.maptiler.com/tiles/terrain-rgb/{z}/{x}/{y}.png?key=YOUR_KEY
```

#### Terrarium形式
```
hillshade-terrarium://https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
```

### 対応しているDEMタイル形式

- **Mapbox Terrain RGB** (デフォルト)
  - プレフィックス: `hillshade://`
  - 例: MapTiler Terrain RGB
  - URL例: `hillshade://https://api.maptiler.com/tiles/terrain-rgb/{z}/{x}/{y}.png`
  
- **Terrarium**
  - プレフィックス: `hillshade-terrarium://`
  - 例: AWS Terrain Tiles
  - URL例: `hillshade-terrarium://https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`

### 2. 表示設定

透明度スライダーで陰影の強さを調整できます。

### 3. 主な特徴


- **オフラインサポート**: DEMタイルもキャッシュされ、オフラインで使用可能

### 4. パラメータ（現在は固定値）

- **光源方向（azimuth）**: 315度（北西）
- **光源角度（altitude）**: 45度
- **誇張率（exaggeration）**: 1.5倍
- **影の色**: 暗い青系（60, 60, 90）
- **ハイライトの色**: 明るい黄色系（255, 255, 200）
- **アクセントカラー**: 薄い青系（180, 180, 200）

### 5. 注意事項

- Android専用機能です（iOS未実装）
- DEMタイルのダウンロードには時間がかかる場合があります
- 地形データのエンコーディング形式は自動判定されません（現在はMapbox形式固定）

### 6. トラブルシューティング

- 陰影が表示されない場合:
  - URLが正しいか確認してください
  - APIキーが有効か確認してください
  - ネットワーク接続を確認してください
  
- パフォーマンスが悪い場合:
  - 透明度を下げてみてください
  - ズームレベルを調整してください

### 7. 今後の改善予定
- **Viewportモード**: 地図を回転させると、光源方向が画面に対して固定されます（デフォルト）
- **リアルタイム更新**: 地図の回転に応じて陰影がリアルタイムに更新されます
- **パフォーマンス最適化**: 
  - 地図移動中は低品質モードで高速描画
  - 停止後に高品質で再レンダリング
- エンコーディング形式の自動判定または選択機能
- 光源パラメータのカスタマイズ機能
- iOS対応
- パフォーマンスの更なる最適化