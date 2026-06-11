# New Architecture移行 + react-native-maps 1.27.2（スパイク→本格移行 記録）

ブランチ: `spike/new-arch-maps-1.27`
目的: New Arch移行＋react-native-maps更新のGo/No-Go判断材料を作る。
計画: `~/.claude/plans/react-native-maps-new-arch-react-prancy-charm.md`

## 前提（2026-06調査）

- react-native-maps 1.21.0以降はFabric専用。1.26.1+はRN >= 0.81.1＋New Arch必須。現行は1.14.0＋Old Arch。
- iOS Google Maps: 最新版でも公式サポート継続（pod指定は `react-native-maps/Google` に変更）。
- RN 0.82+/Expo SDK 55+はOld Arch廃止。現行RN 0.81.5/SDK 54がOld Arch最後。
- Fabric版の既知issue: UrlTile動的ON/OFFクラッシュ(#5807)、UrlTile zIndex(#5774)、オフラインタイル(#5599)。

## Phase 0: パッチ棚卸し結果

`patches/react-native-maps+1.14.0.patch`（26,645行、ただし.dex等ビルド成果物が大半）の実質的な変更内容。

### 新規追加ファイル（PMTiles/ベクタタイル機能）

**Android** (`com.rnmaps.maps`):
- `MapPMTile.java` / `MapPMTileManager.java` / `MapPMTileProvider.java` — PMTileコンポーネント本体
- `MapDEMTileProvider.java` — **hillshade://用DEMタイル（陰影起伏）プロバイダ**
- `PMTiles/` 17ファイル — PMTilesフォーマットのリーダー実装（Header/Entry/Cache/FetchSource/Decompress等）
- `VectorStyle/` 5ファイル — ベクタタイルのスタイル描画（LayerStyle/PaintStyle/VectorTileStyleManager等）
- `vector_tile/VectorTile.java` — protobufで生成したMVTパーサ（protobuf-javalite依存）

**iOS** (`AirGoogleMaps/`):
- `AIRGoogleMapPMTile.{h,m}` / `AIRGoogleMapPMTileManager.{h,m}` / `AIRGoogleMapPMTileOverlay.{h,m}`
- `AIRGoogleMapDEMTileOverlay.{h,m}` — hillshade://用
- `PMTiles/` 6ペア — PMTilesリーダー（Decompress/FetchSource/Header/SharedCache/VarintHelper）
- `VectorTile/` 9ペア — MVT描画（StyleManager/VectorSource/FeatureData/PolygonData/LineData、VectorTile.pbobjc=protobuf生成、非ARC）

**JS**: `lib/MapPMTile.{js,d.ts}`、index/decorateMapComponentへのPMTile登録

### 既存ファイルへの改変（パッチ除去で失われる挙動）

| ファイル | 実質的な変更 |
|---|---|
| `android/build.gradle` | protobuf-javalite 3.21.11、gson 2.8.8 依存追加 |
| `MapUrlTile.java` (Android) | **hillshade://検出→MapDEMTileProvider分岐**、タイル切替時のダブルバッファリング（fadeAnimator/pendingTileOverlay）、onCameraChange(bearing)フック |
| `MapView.java` (Android) | ほぼ整形のみ（実質変更なしと判断） |
| `MapsPackage.java` | MapPMTileManager登録 |
| `AIRGoogleMapUrlTile.{h,m}` (iOS) | **全面書き直し**。upstreamはGMSURLTileLayerの素朴な実装（urlTemplate/maximumZ/minimumZ/flipYのみ）。パッチで opacity / tileSize / doubleTileSize / maximumNativeZ / offlineMode / tileCachePath / tileCacheMaxAge を追加 |
| `AIRGoogleMapUrlTileOverlay.{h,m}` (iOS) | **新設**（GMSSyncTileLayerサブクラス）。オーバーズーム描画、PDF用「上位ズームから生成」(drawFromHigherZoomTile)、オフラインキャッシュ参照を自前実装 |
| `AIRGoogleMapURLTileManager.m` | 上記7propsのRCT_EXPORT_VIEW_PROPERTY追加 |
| `AIRGoogleMap.m` | PMTileのinsertSubview処理追加（他は整形） |
| `AIRMapUrlTileCachedOverlay.m` (Apple Maps側) | オフライン時に下位ズームタイルを探索して拡大表示するフォールバック追加 |
| `react-native-google-maps.podspec` | Protobuf依存追加、VectorTile.pbobjc.mの非ARCサブスペック |
| `lib/index.js` 等 | PMTileエクスポート追加 |

### 重要な発見

1. **iOS+Google providerのUrlTile高機能化はパッチ由来**: upstream 1.14のiOS Google providerのUrlTileは tileCachePath / offlineMode / maximumNativeZ / doubleTileSize / opacity を**サポートしていない**（Apple Maps側のみ）。EcorisMapのオフラインタイル・オーバーズーム・PDF地図表示はiOSではすべてパッチ実装。→ **1.27のFabric版iOS UrlTileにこれらが実装されたかどうかが最重要確認事項**（Phase B-5/D）。
2. **hillshade://（DEM陰影起伏）も自前機能**: `src/hooks/useTiles.ts:122,426`等で使用。Android=MapDEMTileProvider、iOS=AIRGoogleMapDEMTileOverlay。再実装スコープはPMTilesだけでなくDEMタイルも含む。
3. **PDF地図の `file://dummy/{z}/{x}/{y}.png` 方式**: tileCachePath＋minimumZ未満は上位ズームから生成、という自前ロジックに依存（iOS）。
4. onPoiClickの`position`フィールドはupstream由来（パッチは整形のみ）→ 心配不要。
5. Androidの`MapUrlTile.java`ダブルバッファリング（タイル切替時のちらつき防止フェード）もパッチ由来。1.27で同等の見た目になるか要確認。

### 再実装スコープまとめ（Phase Dで精査）

| 機能 | Android | iOS |
|---|---|---|
| PMTile（ラスタ/ベクタ） | MapPMTile系＋PMTiles/＋VectorStyle/＋protobuf | AIRGoogleMapPMTile系＋PMTiles/＋VectorTile/ |
| DEM/hillshade | MapDEMTileProvider＋UrlTile分岐 | AIRGoogleMapDEMTileOverlay |
| UrlTile拡張（オフライン/オーバーズーム/PDF/opacity） | upstream 1.14に概ね存在（MapTileProvider）→1.27存続要確認 | **パッチで全面自前実装**→1.27の実装状況が鍵 |
| タイル切替フェード | MapUrlTileダブルバッファリング | （なし） |

## 1.27.x（master）の構造調査（Phase D先行分）

### 全体構造: 「Fabricホスト＋レガシービュー温存」のハイブリッド

1.27はフルスクラッチではなく、**レガシー実装（AirMaps/AirGoogleMaps/com.rnmaps.maps）を温存**し、その上にFabric層を被せた構造。これは旧パッチの移植可能性にとって朗報。

**Android**:
- `com.rnmaps.maps.MapUrlTile` / `MapTileProvider` は**温存**（パッチ移植先がそのまま存在）
- 新規レイヤー: `com.rnmaps.fabric.UrlTileManager`（codegen Delegate/Interface経由、`createViewInstance()`で`new MapUrlTile(context)`に委譲）
- Fabric UrlTileManagerのprops: urlTemplate/tileSize/doubleTileSize/flipY/minimumZ/maximumZ/maximumNativeZ/offlineMode/tileCachePath/tileCacheMaxAge/**opacity**/zIndex → **EcorisMapが使う全propsが存続** ✓

**iOS**:
- Fabricホストは `RNMapsMapView`(Apple) / `RNMapsGoogleMapView`(Google、`AIRGoogleMap`をラップ)。Google Maps providerは**iOS Fabricでも正式サポート**（`PlaceHolderGoogleMapView`はGoogle Maps pod未導入時のスタブ）
- **子コンポーネント（UrlTile等）はNew Archでも`requireNativeComponent('AIRGoogleMapUrlTile')`のレガシーInterop経路**（`decorateMapComponent.ts`でAndroidのみFabric specに分岐、iOSはレガシーのまま）
- マウントは `mountChildComponentView` → `getPaperViewFromChildComponentView` → `insertReactSubview`（レガシービューをそのまま挿入）
- → **iOSの`AIRGoogleMapUrlTile`はupstream 1.27でも1.14と同じ素朴な実装**（urlTemplate/min/maxZ/flipYのみ。tileCachePath/offlineMode/opacity/maximumNativeZ非対応のまま）

### EcorisMapへの示唆

1. **iOSのオフライン/オーバーズーム/PDF/opacity対応は1.27でも自前実装が必要**（upstreamに入っていない）。ただしiOS子コンポーネントの仕組みが1.14とほぼ同じ（レガシービュー＋Interop）なので、**旧パッチのiOS実装（AIRGoogleMapUrlTileOverlay/PMTile/DEMTileOverlay）は比較的小さい修正で移植できる見込み**。
2. **AndroidのUrlTile系はupstreamがフル機能**なので、パッチ移植はPMTile/DEM部分のみ。新規childコンポーネント追加は「codegen spec（src/specs/）＋fabric Manager＋decorateMapComponentのAndroid分岐＋レガシーMapPMTile温存」のパターン。
3. JS specの`NativeComponentUrlTile.ts`には`opacity`が無い（AndroidのFabric Managerには実装あり→specとの不整合は要実機確認）。iOSはspecを通らないので影響なし。
4. `react-native-google-maps.podspec`は**廃止**され`react-native-maps.podspec`に統合。Google有効化はsubspec方式: `pod 'react-native-maps/Google', :path => rn_maps_path`。`HAVE_GOOGLE_MAPS`はスクリプトフェーズで自動検出され`RNMapsDefines.h`に出力される。
5. 1.27のpodspec要件: **GoogleMaps 9.4.0 / Google-Maps-iOS-Utils 6.1.0 / iOS 15.1+**。現行はGoogleMaps ~7.3 / Utils 4.2.2 / deployment target 16.6 → SDKメジャーアップ（7→9）になるがdeployment target 16.6は要件を満たす ✓

## Phase A: New Arch有効化

### 設定変更
- `android/gradle.properties`: `newArchEnabled=true`
- `ios/Podfile`: `ENV['RCT_NEW_ARCH_ENABLED'] = '1'`
- `app.json`: `"newArchEnabled": true` 追加
- maps 1.14.0＋全パッチは維持（Interop Layer頼み）

### ビルド記録

| # | 内容 | 結果 |
|---|---|---|
| 0 | ベースライン（Old Arch）Android assembleDebug | ✓ 成功 |
| 1 | New Arch Android assembleDebug（app/build, app/.cxxのみ削除） | ✕ reanimatedの`NativeWorkletsModuleSpec`シンボル未解決（codegen生成物がOld Archキャッシュのままで再生成されず） |
| 2 | iOS `pod install`（Pods/Podfile.lock削除後、New Arch codegen） | ✕ post-installの`set_RCTNewArchEnabled_in_info_plist`が「invalid byte sequence in UTF-8」で失敗 |
| 3 | `ios/build-spike-baseline/`（ビルド成果物700MB）をios/外へ移動して再実行 | ✓ **pod install成功**（169 pods、ReactCodegen生成） |
| 4 | デーモン停止＋`:react-native-reanimated:clean`後のAndroid assembleDebug | ✓ **ビルド成功**（APK 153MB。#1の原因はビルド強制killによる増分状態破損） |
| 5 | エミュレータ（Pixel_8a/API 36）で起動 | ✕ ReactInstance生成中にSIGABRT。`RNCSliderProps`（@react-native-community/slider 4.5.5）のFabricコンポーネント記述子登録でヒープ破壊（`Scudo ERROR: invalid chunk state`、ImageSource/pair<string,string>の不正解放） |
| 6 | slider 4.5.5 → **5.2.0** に更新（4.5.5用パッチは除去）して再ビルド・起動 | ✓ **起動成功**。Bridgeless/Fabricモード（`fabric:true`）でJS実行、**地図表示・UrlTileタイルオーバーレイ（地理院地図）・UI全体が正常レンダリング** |

### Android検証結果（Phase A時点）

- **maps 1.14＋自前パッチはNew ArchのInterop Layerで動作する**（地図・タイル表示OK）。Phase Bへの切り分け材料として価値が高い。
- mmkv/Firebase/reanimated 3.19.4/gesture-handler等は起動時点で問題なし（機能スモークは未実施）。
- **非互換 #1: @react-native-community/slider 4.5.5** — Fabric記述子登録時にネイティブクラッシュで起動不能。**5.2.0への更新が必須**。旧4.5.5パッチ（Web版の挙動修正＋podspec調整）は5.xで要否を再確認すること（スパイクでは未移植）。

**教訓**:
- New Arch切替時はapp/buildだけでなく`./gradlew clean`で全ライブラリのcodegen成果物を再生成する必要がある（reanimated等のNativeSpecクラスはNew Arch有効時のみ生成）。
- ビルド途中で強制killするとGradle増分状態が壊れ「ファイルは存在するのにシンボル未解決」になる。`./gradlew --stop`＋対象クリーンで回復。
- New Arch有効時のpod installは`ios/`配下の全Info.plistを走査する（除外は`build/`等のみ）。`ios/`直下にビルド成果物のコピーを置くとバイナリplistで死ぬ → `ios/`外に置くこと。

### iOS検証結果（Phase A時点）

| # | 内容 | 結果 |
|---|---|---|
| 7 | iOS xcodebuild（slider 5.2.0反映前） | ✕ Podsが旧slider構成のまま（`RNCSliderManager.h`欠落）→ slider更新後はpod install必須 |
| 8 | pod install（slider 5.2.0反映）→ xcodebuild | ✓ **BUILD SUCCEEDED**（警告のみ） |
| 9 | iPhone 16 Proシミュレータで起動 | ✓ **起動成功**。地図表示・UrlTileタイルオーバーレイ（地理院地図）・UI正常。LogBox警告あり（非致命的、内容未精査） |

**Phase A結論: New Arch有効化は成功。** maps 1.14＋自前パッチはInterop Layerで両OSとも動作。必須変更はslider 4.5.5→5.2.0のみだった。

### Phase Aで未実施の機能スモーク（Phase C実機検証へ持ち越し）
- [ ] gdalwarp Interop動作（PDFインポート）
- [ ] background-geolocation（トラッキング開始/停止）
- [ ] PMTilesレイヤー表示（パッチ版PMTileがInteropで動くか）
- [ ] 描画ツール（panResponder共存）
- [ ] iOS LogBox警告の内容精査

## Phase B: maps 1.27.2更新

### 実施内容
1. `src/components/atoms/PMTileLayer.tsx` 新設（PMTileスタブ＋props型契約）。`Home.tsx`のimportを切替（pmtiles判定分岐は温存）
2. `patches/react-native-maps+1.14.0.patch` 除去、`react-native-maps@1.27.2` インストール
3. Podfile: `pod 'react-native-google-maps'` → `pod 'react-native-maps/Google'`（サブスペック化）、`$static_framework`から`react-native-google-maps`を除去
4. `npx tsc --noEmit` → **エラー0件**（UrlTileの`tileCachePath`/`offlineMode`/`maximumNativeZ`/`doubleTileSize`は1.27でも型レベルで存続 ✓）

### ビルド・検証記録（Android）

| # | 内容 | 結果 |
|---|---|---|
| 1 | assembleDebug（1回目） | ビルドは通ったが**古い1.14キャッシュのAPK**ができ、起動時に`RNMapsAirModule not found`のRedBox。`:react-native-maps:clean`＋autolinkingキャッシュ削除が必要だった |
| 2 | クリーン後の再ビルド | ✓ 成功（codegen＋Fabricコンパイル実行） |
| 3 | エミュレータ起動 | ✓ **クラッシュなし。地図表示・UrlTile（地理院タイル等）正常レンダリング** |
| 4 | **UrlTile動的ON/OFF（issue #5807再現試験）**: 2レイヤー交互20回＋同一レイヤー高速14連打、地図マウント状態で | ✓ **クラッシュ再現せず**。切替後の地図表示も正常 |

### 環境トラブル（記録）
- `yarn add`後にGradleの`npx`実行がexit 126で失敗する事象が頻発 → 原因は**yarn relinkで`@react-native-community/cli/build/bin.js`等3ファイルの実行権限が消える**こと。`chmod +x`で解決。yarn add後は要注意。

### ビルド・検証記録（iOS）

| # | 内容 | 結果 |
|---|---|---|
| 1 | pod install | ✓（GoogleMaps 7.4.0→9.4.0、maps 1.14.0→1.27.2、旧react-native-google-maps/Protobuf除去。static frameworks構成のまま成功） |
| 2 | xcodebuild（シミュレータ） | ✓ **BUILD SUCCEEDED** |
| 3 | iPhone 16 Proシミュレータで起動 | ✓ クラッシュなし。地図表示・UrlTileタイル表示OK |
| 4 | レイヤー合成の見た目 | ⚠ **陰影起伏図が不透明で下のレイヤーを覆い隠す**。事前調査どおりupstream iOS Google UrlTileは`opacity`非対応（旧パッチで自前追加していた機能）のため、透過度設定が効かない症状と合致。Androidは正常に半透明合成 |

### Phase B結論

**maps 1.27.2はNew Arch構成で両OSともビルド・起動・基本地図表示に成功。** Android側はタイルON/OFF耐性も確認済み（#5807再現せず）。既知の機能ギャップ:
1. **PMTilesレイヤー**: スタブ化中（再実装が必要、想定どおり）
2. **iOS UrlTileのopacity**: upstream未対応 → 透過度付きタイル重ね（陰影起伏図等）が壊れる。再実装パッチのスコープに含める（旧パッチのiOS UrlTile拡張の一部）
3. **hillshade://（DEM）**: 旧パッチ機能。1.27では通常のUrlTile扱いになるため動作しない（要再実装）
4. **iOS オフラインタイル/オーバーズーム/PDF地図**: upstream未対応のまま（要再実装、事前調査どおり）

## Phase C: 検証チェックリスト（実機・手動検証 — 未実施）

シミュレータ/エミュレータで確認済み: 起動、地図表示、UrlTile表示、タイルON/OFF耐性(Android)、地図パン(Android)。
以下は実機での手動確認が必要:

- [ ] 描画ツール全種（panResponder共存、最重要）: ライン/ポリゴン手描き、MapMemo筆・スタンプ
- [ ] Marker: ドラッグ編集、tracksViewChanges、大量表示パフォーマンス
- [ ] Polyline/Polygon/Circle表示とzIndex重ね順（#5774）
- [ ] オフラインタイル: tileCachePath＋offlineMode＋機内モード（**iOSはupstream非対応のため要再実装後に検証**）
- [ ] PDFインポート地図（iOSは要再実装後）
- [ ] gdalwarp（PDF取り込み一気通貫）
- [ ] background-geolocation（トラッキング、バックグラウンド復帰）
- [ ] animateToRegion/animateCamera（GPSボタン）、onRegionChangeComplete、onPanDrag、onPoiClick
- [ ] iOS実機ビルド（シミュレータのみ確認済み）
- [ ] メモリ・起動時間のベースライン比較

## Phase D: PMTiles再実装の工数見積もり

### 1.27.2の構造（コードリーディング結果）

- **JS**: `decorateMapComponent`が実行時にネイティブコンポーネントを解決。**AndroidのみFabric codegen spec経由、iOSはレガシー`requireNativeComponent`経路のまま**（specに`excludedPlatforms: ['iOS']`）。
- **Android**: 2層構造。`com.rnmaps.fabric.XxxManager`（codegen Delegate実装、boilerplate）が`com.rnmaps.maps.MapXxx`（ビジネスロジック、**1.14とほぼ同じ構造**）に委譲。codegen成果物はビルド時自動生成。
- **iOS**: レガシーViewManager＋`AIRGoogleMap.mm`の`insertReactSubview`分岐で子ビューを挿入。**1.14と同じパターン**。podspecのglob（`ios/AirGoogleMaps/**/*.{h,m,mm,swift}`）が新規ファイルを自動で拾う。

### 旧パッチ→1.27の対応付け

| 旧パッチの実装 | 1.27への移植方法 | 分類 |
|---|---|---|
| Android `PMTiles/`(17) `VectorStyle/`(5) `vector_tile/`(1) `MapPMTile(Provider).java` `MapDEMTileProvider.java` | `com.rnmaps.maps`配下にそのままコピー | **ほぼ無修正移植** |
| Android `MapsPackage.java`への登録 | 同じ＋`com.rnmaps.fabric.PMTileManager.java`新規（UrlTileManagerをテンプレに） | 小規模新規 |
| Android `MapUrlTile.java`のhillshade分岐・フェード | 1.27の同ファイルに同じ改変を再適用 | 改変パッチ |
| Android `build.gradle`（protobuf/gson依存） | 同じ追加 | 無修正 |
| JS `lib/MapPMTile.*`（ビルド済みJSパッチ） | `src/MapPMTile.tsx`＋`src/specs/NativeComponentPMTile.ts`（excludedPlatforms: iOS）＋`decorateMapComponent.ts`修正 | **書き直し（小）** |
| iOS `AIRGoogleMapPMTile*` `PMTiles/` `VectorTile/` `AIRGoogleMapDEMTileOverlay` | `ios/AirGoogleMaps/`配下にコピー＋`AIRGoogleMap.mm`の`insertReactSubview`にcase追加 | ほぼ無修正移植＋挿入点修正 |
| iOS `AIRGoogleMapUrlTile`全面書き換え（opacity/offline/オーバーズーム/PDF） | 1.27の同ファイル（中身は1.14とほぼ同じ素朴実装）に旧パッチを再適用 | **改変パッチ（1.14とほぼ同じ差分）** |
| `react-native-google-maps.podspec`（Protobuf依存・非ARC） | `react-native-maps.podspec`のGoogleサブスペックに同等の追記 | 小修正 |

### 見積もり（旧コード移植ベース、iOSはGoogle providerのみ＝Apple Maps側は不要）

| 作業 | 人日 |
|---|---|
| JS層（MapPMTile.tsx＋spec＋decorateMapComponent） | 0.5 |
| Android移植（コピー＋fabric Manager＋登録＋build.gradle） | 1〜1.5 |
| Android DEM/hillshade＋UrlTileフェード再適用 | 0.5 |
| iOS PMTile移植（コピー＋insertReactSubview＋podspec） | 1.5〜2 |
| iOS UrlTile拡張再適用（opacity/offline/オーバーズーム/PDF/DEM） | 1.5〜2 |
| 結合テスト・両OS動作確認（Phase Cチェックリスト消化含む） | 2〜3 |
| **合計** | **7〜9.5人日**（リスクバッファ込みで約2週間枠） |

### 実装形態の推奨

**patch-package継続を推奨**（現行運用と同じ）。理由:
- 1.27でも追加ファイルはpodspec/gradleが自動で拾う構造のため、パッチは「新規ファイル＋少数の既存ファイル改変」で済む
- 旧パッチの26k行は.dex等ビルド成果物の混入が原因。**`.gitattributes`やpatch生成時の除外で数千行規模に抑えられる**
- fork+git依存は更新追従コストが高い。upstream PR（PMTiles対応）は中期的に価値があるが、本体更新をブロックしない

## 本格移行: PMTiles/DEM/iOS UrlTile拡張の再実装（2026-06-10〜11実施）

スパイクのGo判断を受けて旧パッチを1.27.2へ移植し、**新パッチ`patches/react-native-maps+1.27.2.patch`（92ファイル・14,838行・ビルド成果物なし）**として再生成した。

### 実装内容

| 領域 | 内容 |
|---|---|
| JS | `src/MapPMTile.tsx`＋`src/specs/NativeComponentPMTile.ts`（excludedPlatforms: iOS）＋`decorateMapComponent.ts`/`index.ts`修正＋`dist/src/`型定義。**1.27は`main: src/index.ts`なのでlib/のパッチは不要** |
| Android | 旧PMTiles/VectorStyle/vector_tile/MapPMTile系/MapDEMTileProviderを`com.rnmaps.maps`へほぼ無修正移植。`MapUrlTile`にhillshade分岐＋onCameraChange、`MapView`にPMTile addFeature分岐＋カメラidle時のDEM回転通知。fabric用`PMTileManager`新規＋`MapsPackage`登録。protobuf-javalite/gson依存追加 |
| Android codegen | `includesGeneratedCode: true`のため公式codegen（`generate-codegen-artifacts.js`）でDelegate/Interface＋jni C++を再生成してコミット。**再生成でspec進化分の`setAppleLogoInsets`がインターフェースに入るため`MapViewManager`にno-op実装を追加** |
| iOS | 旧AIRGoogleMapPMTile系/DEMTileOverlay/UrlTileOverlay/PMTiles//VectorTile/を移植。`AIRGoogleMapUrlTile`を旧パッチ版に置換（opacity/オフライン/オーバーズーム/PDF復活）。`AIRGoogleMap.mm`にPMTile挿入/削除分岐。podspecのGoogleサブスペックにProtobuf依存＋VectorTile.pbobjc.mの非ARCサブスペック |

### 移植時に必要だった修正（旧コードからの差分）

1. **`template`プロパティのリネーム → `tileTemplate`**: 1.27の`AIRGoogleMap.mm`はObjC++のため、ヘッダー内の`template`がC++キーワードと衝突しコンパイル不能。
2. **PMTilesヘッダー判定の非同期化（iOSの重要バグ修正）**: 旧実装は`updateTileLayer`でヘッダーを同期フェッチ（タイムアウト0.5秒）。FabricではProps適用がメインスレッドで走り、初回HTTPS接続が0.5秒を超えると`tileType=-1`に固定されて全タイルが永久に描画拒否される。バックグラウンドフェッチ＋確定後`clearTileCache`に変更し、`SharedCache`のタイムアウトも10秒に延長。
3. slider 4.5.5→5.2.0（スパイクで判明したNew Arch非互換）。旧sliderパッチ（Web版修正）は未移植——Web版の動作確認時に要否判断。

### 検証結果

| 項目 | Android | iOS |
|---|---|---|
| ビルド | ✓ | ✓ |
| 起動（New Arch/Bridgeless） | ✓ | ✓ |
| 地図表示・UrlTile | ✓ | ✓（**透過合成も復活**） |
| **PMTiles（ラスタ）実描画** | ✓ terrarium_z9.pmtilesで確認 | ✓ 同左（非同期化修正後） |
| UrlTile動的ON/OFF 34回（#5807） | ✓ クラッシュなし | 未実施 |
| tsc / lint / test | ✓ エラー0 / 0 errors / 578 passed | 同左 |

### 未検証（実機・データが必要なもの = Phase Cチェックリスト参照）

- ベクタPMTiles（isVector＋styleURL）、hillshade://（DEM）、オフラインタイル、PDF地図、描画ツール、background-geolocation、gdalwarp、iOS実機

## 追補: Androidタイル取得方式の再移植（2026-06-11）

### 経緯（棚卸し誤判定の訂正）

Phase 0棚卸しの「`MapTileProvider.java`の旧パッチ差分は整形のみ」という判定は**誤り**だった。3バージョン比較（素1.14 / 旧パッチ1.14 / 1.27.2）の結果:

- **本家1.27.2は1.14素のまま**: キャッシュミス時に「WorkManagerへジョブ投入→最大1秒待ち＋固定`Thread.sleep(500)`→キャッシュ再読込」。タイルごとに最低500msのオーバーヘッド、間に合わないと空白タイル。
- **旧パッチは別方式に書き換えていた**: 同期fetch（HEADで存在確認→直接ダウンロード→即表示）。WorkManager/sleepなし。加えて`generateTileFromHigherZoom`（minimumZ未満を上位ズームキャッシュから縮小生成＝**PDF地図表示に必須**）、可変タイルサイズの高解像度合成（`drawDoubleSizeTile`）を実装。
- 1.27には`generateTileFromHigherZoom`相当が無く、AndroidのPDF地図が壊れる状態だった。

### 実施内容

旧パッチ版`MapTileProvider.java`（550行）をそのまま1.27.2へ再適用（セッターのシグネチャはint同士で完全一致、`MapDEMTileProvider`は元々この版を親として書かれているため整合）。パッチ再生成済み。

### 検証結果（エミュレータ）

- 未キャッシュ領域への連続パン: タイル空白なしで即表示、`urlTile`デバッグログ0件（=新コード稼働の証拠。本家方式はログ多数＋sleep）
- 高解像度（doubleTileSize）有効レイヤーの表示: ✓
- オーバーズーム（固定ズーム18超のz20相当）: ✓ 拡大描画
- tsc/lint/テスト578件: ✓
- PDF地図（`generateTileFromHigherZoom`経路）: 実データが必要なため実機確認待ち

## 追補2: タイル地図のOFF不能（孤児TileOverlay）修正（2026-06-11）

### 症状
Androidで「起動時から表示中のタイル地図はOFFにしても消えない。後からONにしたものは正常」。PMTiles/XYZ両方。

### 原因（upstream 1.27のFabricバグ）
`MapView.java`の`addFeature`は`addToMap()`（TileOverlay生成）を先に実行してから`safeAddFeature`で`savedFeatures`へ退避する。MapViewのdetach→reattach（画面遷移・ライフサイクル）で`savedFeatures`が`addFeature`され直すと**`addToMap()`が二重実行され、TileOverlayが2個生成される**。`MapUrlTile.tileOverlay`は最後の1個しか保持しないため、OFF時の`removeFromMap()`は2個目のみremoveし、1個目が孤児として地図に残り続ける。起動時マウントがこの経路に乗りやすい／後からのONはmap準備済みで1回のみ、という症状と一致。

### 修正
タイル系feature（`MapUrlTile`／`MapPMTile`／`MapLocalTile`、`MapWMSTile`はUrlTile継承で自動適用）の`addToMap()`冒頭に、既存`tileOverlay`を`remove()`してnull化する**冪等化ガード**を追加。二重呼び出しされても地図上に常に1個だけになる。`savedFeatures`機構（本家のクラッシュ対策）には非干渉。

### 検証（エミュレータ）
- 起動時ON状態の衛星画像レイヤーをOFF → 地図から消えることを確認（修正前は消えなかった）
- ON→OFF→ON→OFFの往復2回とも正常
- tsc 0エラー

iOSは`AIRGoogleMap`の`_pendingInsertsSubviews`が挿入自体を遅延する設計で二重addにならないため対象外（ユーザー報告でもiOS正常）。

### 既知の残課題
Marker/Polyline/Polygon/Circle等も理論上は同じ二重追加が起こり得るが、それぞれremove時のコレクション管理が異なり今回の修正スコープ外。実害が出たら同様の冪等化を検討。

## 総合結論（Go/No-Go判断材料）

**Go推奨。** スパイクの主要リスクはすべて検証済みで、致命的なブロッカーは見つからなかった。

1. New Arch有効化: 両OSでビルド・起動OK。必須変更は**slider 4.5.5→5.2.0のみ**
2. maps 1.27.2: 両OSでビルド・起動・地図表示OK。**iOS Google Maps継続サポート確認**。Android UrlTileはtileCachePath等フル機能維持＋ON/OFFクラッシュ(#5807)再現せず
3. 再実装スコープは「PMTile＋DEM＋iOS UrlTile拡張」で**7〜9.5人日**。旧パッチコードの大部分が流用可能
4. 残リスク: Phase C実機検証（特に描画ツールのpanResponder共存、オフラインタイル運用）と、iOS UrlTile拡張の再適用が終わるまでiOSのオフライン/PDF/透過度は使えない
