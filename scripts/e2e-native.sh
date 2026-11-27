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
# - デバッグビルドのときはMetroが起動していること。`EXPO_PUBLIC_E2E=1 yarn start` で起動すると、開発ビルドの
#   警告トースト（下部のボタンに重なり、押すとMac側でReact Native DevToolsが開く）が出なくなる
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

# ファイル取り込みのフロー（13-file）が選ぶテスト用ファイルを、端末の「ファイル」アプリから見える場所へ置く。
# （iOSシミュレーターは「このiPhone内」の実体がMac側にあるので、そこへコピーする。
#   Androidは端末の Download フォルダへ送る。ファイル選択の「ダウンロード」に出るよう、メディアの索引にも載せる）
if [ "$PLATFORM" = android ]; then
  adb -s "$DEVICE" push "$ROOT/e2e/web/fixtures/植物調査.geojson" /sdcard/Download/e2e_plants.geojson >/dev/null
  adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
    -d file:///sdcard/Download/e2e_plants.geojson >/dev/null 2>&1 || true
  # 20-maps-pmtiles・22-file-formats・24-maps-more が選ぶテスト用ファイル（スタイルJSON・各形式のデータ・PDF地図・地図設定）
  adb -s "$DEVICE" push "$ROOT/e2e/web/fixtures/vegetation-style.json" /sdcard/Download/e2e_style.json >/dev/null
  for fixture in "$ROOT"/e2e/maestro/fixtures/e2e_*; do
    adb -s "$DEVICE" push "$fixture" "/sdcard/Download/$(basename "$fixture")" >/dev/null
  done
  for fixture in e2e_style.json $(cd "$ROOT/e2e/maestro/fixtures" && ls e2e_*); do
    adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d "file:///sdcard/Download/$fixture" >/dev/null 2>&1 || true
  done
  # 写真のフロー（photo/05-heic-to-jpeg）が選ぶ HEIC の写真を、端末の Pictures へ置く
  # （iOSシミュレーターは最初から HEIC の写真が入っている）。写真選択画面で日時から選べるよう、更新日時を決め打ちにする
  HEIC_TMP="$(mktemp -d)"
  if sips -s format heic "$ROOT/e2e/web/fixtures/photo1.jpg" --out "$HEIC_TMP/e2e_photo.heic" >/dev/null 2>&1; then
    adb -s "$DEVICE" push "$HEIC_TMP/e2e_photo.heic" /sdcard/Pictures/e2e_photo.heic >/dev/null
    adb -s "$DEVICE" shell touch -t 202002020202 /sdcard/Pictures/e2e_photo.heic
    adb -s "$DEVICE" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
      -d file:///sdcard/Pictures/e2e_photo.heic >/dev/null 2>&1 || true
  else
    echo "HEIC の写真を作れませんでした（sips）。photo/05-heic-to-jpeg は通りません" >&2
  fi
  rm -rf "$HEIC_TMP"
fi
if [ "$PLATFORM" = ios ]; then
  for group in "$HOME/Library/Developer/CoreSimulator/Devices/$DEVICE/data/Containers/Shared/AppGroup"/*/; do
    if /usr/libexec/PlistBuddy -c "Print :MCMMetadataIdentifier" "$group.com.apple.mobile_container_manager.metadata.plist" 2>/dev/null |
      grep -q '^group.com.apple.FileProvider.LocalStorage$'; then
      mkdir -p "${group}File Provider Storage"
      cp "$ROOT/e2e/web/fixtures/植物調査.geojson" "${group}File Provider Storage/e2e_plants.geojson"
      # 20-maps-pmtiles・22-file-formats・24-maps-more が選ぶテスト用ファイル（スタイルJSON・各形式のデータ・PDF地図・地図設定）
      cp "$ROOT/e2e/web/fixtures/vegetation-style.json" "${group}File Provider Storage/e2e_style.json"
      cp "$ROOT"/e2e/maestro/fixtures/e2e_* "${group}File Provider Storage/"
    fi
  done
fi

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
  elif [ "$PLATFORM" = ios ]; then
    # 初回起動のフロー（91）はデータをよけて戻すだけで消さないので、iOSシミュレーターではいつも流す
    for f in "$SMOKE"/91-*.yaml; do
      [ -e "$f" ] && FLOWS+=("$f")
    done
  fi
fi

# 地図のフロー（20-maps-pmtiles・21-maps-offline・24-maps-more）は、Mac から配信するテスト用のタイルを読む。
# 配信（8765番）が動いていなければ、このスクリプトが起動し、終わるときに止める
SERVER_PID=""
if ! curl -s -o /dev/null --max-time 2 http://localhost:8765/_requests; then
  node "$ROOT/e2e/maestro/support/serve-fixtures.mjs" >/dev/null 2>&1 &
  SERVER_PID=$!
  trap '[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true' EXIT
  sleep 1
fi
if [ "$PLATFORM" = android ]; then
  adb -s "$DEVICE" reverse tcp:8765 tcp:8765 >/dev/null
fi

FAILED=()
for f in "${FLOWS[@]}"; do
  base="$(basename "$f")"
  echo "■ $base"
  case "$base" in
    91-*)
      # 初回起動のフロー。iOSシミュレーターだけ: アプリのデータを脇へよけて流し、終わったら戻す（データは消えない）
      if [ "$PLATFORM" != ios ]; then
        echo "（iOSシミュレーター専用なので飛ばします）"
        continue
      fi
      "$ROOT/e2e/maestro/support/ios-first-launch.sh" begin "$DEVICE"
      if ! maestro --device "$DEVICE" test -e PLATFORM="$PLATFORM" "$f"; then
        FAILED+=("$base")
      fi
      "$ROOT/e2e/maestro/support/ios-first-launch.sh" end "$DEVICE"
      continue
      ;;
  esac
  if ! maestro --device "$DEVICE" test -e PLATFORM="$PLATFORM" "$f"; then
    FAILED+=("$base")
  fi
done

# 写真のフロー（全フローを流すときだけ）。iOSシミュレーターはカメラで撮影できないのでライブラリ選択、Androidはカメラ
if [ "$#" -eq 0 ] && [ "${SKIP_PHOTO:-}" != "1" ]; then
  if [ "$PLATFORM" = ios ]; then PHOTO_ADD="01-add-from-library.yaml"; else PHOTO_ADD="02-add-from-camera.yaml"; fi
  for f in "$PHOTO_ADD" "03-verify-and-cleanup.yaml" "04-view-swipe-delete.yaml" "05-heic-to-jpeg.yaml"; do
    echo "■ photo/$f"
    if ! maestro --device "$DEVICE" test "$PHOTO/$f"; then
      FAILED+=("photo/$f")
      break
    fi
  done
fi

# Android: 位置情報の権限のフロー（18-permission）はOSのダイアログで「許可しない」を選ぶので、権限に「今後は尋ねない」の印が残る
# （権限そのものはフローの最後に許可へ戻る）。印を外して元に戻す
if [ "$PLATFORM" = android ]; then
  for perm in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
    adb -s "$DEVICE" shell pm clear-permission-flags jp.co.ecoris.ecorismap "android.permission.$perm" user-fixed >/dev/null 2>&1 || true
  done
fi

echo "スクリーンショット: $OUT"
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "失敗したフロー: ${FAILED[*]}" >&2
  exit 1
fi
echo "全フロー通過（端末: $DEVICE）"
