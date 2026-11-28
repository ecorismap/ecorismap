#!/bin/bash
# iOSシミュレーターの開発ビルドを、Firebaseエミュレータ接続のMetroへつなぎ替える／元に戻す
# （scripts/e2e-native-emu.sh が e2e/maestro/smoke-emu/ の前後で使う）。
#
#   e2e/maestro/support/ios-emu-session.sh begin [UDID] [Metroのポート]   アプリを止め、データの控えを取り、接続先を localhost:<ポート> にする
#   e2e/maestro/support/ios-emu-session.sh end [UDID]                     アプリを止め、データを控えへ戻し、接続先をふだんの8081番へ戻す
#
# - 接続先: 開発ビルドは、NSUserDefaults の RCT_jsLocation があればそのMetroからバンドルを読む（RCTBundleURLProvider）。
#   無ければ localhost:8081。begin で書き、end で消す。アプリの入れ直しもビルドのやり直しも要らない
# - データ: Documents（mmkv＝レイヤ・記録・設定、SQLite、projects＝写真、tiles＝地図）を、同じ入れ物の中の
#   Documents.e2e-emu-keep に複製しておき、end でテスト中の Documents を捨てて戻す。ログインやプロジェクトを開く操作で
#   端末内のデータが置き換わっても、元に戻る
# - Firestore の端末内キャッシュ（Library/Application Support/firestore）も同じく控えて戻す。エミュレータから読んだ文書が
#   本番と同じプロジェクトIDのキャッシュに残らないようにする
# - ログインの状態はキーチェーンにあり、ここでは戻せない。end の前にアプリの中でログアウトしておくこと
#   （smoke-emu/99-logout.yaml）
# - シミュレーター専用。begin のあと end を忘れると、8083番につながったままになる（end を流せば戻る）
set -euo pipefail

ACTION="${1:-}"
DEVICE="${2:-$(xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}-[0-9A-F-]{27}' | head -1)}"
PORT="${3:-8083}"
APP_ID="jp.co.ecoris.ecorismap"
[ -n "$DEVICE" ] || { echo "起動中のiOSシミュレーターがありません" >&2; exit 1; }
CONTAINER="$(xcrun simctl get_app_container "$DEVICE" "$APP_ID" data)"
[ -d "$CONTAINER" ] || { echo "アプリのデータの場所が見つかりません" >&2; exit 1; }
KEEP="$CONTAINER/Documents.e2e-emu-keep"
CACHE="$CONTAINER/Library/Application Support/firestore"
CACHE_KEEP="$CONTAINER/Library/Application Support/firestore.e2e-emu-keep"
CACHE_NONE="$CONTAINER/Library/Application Support/firestore.e2e-emu-none"

xcrun simctl terminate "$DEVICE" "$APP_ID" >/dev/null 2>&1 || true
sleep 1

case "$ACTION" in
  begin)
    if [ -e "$KEEP" ]; then
      echo "データの控えがすでにあります（前回 end していません）: $KEEP" >&2
      echo "先に $0 end を流してください" >&2
      exit 1
    fi
    # APFSの複製（-c）なので、容量も時間もほとんどかからない
    cp -Rc "$CONTAINER/Documents" "$KEEP"
    if [ -d "$CACHE" ]; then cp -Rc "$CACHE" "$CACHE_KEEP"; else touch "$CACHE_NONE"; fi
    xcrun simctl spawn "$DEVICE" defaults write "$APP_ID" RCT_jsLocation "localhost:$PORT"
    echo "データの控えを取り、接続先を localhost:$PORT にしました: $KEEP（$(du -sh "$KEEP" | cut -f1)）"
    ;;
  end)
    [ -d "$KEEP" ] || { echo "データの控えがありません（begin していません）: $KEEP" >&2; exit 1; }
    rm -rf "$CONTAINER/Documents"
    mv "$KEEP" "$CONTAINER/Documents"
    if [ -d "$CACHE_KEEP" ]; then
      rm -rf "$CACHE"
      mv "$CACHE_KEEP" "$CACHE"
    elif [ -e "$CACHE_NONE" ]; then
      rm -rf "$CACHE"
      rm -f "$CACHE_NONE"
    fi
    xcrun simctl spawn "$DEVICE" defaults delete "$APP_ID" RCT_jsLocation >/dev/null 2>&1 || true
    echo "データを戻し、接続先をふだんのMetro（8081番）へ戻しました"
    ;;
  *)
    echo "使い方: $0 begin|end [UDID] [Metroのポート]" >&2
    exit 1
    ;;
esac
