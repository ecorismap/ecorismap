# Change Log
## [0.4.6] - 2025-8-23
- Support export previous storage system data

- 旧ストレージのデータのエクスポートに対応


## [0.4.5] - 2025-8-22
- Revamped internal storage
- Fixed tracking log bug

- 内部ストレージを刷新
- トラッキングログのバグを修正

## [0.4.3] - 2025-8-5
- Add dictionary input functionality
- Fix the eraser bug in map memos
- Fix the bug where cache remains even after changing the map URL
- Fixed an issue where display slowed down when tiles were not available (Android)
- Added map groups
- Added KML to data export options

- 辞書入力の機能を追加
- マップメモの消しゴムの不具合を修正
- 地図のURLを変更してもキャッシュが残る不具合を修正
- タイルがない場合に表示が遅くなる問題を修正（Android）
- 地図グループを追加
- データのエクスポートにKMLを追加


## [0.4.1] - 2024-8-22
- Update terms of use.
- Fix import data bug (iOS).

- 利用規約を更新
- データのインポートのバグを修正（iOS）

## [0.4.0] - 2024-8-17
- Added support for exporting Geospatial PDF
- Added support for importing Geospatial PDF
- Added settings for GPS accuracy and battery usage
- Added stamp and brush features to map memos
- Added support for importing local PMTiles
- Added layer grouping functionality
- Fixed minor bugs and improved various features

- Geospatial PDFの書き出しに対応
- Geospatial PDFのインポートに対応
- GPSの精度とバッテリーの設定を追加
- マップメモのスタンプ、ブラシ機能を追加
- ローカルのPMTilesのインポートに対応
- レイヤーのグループ化機能を追加
- 細かなバグと機能を修正

## [0.3.13] - 2023-12-18
- Support for data sorting
- Fixed minor bugs and features

- データの並び替えに対応
- 細かなバグと機能を修正

## [0.3.11] - 2023-11-29
- Change the iOS picker.
- Add a copy function for data.
- Add a lock feature for Apple Pencil in the drawing tool.
- Change the layout for tablets in landscape mode.
- Modify to disable landscape mode usage on smartphones.
- Fix minor bugs and adjust features.

- iOSのピッカーを変更
- データのコピー機能を追加
- ドローツールにApple Pencil用のロック機能を追加
- タブレットの横向きの配置を変更
- スマホの横向き利用はできないように変更
- 細かなバグと機能を修正
  

## [0.3.9] - 2023-11-23
- Fixed a bug that prevented downloading maps for offline use
- Added support for downloading PMTiles (raster)

- オフライン用の地図をダウンロードできないバグを修正
- PMTiles(ラスター)のダウンロードに対応

## [0.3.7] - 2023-11-21
- Fix the bug that prevents editing with the draw tool.
- Fix the bug that causes freezing with PMTiles(iOS).

- ドローツールで編集できなくなるバグを修正
- PMTilesでフリーズするバグを修正(iOS)


## [0.3.5] - 2023-10-27
- Improved data display speed.
- Enhanced drawing process of MapMemo.
- Fixed vector tile loading bug on Android.

- データの表示速度を改善
- MapMemoのドロー処理を改善
- Androidのベクトルタイルの読み込みバグを修正


## [0.3.3] - 2023-10-16
- Added support for displaying PMTiles and vector tiles in pbf format
- Added a tool to write notes on the map
- Added support for importing and exporting map settings
- Modified split-screen display
- Discontinued the function to load map settings via the internet
- Fixed numerous bugs

- PMTilesとpbf形式のベクタータイルの表示に対応
- 地図上にメモを書き込めるツールを追加
- 地図設定のインポート、エクスポート対応
- 画面の分割表示を変更
- 地図設定のネット経由の読み込み機能の廃止
- 多くのバグを修正


## [0.2.0] - 2023-4-6
#### Common
- Updated to expo47
- Support for editing polygons
- Changes to draw tools in general
- Support for loading GeoJSON with layer settings
- Support for color settings in multiple fields
- Support for loading PMTiles (raster)
- Fixed performance drop bug in point data editing
- Minor bug fixes

- expo47に更新
- ポリゴンの編集に対応
- ドローツール全般の変更
- レイヤ設定付きGeoJSONの読み込みに対応
- 複数フィールドでの色設定に対応
- PMTiles（ラスタ）の読み込みに対応
- ポイントデータの編集でパフォーマンスが落ちるバグ修正
- 細かなバグ修正
  
#### Android
- Fixed a bug that the date could not be changed in dark mode
- ダークモードで日付を変更できない不具合修正


## [0.1.10] - 2022-12-01
#### Common
- Remove unnecessary code for development. 
- Change color when selecting features.
- fix stop tracking on startup.
     
#### Android
- Support for Android API level 31. 


#### Web
- Eliminated averaging algorithm for line creation. 
- Fixed color selection layout corruption. 
- Support for hover and selection of polygons and lines. 

## [0.1.9] - 2022-11-13
- App Release.

[0.4.6]: https://github.com/ecorismap/ecorismap/compare/6196449453febecc5eb2adcc21be183db21d73b8...HEAD
[0.4.5]: https://github.com/ecorismap/ecorismap/compare/27e5e0da2bfe9c67ae496efda7a9dbe8ff7d2b12...6196449453febecc5eb2adcc21be183db21d73b8
[0.4.3]: https://github.com/ecorismap/ecorismap/compare/7ca59c7d5e9678397af39bd4eda43a7c9e83f4e8...27e5e0da2bfe9c67ae496efda7a9dbe8ff7d2b12
[0.4.1]: https://github.com/ecorismap/ecorismap/compare/12f64c2289ebf291339f453d4cba33920120ae9a...0d9d02a29c54c21277cffa2ef8173144c993ad6a
[0.4.0]: https://github.com/ecorismap/ecorismap/compare/12f64c2289ebf291339f453d4cba33920120ae9a...d3538ad56fd23f6b3293c54706576d57856356eb
[0.3.13]: https://github.com/ecorismap/ecorismap/compare/80638642cfe69f9fa27464d8e6deb58bbcd698d0...12f64c2289ebf291339f453d4cba33920120ae9a
[0.3.11]: https://github.com/ecorismap/ecorismap/compare/996dcffdb7baf6a08d2e4056920585422f26bd6f...80638642cfe69f9fa27464d8e6deb58bbcd698d0
[0.3.9]: https://github.com/ecorismap/ecorismap/compare/8410b80fb75dcb65e214b431d4ddfadcd9afe9d4...996dcffdb7baf6a08d2e4056920585422f26bd6f
[0.3.7]: https://github.com/ecorismap/ecorismap/compare/5b421a6fd52393b90b9f2c14adb536daa19639c0...8410b80fb75dcb65e214b431d4ddfadcd9afe9d4
[0.3.5]: https://github.com/ecorismap/ecorismap/compare/d642a3f85075c51679cfe795b96b443b793ab605...5b421a6fd52393b90b9f2c14adb536daa19639c0
[0.3.3]: https://github.com/ecorismap/ecorismap/compare/37e4fe928b7728a191e87b7538cbfd92554bfc6b...d642a3f85075c51679cfe795b96b443b793ab605
[0.2.0]: https://github.com/ecorismap/ecorismap/compare/69d133b13d58a12f9ee4dbe406e1212560721551...37e4fe928b7728a191e87b7538cbfd92554bfc6b
[0.1.10]: https://github.com/ecorismap/ecorismap/tree/69d133b13d58a12f9ee4dbe406e1212560721551

