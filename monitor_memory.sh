#!/bin/bash

# EcorisMap メモリ監視スクリプト
# 使用方法: ./monitor_memory.sh [-d] [-l] [-h]

# パッケージ名
PACKAGE="jp.co.ecoris.ecorismap"

# 色定義
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# デフォルト設定
MODE="basic"
LOG_FILE=""
INTERVAL=1

# ヘルプ表示
show_help() {
    echo "EcorisMap メモリ監視スクリプト"
    echo ""
    echo "使用方法: $0 [オプション]"
    echo ""
    echo "オプション:"
    echo "  -d    詳細モード（Native Heap、Dalvik Heap、PSS を表示）"
    echo "  -l    ログファイルに保存（memory_log_YYYYMMDD_HHMMSS.txt）"
    echo "  -i N  更新間隔を N 秒に設定（デフォルト: 1秒）"
    echo "  -h    このヘルプを表示"
    echo ""
    echo "例:"
    echo "  $0          # 基本監視（PSSのみ）"
    echo "  $0 -d       # 詳細監視"
    echo "  $0 -d -l    # 詳細監視をログファイルに保存"
    echo "  $0 -i 2     # 2秒ごとに更新"
}

# オプション解析
while getopts "dlhi:" opt; do
    case $opt in
        d)
            MODE="detailed"
            ;;
        l)
            LOG_FILE="memory_log_$(date +%Y%m%d_%H%M%S).txt"
            ;;
        i)
            INTERVAL=$OPTARG
            ;;
        h)
            show_help
            exit 0
            ;;
        \?)
            echo "無効なオプション: -$OPTARG" >&2
            show_help
            exit 1
            ;;
    esac
done

# ADBが利用可能か確認
if ! command -v adb &> /dev/null; then
    echo -e "${RED}エラー: adb コマンドが見つかりません${NC}"
    echo "Android SDK Platform-Tools をインストールしてください"
    exit 1
fi

# デバイスが接続されているか確認
if ! adb devices | grep -q device$; then
    echo -e "${RED}エラー: Android デバイスが接続されていません${NC}"
    echo "デバイスを接続して、USBデバッグを有効にしてください"
    exit 1
fi

# アプリが実行中か確認
check_app_running() {
    adb shell ps | grep -q $PACKAGE
}

# PSS値に応じて色を設定
get_color_for_pss() {
    local pss=$1
    if [ "$pss" -gt 500000 ]; then
        echo "$RED"  # 500MB以上は赤
    elif [ "$pss" -gt 300000 ]; then
        echo "$YELLOW"  # 300MB以上は黄色
    else
        echo "$GREEN"  # それ以下は緑
    fi
}

# 基本監視モード
monitor_basic() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local pss_line=$(adb shell dumpsys meminfo $PACKAGE 2>/dev/null | grep "TOTAL PSS:" | head -1)
    
    if [ -z "$pss_line" ]; then
        echo -e "${YELLOW}警告: アプリが実行されていないか、メモリ情報を取得できません${NC}"
        return
    fi
    
    local pss_value=$(echo $pss_line | awk '{print $3}')
    local color=$(get_color_for_pss $pss_value)
    
    if [ -n "$LOG_FILE" ]; then
        echo "$timestamp | PSS: ${pss_value} KB" >> "$LOG_FILE"
    fi
    
    echo -e "${BLUE}[$timestamp]${NC} ${color}PSS: ${pss_value} KB${NC} ($(($pss_value / 1024)) MB)"
}

# 詳細監視モード
monitor_detailed() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # メモリ情報を一時的に保存
    local meminfo=$(adb shell dumpsys meminfo $PACKAGE 2>/dev/null)
    
    if [ -z "$meminfo" ]; then
        echo -e "${YELLOW}警告: アプリが実行されていないか、メモリ情報を取得できません${NC}"
        return
    fi
    
    # 各値を抽出
    local native_heap=$(echo "$meminfo" | grep "Native Heap:" | awk '{print $3}')
    local dalvik_heap=$(echo "$meminfo" | grep "Dalvik Heap:" | awk '{print $3}')
    local pss_total=$(echo "$meminfo" | grep "TOTAL PSS:" | head -1 | awk '{print $3}')
    
    # 色を設定
    local color=$(get_color_for_pss $pss_total)
    
    # クリア画面
    if [ -z "$LOG_FILE" ]; then
        clear
    fi
    
    echo -e "${BLUE}=== $timestamp ===${NC}"
    echo -e "Native Heap:  ${native_heap:-N/A} KB"
    echo -e "Dalvik Heap:  ${dalvik_heap:-N/A} KB"
    echo -e "${color}TOTAL PSS:    ${pss_total:-N/A} KB ($(($pss_total / 1024)) MB)${NC}"
    echo ""
    
    # ログファイルに保存
    if [ -n "$LOG_FILE" ]; then
        {
            echo "=== $timestamp ==="
            echo "Native Heap:  ${native_heap:-N/A} KB"
            echo "Dalvik Heap:  ${dalvik_heap:-N/A} KB"
            echo "TOTAL PSS:    ${pss_total:-N/A} KB"
            echo ""
        } >> "$LOG_FILE"
    fi
}

# メイン処理
echo -e "${GREEN}EcorisMap メモリ監視を開始します${NC}"
echo -e "${GREEN}パッケージ: $PACKAGE${NC}"
echo -e "${GREEN}モード: $MODE${NC}"
echo -e "${GREEN}更新間隔: ${INTERVAL}秒${NC}"

if [ -n "$LOG_FILE" ]; then
    echo -e "${GREEN}ログファイル: $LOG_FILE${NC}"
fi

echo -e "${YELLOW}Ctrl+C で終了${NC}"
echo ""

# 監視ループ
trap "echo -e '\n${GREEN}監視を終了しました${NC}'; exit" INT

while true; do
    if ! check_app_running; then
        echo -e "${YELLOW}アプリが実行されていません。待機中...${NC}"
        sleep $INTERVAL
        continue
    fi
    
    if [ "$MODE" = "detailed" ]; then
        monitor_detailed
    else
        monitor_basic
    fi
    
    sleep $INTERVAL
done