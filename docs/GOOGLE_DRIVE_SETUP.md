# Google Drive個人プロジェクト管理 セットアップガイド

Google Driveを保存先とする個人プロジェクト管理機能（設定 > Google Drive）の外部設定手順です。
コードは実装済みで、以下のGoogle Cloud Console設定とクライアントID設定を行うと有効になります。

## 仕組みの概要

- OAuthスコープは `https://www.googleapis.com/auth/drive.file` のみ（非センシティブ・CASA審査不要）
- アプリが作成したファイル・フォルダにのみアクセスできる。ユーザーのDrive全体は見えない
- `マイドライブ/EcorisMap/` フォルダに「1プロジェクト = 1 .ecorismapファイル（既存のローカル保存と同形式のzip）」で保存
- 上書き保存はDriveの新リビジョンになるため、以前の内容はDrive Web UIの版履歴から復元可能
- Firebaseログインとは独立して動作する（Firebaseアカウント不要）

制約: `drive.file` スコープの性質上、ユーザーがDrive Webへ手動アップロードした
`.ecorismap` ファイルはアプリの一覧に表示されない（アプリが作成したファイルのみ）。

## 1. Google Cloud Console設定

Firebaseプロジェクト（dev: `ecorismap` / prod）はGCPプロジェクトなので、それをそのまま使う。
dev/prod両系統で以下を行う（Web版の生成元URLだけ環境に合わせて変える）。

### 1-1. Google Drive APIを有効化

「APIとサービス」>「ライブラリ」>「Google Drive API」>「有効にする」

**先にこれを行うこと。** 有効化しないと次のスコープ一覧にDrive系のスコープが表示されない。

### 1-2. OAuth同意画面にスコープを追加

新UIでは「OAuth同意画面」を開くと「**Google Auth Platform**」画面になり、
左側にサブメニュー（概要 / ブランディング / 対象 / クライアント / データアクセス / 確認センター）が出る。

1. 「**データアクセス (Data Access)**」を開く
2. 「**スコープを追加または削除**」をクリック
3. 右側のパネルでフィルタに `drive.file` と入力し、「Google Drive API」の
   **`.../auth/drive.file`** にチェック
   - 一覧に出ない場合はパネル下部の「スコープの手動追加」に
     `https://www.googleapis.com/auth/drive.file` を貼り付けて「表に追加」
4. 「更新」→ ページ下部の「**保存**」
5. 追加後、「**非機密のスコープ**」の欄に入っていることを確認（非センシティブなので再審査は発生しない）

さらに「**対象 (Audience)**」ページで**公開ステータスを「本番環境」にする**。
テストモードのままだとリフレッシュトークンが7日で失効し、モバイルの再サインインや
Webのサイレント再発行が壊れる。

### 1-3. OAuthクライアントIDを作成

「APIとサービス」>「認証情報」> 上部の「**+ 認証情報を作成**」>「**OAuth クライアント ID**」
（新UI: 「Google Auth Platform」>「クライアント」>「+ クライアントを作成」でも同じ）

「アプリケーションの種類」を選んで以下を作成する。

#### ① ウェブアプリケーション（Web版GIS + Androidの`webClientId`兼用）

- 名前: 例 `EcorisMap Web Drive`
- **承認済みのJavaScript生成元**:
  - `http://localhost:8081`（`yarn web` の開発用）
  - 本番WebのホスティングURL
- 承認済みのリダイレクトURI: 空でOK（GISトークンクライアントは使わない）
- 作成後に表示されるクライアントID → **`webClientId`**

#### ② iOS

- 名前: 例 `EcorisMap iOS Drive`
- **バンドルID**: `jp.co.ecoris.ecorismap`（App Store ID / チームIDは空でOK）
- 作成後に表示される:
  - クライアントID → **`iosClientId`**
  - 「**iOS URLスキーム**」（`com.googleusercontent.apps.xxxx`）→ 「3. iOS設定」のURLスキームに使う

#### ③ Android（登録のみ・コードでは未使用）

Android型は**1クライアントにつきSHA-1を1つ**しか登録できないため、署名の数だけ作る:

| クライアント名（例） | SHA-1の取得元 |
|---|---|
| `EcorisMap Android debug` | debugキーストア |
| `EcorisMap Android release` | releaseキーストア |
| `EcorisMap Android play` | Play Console > 設定 > アプリの完全性 > アプリ署名鍵の証明書 |

- **パッケージ名**: `jp.co.ecoris.ecorismap`
- **SHA-1証明書フィンガープリント**: 以下で確認
  ```bash
  cd android && ./gradlew signingReport
  ```
  出力の `Variant: debug` / `Variant: release` それぞれの `SHA1:` 行の値を使う。

## 2. クライアントIDの配置

`keys/{development,production}/googleDriveOAuth.ts` を作成する:

```typescript
export const googleDriveOAuth = {
  webClientId: 'xxxx.apps.googleusercontent.com', // ウェブアプリケーション型
  iosClientId: 'yyyy.apps.googleusercontent.com', // iOS型
};
```

`yarn keys:apply` 実行時に `src/constants/APIKeys.ts` へ自動で組み込まれる
（未配置の場合は空値で生成され、接続ボタン押下時にエラーメッセージが出るだけで他機能に影響しない）。

## 3. iOS設定（Info.plist）

`ios/ecorismap/Info.plist` の `CFBundleURLTypes` に、**iOS型クライアントIDの逆順文字列**
（例: `com.googleusercontent.apps.yyyy`）をURLスキームとして追加する:

```xml
<key>CFBundleURLTypes</key>
<array>
  <!-- 既存のエントリはそのまま -->
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.yyyy</string>
    </array>
  </dict>
</array>
```

`GIDClientID` キーは不要（`GoogleSignin.configure({ iosClientId })` でコードから渡している）。
dev/prodでiOSクライアントIDを分ける場合はURLスキームも切り替えが必要な点に注意。

## 4. Android設定

コード側の設定は不要。「1-3. ③」のAndroid型クライアント登録だけでよい
（`webClientId` はコードからウェブアプリケーション型のIDを渡している）。

## 5. 動作確認

1. `yarn web` → 設定 > Google Drive → 接続 → 保存 → Drive Web UIで `EcorisMap/` にファイル確認
2. 別ブラウザプロファイル（同じGoogleアカウント）で読み込み → データ復元確認
3. iOS/Android実機: 同フロー + 写真込み20MB超データでのアップロード進捗・中断再開

## 実装ファイル

- `src/lib/googledrive/` — 認証（auth.ts / auth.web.ts）、REST APIクライアント（driveApi.ts）、
  転送（driveTransfer.ts / .web.ts）、ドメイン層（driveProjectStore.ts）
- `src/hooks/useGoogleDriveProjects.ts` — UI向けフック
- `src/containers/GoogleDriveProjects.tsx` ほかUI一式
- `src/modules/googleDrive.ts` — 同期記録（競合検知用のheadRevisionId等）
- 機能フラグ: `src/constants/AppConstants.tsx` の `FUNC_GOOGLE_DRIVE`
