# E2Eテスト

リリース前に、Web / iOS / Android で正常系を一通り確かめるためのテスト。
確かめる項目の一覧（＝機能一覧）は `docs/E2E_TEST_ITEMS.md` の台帳にあり、ここのテストは台帳のIDと対応する。

| ディレクトリ | 道具 | 対象 | コマンド |
|---|---|---|---|
| `web/` | Playwright Test | Web。機能を広く通す | `yarn e2e:web` |
| `web/specs-emu/` | Playwright Test + Firebaseエミュレータ | Webのログインが要る範囲（アカウント・共有プロジェクト） | `yarn e2e:web:emu` |
| `maestro/smoke/` | Maestro | iOSシミュレーター・Androidエミュレーター。ネイティブ固有の経路だけ | `yarn e2e:ios` / `yarn e2e:android` |
| `maestro/photo/` | Maestro | 写真の経路（上のコマンドの最後にも流れる） | `yarn smoke:photo ios\|android` |

サーバー側（同期・権限・写真の保存）の通しは `src/lib/__tests__/firebase/` にあり、`yarn testrules` で流す。

## 書き方の決まり

- テスト名・フロー名の先頭に台帳のID（`LAYER-2` など）を付ける。テストを足したら台帳の「シミュ」を「自」に変え、ファイルのパスを入れる
- 画面要素は `testID` で指定する（Webでは `data-testid` になる）。一覧は `TESTIDS.md`。
  確認ダイアログのボタンなど、文言で一意に決まるものは文言で指定してよい（端末・ブラウザの言語は日本語で流す）
- 地図上の操作は座標で行い、結果はデータ一覧の件数や画面の表示で確かめる。地図の描画（見た目）は検証しない
- スクリーンショット・レポート・トレースはリポジトリの外へ出す（リポジトリ内に書くとMetroが変更として拾い、再読み込みが走る）
- Webは起動直後の十数秒、端末内への保存が書き出されない。再読み込みをまたぐテストは `waitForPersisted` で書き出しを待つ
- ネイティブのフローは、テスト用のレコードを自分で作って自分で消す。途中で失敗しても次のフローが動くよう、各フローの最初で前提を整える

## Web

```bash
yarn e2e:web                          # 全部
yarn e2e:web specs/02-layers.spec.ts  # 1ファイル
yarn e2e:web -g LAYER-2               # 台帳のIDで絞る
yarn e2e:web --headed                 # ブラウザを表示して流す
yarn playwright show-report "$TMPDIR/ecorismap-e2e-web/report"   # 失敗時のレポート
```

開発サーバー（`yarn web`、8081番）が起動していなければ自動で起動する。別のポートで流すときは `E2E_PORT` を指定する。

## Web（ログインが要る範囲）

```bash
yarn e2e:web:emu              # 全部（エミュレータの起動から片付けまで行う）
yarn e2e:web:emu -g PROJ-5    # 台帳のIDで絞る
```

- Firebaseエミュレータ（Auth / Firestore / Storage）につなぐ。本番のFirebaseにはつながない。Java 21 が要る
- 開発サーバーは、環境変数 `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1` つきで 8082 番に別に立つ（`E2E_EMU_PORT` で変更）。
  この変数は開発ビルドでだけ効き、本番のバンドルにはエミュレータへの経路ごと入らない
- このとき暗号化（Virgil）は使わない（`FUNC_ENCRYPTION` が切れる）。確かめるのは画面の流れで、
  暗号化込みの動きは `yarn testrules` と実機の手動確認で確かめる。PINや鍵の画面は出ない
- テスト用のアカウント（オーナー・メンバー）は毎回エミュレータの中に作る（`support/emu.ts`）
- メールアドレスからuidを引く関数（Cloud Functions、別リポジトリ）は動かさず、テスト側が代わりに応える（`stubFunctions`）
- エミュレータの中身は全テストで共有する。テストごとに別の名前のプロジェクトを作り、名前で探す
- 書きながら試すときは、`firebase emulators:start --project demo-ecorismap-e2e --only auth,firestore,storage` を
  立てたまま `npx playwright test -c e2e/web/playwright.emu.config.ts` を流すと速い

## ネイティブ

前提は `scripts/e2e-native.sh` の冒頭を参照。Androidは実機がつながっていてもエミュレーターにだけ流す。

```bash
yarn e2e:ios              # 全フロー
yarn e2e:android 02 04    # 番号で選んで流す
```
