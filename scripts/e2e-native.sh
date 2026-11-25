#!/bin/bash
# ネイティブ（iOSシミュレーター・Androidエミュレーター）のスモークテスト（Maestro）。
# 機能を広く通すのはWeb（yarn e2e:web）で、こちらはネイティブ固有の経路だけを確かめる。
# 項目は docs/E2E_TEST_ITEMS.md の台帳と対応する。
#
#   scripts/e2e-native.sh ios [フロー名...]       iOSシミュレーター
#   scripts/e2e-native.sh android [フロー名...]   Androidエミュレーター
#
#   フロー名を省くと e2e/maestro/smoke/ の全フローを番号順に流し、続けて写真のフローを流す。
#   フロー名は smoke/ の中のファイル名の先頭一致（例: 02 、04-track）。
#
# 前提:
# - Maestroが入っていること（brew install mobile-dev-inc/tap/maestro）
# - アプリがインストール済みで、ログインしておらずプロジェクトを開いていない端末
#   （既定の「ポイント」レイヤにテスト用レコードを作り、最後に削除する。テスト専用の端末で流すこと）
# - デバッグビルドのときはMetro（yarn start）が起動していること
# - 端末の言語は日本語
# - Androidはエミュレーターを先に起動しておく（emulator @Pixel_8a）。実機には流さない
#   （DEVICE=<シリアル> を明示したときだけ、その端末に流す）
# - iOSとAndroidは同時に流さない
#
# 環境変数:
#   DEVICE     対象端末（iOS: シミュレーターのUDID、Android: adbのシリアル）
#   SMOKE_OUT  スクリーンショットの出力先（既定は一時ディレクトリ）
#   SKIP_PHOTO 1にすると写真のフローを飛ばす
#   E2E_ALLOW_CLEAR 1にすると、端末のデータを消すフロー（90番台: データをクリア→バックアップから復元）も流す。
#              地図の設定や取り込んだ地図も初期化されるので、テスト専用の端末でだけ指定する
set -euo pipefail

PLATFORM="${1:-}"
shift || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SMOKE="$ROOT/e2e/maestro/smoke"
PHOTO="$ROOT/e2e/maestro/photo"

if ! command -v maestro >/dev/null 2>&1; then
  echo "maestro が見つかりません。brew install mobile-dev-inc/tap/maestro でインストールしてください" >&2
  exit 1
fi

case "$PLATFORM" in
  ios)
    # 複数の端末がつながっていてもMaestroが選択を求めないよう、起動中のシミュレーターを明示する
    DEVICE="${DEVICE:-$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}-[0-9A-F-]{27}' | head -1)}"
    [ -n "$DEVICE" ] || { echo "起動中のiOSシミュレーターがありません" >&2; exit 1; }
    ;;
  android)
    # 実機がつながっていても選ばないよう、エミュレーターだけを対象にする
    DEVICE="${DEVICE:-$(adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/{print $1; exit}')}"
    [ -n "$DEVICE" ] || { echo "起動中のAndroidエミュレーターがありません（emulator @Pixel_8a で起動してください）" >&2; exit 1; }
    ;;
  *)
    echo "使い方: $0 ios|android [フロー名...]" >&2
    exit 1
    ;;
esac

# 利用統計の送信はしない
export MAESTRO_CLI_NO_ANALYTICS=1
# スクリーンショットはリポジトリの外へ出す（リポジトリ内に書くとMetroが変更として拾う）
OUT="${SMOKE_OUT:-$(mktemp -d)}"
mkdir -p "$OUT"
cd "$OUT"

FLOWS=()
if [ "$#" -gt 0 ]; then
  for name in "$@"; do
    found=0
    for f in "$SMOKE"/"$name"*.yaml; do
      [ -e "$f" ] || continue
      FLOWS+=("$f")
      found=1
    done
    [ "$found" = 1 ] || { echo "フローが見つかりません: $name" >&2; exit 1; }
  done
else
  # 90番台は端末のデータを消すフロー。E2E_ALLOW_CLEAR=1 のとき、または名前を指定したときだけ流す
  for f in "$SMOKE"/[0-8][0-9]*.yaml; do
    FLOWS+=("$f")
  done
  if [ "${E2E_ALLOW_CLEAR:-}" = "1" ]; then
    for f in "$SMOKE"/9[0-9]*.yaml; do
      [ -e "$f" ] && FLOWS+=("$f")
    done
  fi
fi

FAILED=()
for f in "${FLOWS[@]}"; do
  echo "■ $(basename "$f")"
  if ! maestro --device "$DEVICE" test -e PLATFORM="$PLATFORM" "$f"; then
    FAILED+=("$(basename "$f")")
  fi
done

# 写真のフロー（全フローを流すときだけ）。iOSシミュレーターはカメラで撮影できないのでライブラリ選択、Androidはカメラ
if [ "$#" -eq 0 ] && [ "${SKIP_PHOTO:-}" != "1" ]; then
  if [ "$PLATFORM" = ios ]; then PHOTO_ADD="01-add-from-library.yaml"; else PHOTO_ADD="02-add-from-camera.yaml"; fi
  for f in "$PHOTO_ADD" "03-verify-and-cleanup.yaml"; do
    echo "■ photo/$f"
    if ! maestro --device "$DEVICE" test "$PHOTO/$f"; then
      FAILED+=("photo/$f")
      break
    fi
  done
fi

echo "スクリーンショット: $OUT"
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "失敗したフロー: ${FAILED[*]}" >&2
  exit 1
fi
echo "全フロー通過（端末: $DEVICE）"
