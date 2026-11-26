# リリース前チェックリスト

ストアへ提出する前に実機（またはエミュレータ/シミュレータ）で確認する項目。
ユニットテストはネイティブモジュール（expo-media-library, expo-image-picker, expo-file-system など）を
モックしているため、**ライブラリの更新で入口の挙動が変わった種類のデグレは検出できない**。
特にExpo/React Nativeのメジャー更新を含むリリースでは、下記の「手動で確かめる項目」を必ず実機で通すこと。

バージョン・ストア申告まわりは `docs/STORE_SUBMISSION_ANALYTICS.md` の「提出時チェックリスト」を参照。

## 自動チェック（コミット前）

- [ ] `npx tsc --noEmit`
- [ ] `yarn lint`（`expo-media-library` ルートimport禁止ルールを含む）
- [ ] `yarn test`

## E2Eテスト（Web / iOS / Android）

確かめる項目の一覧は `docs/E2E_TEST_ITEMS.md`（台帳。アプリの機能一覧を兼ねる）にある。
台帳の「自」の行は下のコマンドで流し、「手」「予」の行は端末で操作して確かめる。

### 自動テスト

- [ ] `yarn e2e:web`（Web。Playwright。開発サーバーは自動で起動する）
- [ ] `yarn e2e:web:emu`（Webのログイン範囲: アカウント・共有プロジェクト。Firebaseエミュレータにつなぎ、暗号化は使わない）
- [ ] `yarn testrules`（サーバー側の通し: 同期・権限・写真。Firebaseエミュレータ、Java 21）
- [ ] `yarn e2e:ios`（iOSシミュレーター。Maestro）
- [ ] `yarn e2e:android`（Androidエミュレーター。Maestro）
- [ ] データをクリア→自動バックアップから復元（台帳の SET-2・SET-3）。端末のデータを消すので、上の2つでは流れない。
  テスト専用の端末で `scripts/e2e-native.sh ios 90` / `scripts/e2e-native.sh android 90`
  （全フローと一緒に流すときは `E2E_ALLOW_CLEAR=1 yarn e2e:ios`）。
  復元で記録は戻るが、地図の設定は初期化され、自動バックアップは5世代までなので古い世代が1つ押し出される

iOSとAndroidは同時に流さず、順番に実行する。ネイティブの前提:

- Maestroのインストール: `brew install mobile-dev-inc/tap/maestro`（Homebrew標準の`maestro`は別製品）
- 端末はログインしておらずプロジェクトを開いていない状態で、言語は日本語であること。
  既定の「ポイント」レイヤにテスト用レコードを作って最後に消す（すでに記録があっても動く）。途中で失敗して残ったときは
  `maestro test e2e/maestro/photo/99-delete-all-test-records.yaml`（レイヤの全レコードを消すのでテスト専用端末でのみ）
- デバッグビルドで回すときはMetro（`yarn start`）を起動しておく
- Androidはエミュレーターを先に起動しておく。実機がつながっていても、`DEVICE`を指定しない限りエミュレーターにだけ流す
- 写真の経路だけ流すときは `yarn smoke:photo ios <ビルドした ecorismap.app のパス>` / `yarn smoke:photo android`
  （iOSは .app を渡すと入れ直しを挟み、データコンテナが変わっても原画で開けることを確かめる）
- 画面要素は`testID`で特定している（一覧は `e2e/TESTIDS.md`）。消したり名前を変えたりしたらテストも直す

### 手動で確かめる項目

- [ ] 台帳の iOS 列が「手」「予」の行を、iOS（実機を含む）で通した
- [ ] 台帳の Android 列が「手」「予」の行を、Android（実機を含む）で通した
- [ ] 台帳の Web 列が「手」「予」の行を、Webで通した

ユニットテストも自動E2Eも届かず、過去に実際に壊れた経路。ライブラリを更新したリリースでは特に落とさないこと。

- [ ] **写真**（PHOTO-A2・A3）: カメラボタンで撮影 → サムネイルが出て保存ボタンが有効になる → 保存 → 開き直して写真が残り、カメラロールにも入っている
      （0.6.0〜0.6.7で `expo-media-library` の入口変更により保存されなかった。[CHANGELOG 0.6.8]）
- [ ] **Android・写真**（PHOTO-A4）: 開発者オプション「アクティビティを保持しない」をONにして撮影 → 編集画面が開き直り写真が付いている
      （復帰は `usePendingPhotoCapture` ＋ expo-modules-core のパッチで実現）
- [ ] **軌跡**（TRACK-2）: 15分以上、画面OFFのまま移動し、アプリを開き直しても記録が途切れず点が重複しない
      （位置情報ライブラリ react-native-background-geolocation を更新したリリースでは必須）
- [ ] **PMTiles・外部GNSS**（MAPS-7、GNSS-1〜7）: Android は R8 ビルド（リリースビルド）で確かめる
- [ ] **3D・眺望**（ANLY-3〜9）: Android は実機で必ず確かめる（エミュレーターとGPUが異なる）。しばらく操作して極端なカクつき・発熱・クラッシュがない
- [ ] **回転**（MAP-2）: 回転中も現在地マーカー・線の矢印が実際の方角を向く。作図・ツール使用中は回転しない
- [ ] **認証・同期**（ACCT-1・7、PROJ-5・6、DRIVE-1〜3）: ログイン（Google / 組織アカウント）とログアウト、プロジェクトの送信・取得（暗号化の往復）

## 更新情報・ドキュメント
- [ ] アプリ内「更新情報」が今回の内容になっている（OS固有の修正は載せない）
- [ ] `CHANGELOG.md` の日付を確定
- [ ] マニュアル（websiteリポジトリ）の追従が必要なら反映
