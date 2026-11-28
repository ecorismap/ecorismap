#!/bin/bash
# ログインが要る範囲（アカウント・共有プロジェクト）の、ネイティブのスモークテスト（Maestro）。
# Firebaseエミュレータ（Auth / Firestore / Storage）を起動し、iOSシミュレーターの開発ビルドをエミュレータ接続のMetroへ
# つなぎ替えてフロー（e2e/maestro/smoke-emu/）を流し、終わったら端末もエミュレータも元に戻す。
# Web の scripts/e2e-web-emu.sh に当たる。項目は docs/E2E_TEST_ITEMS.md の台帳と対応する。
#
#   scripts/e2e-native-emu.sh ios               全フロー（30→31→32→33）
#   scripts/e2e-native-emu.sh ios 30 33         フロー名の先頭一致で絞る（32 は 31 の続きなので、31 と一緒に指定する）
#   scripts/e2e-native-emu.sh ios restore       途中で止めてしまったときに、端末を元へ戻すだけ
#
# 前提:
# - エミュレータ接続用のMetroが 8083番で動いていること（E2E_EMU_METRO_PORT で変更）:
#     EXPO_PUBLIC_E2E=1 EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1 npx expo start --port 8083
#   ふだんのMetro（8081番・本番接続）とは別物。このスクリプトは 8081番には触らない
# - Java 21（firebase-tools 15 のエミュレータに必要）
# - 9099 / 8080 / 9199 番が空いていること（yarn emu・yarn testrules・yarn e2e:web:emu と同時には流せない）
# - Maestro、起動中のiOSシミュレーター、開発ビルドのアプリ（未ログイン・プロジェクトを開いていない）
# - iOSシミュレーター専用（Androidは未対応）
#
# 本番には一切つながない: アカウントはエミュレータの中にだけ作るテスト用（e2e/maestro/support/emu-seed.mjs）で、
# 入力するのもその値だけ。端末が本当にエミュレータにつながっていることは、ログインの跡がエミュレータに残ることで確かめる。
# 端末のデータは消さない: 始めに控えを取り、終わりに戻す（e2e/maestro/support/ios-emu-session.sh）。
#
# 環境変数:
#   DEVICE              対象のシミュレーター（UDID）
#   E2E_EMU_METRO_PORT  エミュレータ接続用のMetroのポート（既定 8083）
set -euo pipefail

PLATFORM="${1:-}"
shift || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLOWS_DIR="$ROOT/e2e/maestro/smoke-emu"
SUPPORT="$ROOT/e2e/maestro/support"
METRO_PORT="${E2E_EMU_METRO_PORT:-8083}"
# エミュレータの起動時のID（Web のテストと同じ値。demo- で始まるIDは実在のプロジェクトに届かない）
EMU_PROJECT="demo-ecorismap-e2e"

if [ "$PLATFORM" != ios ]; then
  echo "使い方: $0 ios [フロー名...|restore]（iOSシミュレーター専用）" >&2
  exit 1
fi
DEVICE="${DEVICE:-$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}-[0-9A-F-]{27}' | head -1)}"
[ -n "$DEVICE" ] || { echo "起動中のiOSシミュレーターがありません" >&2; exit 1; }

if [ "${1:-}" = restore ]; then
  exec "$SUPPORT/ios-emu-session.sh" end "$DEVICE"
fi

command -v maestro >/dev/null 2>&1 || { echo "maestro が見つかりません。brew install mobile-dev-inc/tap/maestro でインストールしてください" >&2; exit 1; }
if ! curl -s --max-time 5 "http://localhost:$METRO_PORT/status" | grep -q 'packager-status:running'; then
  echo "エミュレータ接続用のMetroが ${METRO_PORT}番で動いていません。次のように起動してから流してください:" >&2
  echo "  EXPO_PUBLIC_E2E=1 EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1 npx expo start --port $METRO_PORT" >&2
  exit 1
fi
for port in 9099 8080 9199; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "${port}番が使われています（yarn emu・yarn testrules・yarn e2e:web:emu を止めてから流してください）" >&2
    exit 1
  fi
done
if JAVA21="$(/usr/libexec/java_home -v 21 2>/dev/null)"; then export JAVA_HOME="$JAVA21"; fi

# ネイティブのSDKがデータ（Firestore）を読み書きするプロジェクトID。エミュレータの中の同じ名前の入れ物に入る
DATA_PROJECT="$(/usr/libexec/PlistBuddy -c 'Print :PROJECT_ID' "$ROOT/ios/ecorismap/GoogleService-Info.plist")"

FLOWS=()
if [ "$#" -gt 0 ]; then
  for name in "$@"; do
    found=0
    for f in "$FLOWS_DIR"/"$name"*.yaml; do
      [ -e "$f" ] || continue
      FLOWS+=("$f")
      found=1
    done
    [ "$found" = 1 ] || { echo "フローが見つかりません: $name" >&2; exit 1; }
  done
else
  for f in "$FLOWS_DIR"/3[0-9]-*.yaml; do FLOWS+=("$f"); done
fi

export MAESTRO_CLI_NO_ANALYTICS=1
# ログ・スクリーンショットはリポジトリの外へ出す（リポジトリ内に書くとMetroが変更として拾う）
OUT="${SMOKE_OUT:-$(mktemp -d)}"
mkdir -p "$OUT"
cd "$OUT"

EMU_PID=""
SESSION=0
cleanup() {
  if [ "$SESSION" = 1 ]; then "$SUPPORT/ios-emu-session.sh" end "$DEVICE" || true; fi
  if [ -n "$EMU_PID" ]; then
    kill -INT "$EMU_PID" 2>/dev/null || true
    wait "$EMU_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# エミュレータを起動する（firebase.json はリポジトリのもの。ログは $OUT に出る）
npx --prefix "$ROOT" firebase --config "$ROOT/firebase.json" emulators:start \
  --project "$EMU_PROJECT" --only auth,firestore,storage >"$OUT/emulators.log" 2>&1 &
EMU_PID=$!
for _ in $(seq 60); do
  if curl -s -o /dev/null --max-time 2 http://localhost:9099/ && curl -s -o /dev/null --max-time 2 http://localhost:8080/ &&
    curl -s -o /dev/null --max-time 2 http://localhost:9199/; then
    break
  fi
  kill -0 "$EMU_PID" 2>/dev/null || { echo "エミュレータを起動できませんでした: $OUT/emulators.log" >&2; exit 1; }
  sleep 2
done
curl -s -o /dev/null --max-time 2 http://localhost:9199/ || { echo "エミュレータが起動しません: $OUT/emulators.log" >&2; exit 1; }

node "$SUPPORT/emu-seed.mjs" reset "$DATA_PROJECT"
"$SUPPORT/ios-emu-session.sh" begin "$DEVICE" "$METRO_PORT"
SESSION=1

FAILED=()
run() { maestro --device "$DEVICE" test -e PLATFORM=ios "$1"; }
for f in "${FLOWS[@]}"; do
  base="$(basename "$f")"
  echo "■ $base"
  if ! run "$f"; then
    FAILED+=("$base")
    continue
  fi
  case "$base" in
    30-*)
      # 端末がエミュレータにつながっている証拠（つながっていなければ、ログイン自体が通らない）
      node "$SUPPORT/emu-seed.mjs" check-login owner || FAILED+=("$base（エミュレータにログインの跡が無い）")
      ;;
    31-*)
      # PROJ-5: 端末から送信した記録がサーバーに届いている。続けて、ほかのメンバーが1件送信したことにする（32 が取得する）
      node "$SUPPORT/emu-seed.mjs" check-upload "$DATA_PROJECT" || FAILED+=("$base（送信した記録がサーバーに無い）")
      node "$SUPPORT/emu-seed.mjs" member-add "$DATA_PROJECT"
      ;;
  esac
done

# 後片付け: 未ログインに戻っていることを確かめてから、端末を元へ戻す（cleanup）
echo "■ 99-logout.yaml"
run "$FLOWS_DIR/99-logout.yaml" || FAILED+=("99-logout.yaml（ログアウトできていない。8081番へ戻す前に手でログアウトすること）")

echo "ログ・スクリーンショット: $OUT（Maestro の takeScreenshot は ~/.maestro/tests/<日時>/）"
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "失敗したフロー: ${FAILED[*]}" >&2
  exit 1
fi
echo "全フロー通過（端末: $DEVICE）"
