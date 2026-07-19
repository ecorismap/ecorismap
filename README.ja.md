EcorisMap
===================================
EcorisMapは、野外調査で位置情報を記録、確認できるクロスプラットフォーム対応のフィールド調査アプリケーションです。

## 公式サイト
- https://ecorismap.web.app

## ドキュメント
- [日本語版ドキュメント](https://ecorismap.web.app/manual_ja.html)
- [英語版ドキュメント](https://ecorismap.web.app/manual_en.html)

---
## 基本セットアップ（Firebase不要）

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
   1-1. キーの制限に本番用のSHA-1証明書とデバッグ用のSHA-1証明書を追加
       - デバッグ用SHA-1証明書の取得：
         ```bash
         cd android
         ./gradlew signingReport
         ```
       - 本番用SHA-1証明書はGoogle Play Consoleから取得し、後で追加

2. テンプレートから`local.properties`を作成：
   ```bash
   cp template/local.properties android/
   ```
3. `android/local.properties`を編集してAPIキーを追加：
   ```
   MAPS_API_KEY=YOUR_ANDROID_MAPS_API_KEY
   ```

4. （任意）バックグラウンド位置追跡機能を使用する場合、Transistorsoftライセンスキーを追加：
   ```
   TRANSISTORSOFT_LICENSE_KEY="YOUR_LICENSE_KEY"
   ```
   > ライセンスキーは[Transistorsoft](https://shop.transistorsoft.com/)から取得してください。有効なライセンスがない場合、トラッキング機能はデバッグモードでのみ動作します。

5. （任意）リリースビルド用にKeystore設定を追加：
   ```
   MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
   MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
   MYAPP_UPLOAD_STORE_PASSWORD=*****
   MYAPP_UPLOAD_KEY_PASSWORD=*****
   ```
   
   リリースビルド用のkeystoreを作成する方法：
   ```bash
   cd android/app
   keytool -genkeypair -v -storetype PKCS12 -keystore my-upload-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
   ```
   
   > **重要**: keystoreファイルとパスワードは安全に保管してください。絶対にバージョン管理システムにコミットしないでください。

#### iOS
1. [iOS SDK用のAPIキー](https://developers.google.com/maps/documentation/ios-sdk/get-api-key)を取得
2. Maps.plistテンプレートをコピー：
   ```bash
   cp template/Maps.plist ios/ecorismap/
   ```
3. `ios/ecorismap/Maps.plist`を編集してAPIキーを追加

4. （任意）バックグラウンド位置追跡機能を使用する場合、Transistorsoftライセンスキーを`ios/ecorismap/Supporting/TSLicense.txt`に保存（キーのみ1行）：
   ```bash
   echo "YOUR_LICENSE_KEY" > ios/ecorismap/Supporting/TSLicense.txt
   ```
   > ビルド時にXcodeのビルドフェーズがInfo.plistの`TSLocationManagerLicense`へ自動注入します。ファイルがない場合は警告のみでビルドは成功し、トラッキング機能はデバッグモードでのみ動作します。

#### Web（MapTiler）
1. [MapTiler用のAPIキー](https://cloud.maptiler.com/maps/)を取得
2. APIKeysテンプレートをコピー：
   ```bash
   cp template/APIKeys.ts src/constants/
   ```
3. `src/constants/APIKeys.ts`を編集してキーを追加（クォーテーション付き）：
   ```typescript
   export const maptilerKey = 'YOUR_MAPTILER_API_KEY';
   ```

### 3. GDALモジュールのセットアップ
```bash
# GDALモジュールのダウンロード
wget https://github.com/tmizu23/build_gdal_android_ios/releases/download/v0.0.2/react-native-gdalwarp.zip
unzip react-native-gdalwarp.zip
cp -r react-native-gdalwarp modules/
rm -rf react-native-gdalwarp react-native-gdalwarp.zip
```

### 4. 開発サーバーの起動
```bash
yarn ios           # iOSシミュレータ
yarn android       # Androidエミュレータ  
yarn web           # Webブラウザ
```

> **補足**: ログイン関連機能は単一ビルドに統合されているため、ビルド時のフラグ切り替え（旧`FUNC_LOGIN`）は不要です。Firebaseを設定しなくてもアプリはそのまま動作し、ローカルでの地図表示・データ記録が利用できます。ログイン・プロジェクト共有機能を使う場合は次の「高度なセットアップ」を行ってください。

---

## 高度なセットアップ（ログイン機能付き）

高度なセットアップでは、Firebaseを使用したユーザー認証、データ保存、サーバーサイド機能を追加します。

ログインは2系統あります：

- **Googleアカウント連携**: Google Driveを保存先とする個人プロジェクト管理（設定 → データ保存/読み込みから利用）。Firebaseアカウントは不要です。設定手順は[docs/GOOGLE_DRIVE_SETUP.md](docs/GOOGLE_DRIVE_SETUP.md)を参照
- **組織アカウント**: Firebaseメール/パスワード認証によるプロジェクト共有。新規登録はCloud Functionsのblocking function（Secret Managerの`ORG_ALLOWED_DOMAINS`/`ORG_ALLOWED_EMAILS`）で許可されたドメイン・メールアドレスに制限されます

> **注意**: 以下の設定例では `ecorismap`（プロジェクト名）や `jp.co.ecoris.ecorismap`（バンドルID）などの固有の識別子を使用していますが、これらは実際のプロジェクトに合わせて適切な値に置き換えてください。

### 1. Firebaseのセットアップ

#### Firebase Consoleでの初期設定

##### プロジェクトの作成
1. [Firebase Console](https://console.firebase.google.com)にアクセス
2. 「ecorismap」という名前で新しいプロジェクトを作成
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

2. Play Integrityの設定（Android）：
   - Play ConsoleをFirebaseプロジェクトにリンク：
     1. Play Console → 対象アプリ → アプリの完全性 → Play Integrity API に移動
     2. 「クラウドプロジェクトをリンク」をクリック
     3. リストからFirebaseプロジェクトを選択（または新規作成）
     4. リンク処理を完了する
   
   - SHA-256証明書を追加：
     1. Play Console → アプリの完全性 に移動
     2. 「アプリ署名鍵の証明書」からSHA-256証明書フィンガープリントをコピー
     3. Firebase Console → プロジェクト設定 → Androidアプリに追加

3. Web用reCAPTCHAの設定：
   - [Google reCAPTCHA](https://www.google.com/recaptcha/admin)でキーペアを作成
   - サイトキーをsrc/constants/APIKeys.tsに追加
   - シークレットキーをFirebase ConsoleのApp Check設定に追加

4. 開発環境用デバッグトークン：

   **Androidデバッグトークン**
   ```bash
   # エミュレータ/実機でアプリを実行
   # logcatからデバッグトークンを取得
   adb logcat | grep DebugAppCheckProvider
   
   # 以下のような出力を探す：
   # D DebugAppCheckProvider: Enter this debug secret into the allow list in the Firebase Console for your project: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
   ```
   
   **iOSデバッグトークン**
   - シミュレータ/実機でアプリを実行
   - Xcodeコンソールでデバッグトークンを確認
   - 次の形式で表示されます: `Firebase App Check debug token: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
   
   **Webデバッグトークン（自動生成）**
   - ローカル開発時は自動的にデバッグモードが有効化されます：
     - 開発環境で実行している場合（`NODE_ENV === 'development'`）
     - localhostからアクセスしている場合
     - Firebaseエミュレータを使用している場合
   - ブラウザコンソールを開いてデバッグトークンを確認
   - 形式: `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
   
   **デバッグトークンの登録**
   1. Firebase Console → App Checkに移動
   2. 対象のアプリ（Android/iOS/Web）を選択
   3. 「管理」→「デバッグトークン」をクリック
   4. コンソール出力から取得したトークンを追加
   5. わかりやすい名前を付ける（例：「開発デバイス」、「iOSシミュレータ」、「localhost開発」）

##### プラットフォーム別アプリの追加

**Androidアプリ**
1. 「アプリを追加」→「Android」を選択
2. 設定項目：
   - パッケージ名: `jp.co.ecoris.ecorismap`
   - SHA-1証明書: 
     ```bash
     # デバッグ証明書（開発用）
     cd android && ./gradlew signingReport
     ```
3. `google-services.json`をダウンロードして`android/app/`に配置
4. リリース用: Play ConsoleのSHA-256証明書も後で追加

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


### 2. Firebase Functionsのセットアップ

Firebase Functionsはサーバーサイド機能を提供し、Virgil E3Kitを使用したエンドツーエンド暗号化や組織アカウントの登録制限（blocking function）に必須です。

詳細な設定、デプロイ手順、トラブルシューティングについては、[ecorismap/functions](https://github.com/ecorismap/functions)リポジトリのREADME.ja.mdを参照してください。

### 3. Firebase Hostingのセットアップ

Firebase HostingはWeb版アプリケーションをホスティングするために使用します。

詳細な設定、デプロイ手順については、[ecorismap/website](https://github.com/ecorismap/website)リポジトリのREADME.ja.mdを参照してください。

### 4. Google Drive連携のセットアップ（任意）

Google Driveを保存先とする個人プロジェクト管理を有効にするには、Google Cloud ConsoleでOAuthクライアントID（スコープは`drive.file`のみ）を作成し、`src/constants/APIKeys.ts`の`googleDriveOAuth`に設定します：

```typescript
export const googleDriveOAuth = {
  webClientId: 'YOUR_WEB_CLIENT_ID',
  iosClientId: 'YOUR_IOS_CLIENT_ID',
};
```

空文字列のままの場合、Google Drive連携は「利用不可」として安全に無効化されます。詳細な手順は[docs/GOOGLE_DRIVE_SETUP.md](docs/GOOGLE_DRIVE_SETUP.md)を参照してください。

---

## APIキー設定の管理

APIキーと各プラットフォームの設定ファイルは、gitignore対象の`keys/`ディレクトリで管理し、1コマンドで反映します。

### キーファイルの設定方法

1. 設定ファイルを`keys/`ディレクトリに配置：
   ```
   keys/
   ├── google-services.json
   ├── GoogleService-Info.plist
   ├── firebaseConfig.ts
   ├── googleDriveOAuth.ts
   ├── maps-key-android
   ├── maps-key-ios
   ├── maptilerKey
   ├── reCaptureSiteKey
   ├── keystore-config
   └── transistorsoft-license-key(-android/-ios)
   ```

2. キーの反映コマンド：
   ```bash
   yarn keys:apply
   ```

   このコマンドにより、自動的に設定ファイルが以下の場所にコピーされます：
   - `android/app/google-services.json`
   - `android/local.properties`（Maps APIキー、Transistorsoftライセンス、Keystore設定）
   - `ios/ecorismap/GoogleService-Info.plist`
   - `ios/ecorismap/Supporting/Maps.plist`
   - `ios/ecorismap/Supporting/TSLicense.txt`（Transistorsoftライセンス）
   - `src/constants/APIKeys.ts`（Firebase設定、reCAPTCHA、MapTiler、Google Drive OAuth）

**重要：** すべての環境別設定ファイルとバックアップは`.gitignore`に登録されており、機密データが誤ってコミットされることを防いでいます。


## ライセンス
このソフトウェアはMITライセンスの下でリリースされています。LICENSEを参照してください。

_Copyright (c) 2022 ECORIS Inc._