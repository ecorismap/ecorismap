#!/bin/bash

# メモリリーク調査用スクリプト

echo "=== Memory Debug Script for EcorisMap ==="
echo ""

# パッケージ名
PACKAGE="jp.co.geopark.ecorismap"

# 基本的なメモリ情報
echo "1. Basic Memory Info:"
adb shell dumpsys meminfo $PACKAGE | grep -E "TOTAL|Native Heap|Dalvik Heap|TOTAL SWAP|Objects|Views|Activities"
echo ""

# ヒープダンプのサマリー
echo "2. Heap Summary:"
adb shell dumpsys meminfo $PACKAGE | grep -A 20 "App Summary"
echo ""

# オブジェクトの詳細
echo "3. Object Details:"
adb shell dumpsys meminfo $PACKAGE | grep -A 30 "Objects"
echo ""

# JavaScript/React Native のメモリ使用状況
echo "4. Native Memory Details:"
adb shell dumpsys meminfo $PACKAGE | grep -A 10 "Native Heap"
echo ""

# アクティビティとビューの状況
echo "5. Activities and Views:"
adb shell dumpsys meminfo $PACKAGE | grep -E "Activities|Views|ViewRootImpl|AppContexts"
echo ""

# GCの統計
echo "6. GC Statistics:"
adb shell dumpsys meminfo $PACKAGE | grep -A 5 "GC"
echo ""

# メモリマップの大きなアロケーション
echo "7. Large Memory Allocations:"
adb shell dumpsys meminfo $PACKAGE | grep -B 2 -A 2 "TOTAL"
echo ""

# プロセスのメモリマップ (最も大きなもの上位10)
echo "8. Top Memory Maps:"
PID=$(adb shell pidof $PACKAGE)
if [ ! -z "$PID" ]; then
    echo "Process ID: $PID"
    adb shell cat /proc/$PID/smaps | grep -A 1 "^Size:" | head -20
fi
echo ""

# システム全体のメモリ状況
echo "9. System Memory:"
adb shell cat /proc/meminfo | head -10
echo ""

# 連続監視モード
echo "10. Continuous Monitoring (5 second intervals):"
echo "Press Ctrl+C to stop"
echo ""

while true; do
    echo "$(date +%H:%M:%S) - Memory snapshot:"
    adb shell dumpsys meminfo $PACKAGE | grep -E "TOTAL:" | head -1
    adb shell dumpsys meminfo $PACKAGE | grep -E "Native Heap" | head -1  
    adb shell dumpsys meminfo $PACKAGE | grep -E "Views:" | head -1
    echo "---"
    sleep 5
done