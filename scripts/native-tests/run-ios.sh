#!/bin/sh
# iOS 側のスタイル式評価器を macOS 上でビルドして共通フィクスチャで検証する。
# 評価器は Foundation だけに依存しているので、Xcode プロジェクトやシミュレータは不要。
#
# 使い方: scripts/native-tests/run-ios.sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/node_modules/react-native-maps/ios/AirGoogleMaps/VectorTile"
OUT="${TMPDIR:-/tmp}/ecorismap-native-tests"
mkdir -p "$OUT"

xcrun clang -fobjc-arc -framework Foundation -Wall -Wno-unused-function \
  -I "$SRC" \
  "$SRC/StyleExpression.m" "$SRC/CssColor.m" "$SRC/EvalContext.m" \
  "$ROOT/scripts/native-tests/ios/main.m" \
  -o "$OUT/style_expr_test"

"$OUT/style_expr_test" "$ROOT/src/__tests__/resources/vectorStyleExpressions.json"
