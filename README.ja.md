EcorisMap
===================================
EcorisMapは、野外調査で位置情報を記録、確認できるクロスプラットフォーム対応のフィールド調査アプリケーションです。

## 公式サイト
- https://ecoris-map.web.app

## ドキュメント
- [日本語版ドキュメント](https://ecoris-map.web.app/manual_ja.html)
- [英語版ドキュメント](https://ecoris-map.web.app/manual_en.html)

---
## セットアップ（ログイン機能なし）

### 必要な環境
- Node.js >= 22
- Yarn 3.6.4
- Xcode（iOS開発用）
- Android Studio（Android開発用）

### 1. リポジトリのクローンと依存関係のインストール
```bash
git clone https://github.com/ecorismap/ecorismap.git
cd ecorismap
yarn install
```

### 2. Maps APIキーの設定

#### Android
1. [Android SDK用のAPIキー](https://developers.google.com/maps/documentation/android-sdk/get-api-key)を取得
2. テンプレートから`local.properties`を作成：
   ```bash
   cp template/local.properties android/
   ```
3. `android/local.properties`を編集してAPIキーを追加：
   ```
   MAPS_API_KEY=YOUR_ANDROID_MAPS_API_KEY
   ```

#### iOS
1. [iOS SDK用のAPIキー](https://developers.google.com/maps/documentation/ios-sdk/get-api-key)を取得
2. Maps.plistテンプレートをコピー：
   ```bash
   cp template/Maps.plist ios/ecorismap/
   ```
3. `ios/ecorismap/Maps.plist`を編集してAPIキーを追加

#### Web（MapTiler）
1. [MapTiler用のAPIキー](https://cloud.maptiler.com/maps/)を取得
2. APIKeysテンプレートをコピー：
   ```bash
   cp template/APIKeys.ts src/constants/
   ```
3. `src/constants/APIKeys.ts`を編集してキーを追加（クォーテーション付き）：
   ```typescript
   export const MAPTILER_API_KEY = 'YOUR_MAPTILER_API_KEY';
   ```

### 3. GDALモジュールのセットアップ
```bash
# GDALモジュールのダウンロード
wget https://github.com/tmizu23/build_gdal_android_ios/releases/download/v0.0.1/react-native-gdalwarp.zip
unzip react-native-gdalwarp.zip
cp -r react-native-gdalwarp modules/
rm -rf react-native-gdalwarp react-native-gdalwarp.zip
```

### 4. ログイン機能の無効化
基本セットアップではログイン機能を無効にします。`src/constants/AppConstants.ts`を編集：
```typescript
export const FUNC_LOGIN = false;  // ログイン機能を無効化
```

### 5. 開発サーバーの起動
```bash
yarn ios           # iOSシミュレータ
yarn android       # Androidエミュレータ  
yarn web           # Webブラウザ
```

---

## 高度なセットアップ（ログイン機能付き）

高度なセットアップでは、Firebaseを使用したユーザー認証、データ保存、サーバーサイド機能を追加します。

> **注意**: 以下の設定例では `ecoris-map`（プロジェクト名）や `jp.co.ecoris.ecorismap`（バンドルID）などの固有の識別子を使用していますが、これらは実際のプロジェクトに合わせて適切な値に置き換えてください。

### 1. ログイン機能の有効化
`src/constants/AppConstants.ts`を編集してログイン機能を有効にします：
```typescript
export const FUNC_LOGIN = true;  // ログイン機能を有効化
```

### 2. Firebaseのセットアップ

#### Firebase Consoleでの初期設定

##### プロジェクトの作成
1. [Firebase Console](https://console.firebase.google.com)にアクセス
2. 「ecoris-map」という名前で新しいプロジェクトを作成
3. Blazeプラン（従量課金制）にアップグレード（Functions利用に必要）

##### Firebase Consoleでの各種サービス設定

**Authentication（認証）**
1. メール/パスワード認証を有効化
2. 承認済みドメインを設定

**Firestore Database**
1. データベースを作成（asia-northeast1 東京リージョン推奨）
2. セキュリティルールを設定：
   - 「ルール」タブに移動
   - `firestore.rules`の内容をコピーして貼り付け（またはテンプレートを編集）
   - 「公開」をクリックしてルールを適用
3. 開発中にコンソールに表示されるエラーに従ってインデックスを設定

**Storage**
1. Firebase Storageを有効化（asia-northeast1 東京リージョン推奨）
2. セキュリティルールを設定：
   - 「ルール」タブに移動
   - `storage.rules`の内容をコピーして貼り付け（またはテンプレートを編集）
   - 「公開」をクリックしてルールを適用

**App Check（セキュリティ）**
1. App Checkを有効化：
   - Web: reCAPTCHA v3を選択
   - Android: Play Integrityを選択
   - iOS: App Attestを選択

2. Web用reCAPTCHAの設定：
   - [Google reCAPTCHA](https://www.google.com/recaptcha/admin)でキーペアを作成
   - サイトキーをsrc/constants/APIKeys.tsに追加
   - シークレットキーをFirebase ConsoleのApp Check設定に追加

3. 開発環境用デバッグトークン（Android）：
   ```bash
   # デバッグトークンの取得
   adb logcat | grep DebugAppCheckProvider
   # 表示されたトークンをFirebase ConsoleのApp Check > デバッグトークンに追加
   ```

##### プラットフォーム別アプリの追加

**Androidアプリ**
1. 「アプリを追加」→「Android」を選択
2. 設定項目：
   - パッケージ名: `jp.co.ecoris.ecorismap`
   - SHA-1証明書: `cd android && ./gradlew signingReport`で取得
3. `google-services.json`をダウンロードして`android/app/`に配置
4. リリース用: Play ConsoleのSHA-1証明書も後で追加

**iOSアプリ**
1. 「アプリを追加」→「iOS」を選択
2. 設定項目：
   - バンドルID: `jp.co.ecoris.ecorismap`
3. `GoogleService-Info.plist`をダウンロード
4. Xcodeで`ios/ecorismap/`にドラッグして追加（重要: Xcodeで追加すること）

**Webアプリ**
1. 「アプリを追加」→「Web」を選択
2. アプリのニックネーム: EcorisMap Web
3. Firebase Hostingも設定する場合はチェック
4. 表示される設定をコピーしてsrc/constants/APIKeys.tsに追加



### 3. Firebase Functionsのセットアップ

Firebase Functionsはサーバーサイド機能を提供し、Virgil E3Kitを使用したエンドツーエンド暗号化に必須です。

詳細な設定、デプロイ手順、トラブルシューティングについては、[functions/README.ja.md](../functions/README.ja.md)を参照してください。

### 4. Firebase Hostingのセットアップ

Firebase HostingはWeb版アプリケーションをホスティングするために使用します。

詳細な設定、デプロイ手順については、[website/README.ja.md](../website/README.ja.md)を参照してください。



## ライセンス
このソフトウェアはMITライセンスの下でリリースされています。LICENSEを参照してください。

_Copyright (c) 2022 ECORIS Inc._