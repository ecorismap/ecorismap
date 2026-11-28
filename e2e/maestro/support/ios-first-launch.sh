#!/bin/bash
# iOSシミュレーターのアプリを「初回起動」の状態にする／元に戻す（e2e/maestro/smoke/91-first-launch.yaml の前後で使う）。
#
#   e2e/maestro/support/ios-first-launch.sh begin [UDID]   アプリを止め、アプリのデータ（Documents）を丸ごと脇へよける
#   e2e/maestro/support/ios-first-launch.sh end [UDID]     アプリを止め、テスト中にできたデータを捨てて、よけておいたデータを戻す
#
# 利用規約の同意・更新情報の既読・チュートリアルの既読は、端末に属する設定として「データをクリア」でも
# バックアップからの復元でも消えない（src/utils/deviceLocalSettings.ts）。初回起動の状態に戻すには、保存された状態
# （Documents/mmkv）ごと無くすしかない。アプリのデータを消す代わりに、Mac 側でフォルダの名前を変えてよけ、あとで戻す。
# - よけるのは Documents（mmkv＝レイヤ・記録・設定、SQLite、projects＝写真、tiles＝地図）。同じ入れ物の中の Documents.e2e-keep に置く
# - Library（開発ビルドの接続先などの設定・キャッシュ）は触らないので、Metro へはそのままつながる
# - begin と end の間にアプリで作ったものは、end で全部捨てる
# - シミュレーター専用（実機・Androidには使えない）。begin のあと end を忘れると、アプリは空のままになる
#   （データは Documents.e2e-keep に残っているので、end を流せば戻る）
set -euo pipefail

ACTION="${1:-}"
DEVICE="${2:-$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}-[0-9A-F-]{27}' | head -1)}"
APP_ID="jp.co.ecoris.ecorismap"
[ -n "$DEVICE" ] || { echo "起動中のiOSシミュレーターがありません" >&2; exit 1; }
CONTAINER="$(xcrun simctl get_app_container "$DEVICE" "$APP_ID" data)"
[ -d "$CONTAINER" ] || { echo "アプリのデータの場所が見つかりません" >&2; exit 1; }
KEEP="$CONTAINER/Documents.e2e-keep"

xcrun simctl terminate "$DEVICE" "$APP_ID" >/dev/null 2>&1 || true
sleep 1

case "$ACTION" in
  begin)
    if [ -e "$KEEP" ]; then
      echo "よけたデータがすでにあります（前回 end していません）: $KEEP" >&2
      echo "先に $0 end を流してください" >&2
      exit 1
    fi
    mv "$CONTAINER/Documents" "$KEEP"
    mkdir "$CONTAINER/Documents"
    echo "アプリのデータをよけました: $KEEP（$(du -sh "$KEEP" | cut -f1)）"
    ;;
  end)
    [ -d "$KEEP" ] || { echo "よけたデータがありません（begin していません）: $KEEP" >&2; exit 1; }
    rm -rf "$CONTAINER/Documents"
    mv "$KEEP" "$CONTAINER/Documents"
    echo "アプリのデータを戻しました: $CONTAINER/Documents"
    ;;
  *)
    echo "使い方: $0 begin|end [UDID]" >&2
    exit 1
    ;;
esac
