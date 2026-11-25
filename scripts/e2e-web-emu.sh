#!/bin/bash
# ログインが要る範囲（アカウント・共有プロジェクト）のWeb通しテスト。
# Firebaseエミュレータ（Auth / Firestore / Storage）を起動し、その上でPlaywrightを流して、終わったら止める。
# 項目は docs/E2E_TEST_ITEMS.md の台帳と対応する。
#
#   scripts/e2e-web-emu.sh               全部
#   scripts/e2e-web-emu.sh -g PROJ-5     台帳のIDで絞る（引数はPlaywrightへ渡る）
#
# 前提:
# - Java 21（firebase-tools 15 のエミュレータに必要）
# - 9099 / 8080 / 9199 番が空いていること（yarn emu や yarn testrules と同時には流せない）
# - 開発サーバーは、エミュレータ接続用の環境変数つきで 8082 番に自動で立つ（E2E_EMU_PORT で変更）。
#   ふだんの開発サーバー（8081番）とは別物で、本番のFirebaseには一切つながない
set -euo pipefail
cd "$(dirname "$0")/.."

ARGS=""
for a in "$@"; do ARGS+=" $(printf '%q' "$a")"; done

# demo- で始まるプロジェクトIDは実在のプロジェクトに届かない（src/lib/firebase/firebase.web.ts と同じ値）
exec npx firebase emulators:exec --project demo-ecorismap-e2e --only auth,firestore,storage \
  "npx playwright test -c e2e/web/playwright.emu.config.ts$ARGS"
