#!/bin/bash
# 写真経路のスモークテスト（Maestro）。ユニットテストはネイティブモジュールをモックしているため、
# 「撮影・選択した写真が保存され、開き直しても原画で開ける」ことは実際にアプリを動かして確かめる。
#
#   scripts/smoke-photo.sh ios [アプリの.appパス]   iOSシミュレーター（ライブラリ選択。.appを渡すと入れ直しを挟む）
#   scripts/smoke-photo.sh android                  Android実機・エミュレーター（カメラ撮影）
#
# 前提:
# - Maestroが入っていること（https://docs.maestro.dev/）
# - アプリがインストール済みで、ログインしておらずプロジェクトを開いていない端末
#   （既定の「ポイント」レイヤにテスト用レコードを1件作り、最後に削除する）
# - デバッグビルドのときはMetro（yarn start）が起動していること
# - 端末の言語は日本語
set -euo pipefail

PLATFORM="${1:-}"
APP_PATH="${2:-}"
FLOWS="$(cd "$(dirname "$0")/.." && pwd)/e2e/maestro/photo"
APP_ID="jp.co.ecoris.ecorismap"

if ! command -v maestro >/dev/null 2>&1; then
  echo "maestro が見つかりません。https://docs.maestro.dev/ の手順でインストールしてください" >&2
  exit 1
fi

# 利用統計の送信はしない
export MAESTRO_CLI_NO_ANALYTICS=1
# スクリーンショットはリポジトリの外へ出す（リポジトリ内に書くとMetroが変更として拾う）
OUT="${SMOKE_OUT:-$(mktemp -d)}"
cd "$OUT"

case "$PLATFORM" in
  ios)
    # 複数の端末がつながっていてもMaestroが選択を求めないよう、起動中のシミュレーターを明示する
    DEVICE="${DEVICE:-$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}-[0-9A-F-]{27}' | head -1)}"
    [ -n "$DEVICE" ] || { echo "起動中のiOSシミュレーターがありません" >&2; exit 1; }
    maestro --device "$DEVICE" test "$FLOWS/01-add-from-library.yaml"
    if [ -n "$APP_PATH" ]; then
      # 入れ直すとデータコンテナのUUIDが変わる。保存済みの写真uriが古いコンテナを指しても
      # 原画を参照できること（起動時の付け替え）を、次のフローで確かめる
      xcrun simctl terminate "$DEVICE" "$APP_ID" || true
      xcrun simctl install "$DEVICE" "$APP_PATH"
    fi
    maestro --device "$DEVICE" test "$FLOWS/03-verify-and-cleanup.yaml"
    ;;
  android)
    DEVICE="${DEVICE:-$(adb devices | awk 'NR>1 && $2=="device"{print $1; exit}')}"
    [ -n "$DEVICE" ] || { echo "接続中のAndroid端末がありません" >&2; exit 1; }
    maestro --device "$DEVICE" test "$FLOWS/02-add-from-camera.yaml"
    maestro --device "$DEVICE" test "$FLOWS/03-verify-and-cleanup.yaml"
    ;;
  *)
    echo "使い方: $0 ios [アプリの.appパス] | android" >&2
    exit 1
    ;;
esac
echo "スクリーンショット: $OUT"
