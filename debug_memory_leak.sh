#!/bin/bash

# React Native メモリリーク詳細調査スクリプト

PACKAGE="jp.co.geopark.ecorismap"

echo "=== React Native Memory Leak Investigation ==="
echo ""

# 1. React Native Bridge のメモリ状況
echo "1. Checking React Native Bridge Memory..."
adb shell dumpsys meminfo $PACKAGE | grep -A 10 "Native Heap"
echo ""

# 2. JavaScript Heap の情報を取得 (Chrome DevToolsと連携)
echo "2. JavaScript Heap Info (if available):"
adb shell dumpsys meminfo $PACKAGE | grep -E "Unknown|Other dev|Other mmap"
echo ""

# 3. 保持されているオブジェクトの数
echo "3. Retained Objects Count:"
adb shell dumpsys meminfo $PACKAGE | grep -A 20 "Objects"
echo ""

# 4. メモリリークの可能性があるパターンを検出
echo "4. Potential Memory Leak Indicators:"
echo ""

# Viewの数が異常に多い場合
VIEW_COUNT=$(adb shell dumpsys meminfo $PACKAGE | grep "Views:" | awk '{print $2}')
if [ ! -z "$VIEW_COUNT" ]; then
    echo "  Views count: $VIEW_COUNT"
    if [ "$VIEW_COUNT" -gt 1000 ]; then
        echo "  ⚠️  WARNING: High number of views detected! Possible view leak."
    fi
fi

# ViewRootImplの数をチェック
VIEWROOT_COUNT=$(adb shell dumpsys meminfo $PACKAGE | grep "ViewRootImpl:" | awk '{print $2}')
if [ ! -z "$VIEWROOT_COUNT" ]; then
    echo "  ViewRootImpl count: $VIEWROOT_COUNT"
    if [ "$VIEWROOT_COUNT" -gt 5 ]; then
        echo "  ⚠️  WARNING: Multiple ViewRootImpl detected! Possible activity leak."
    fi
fi

# Activitiesの数をチェック
ACTIVITY_COUNT=$(adb shell dumpsys meminfo $PACKAGE | grep "Activities:" | awk '{print $2}')
if [ ! -z "$ACTIVITY_COUNT" ]; then
    echo "  Activities count: $ACTIVITY_COUNT"
    if [ "$ACTIVITY_COUNT" -gt 1 ]; then
        echo "  ⚠️  WARNING: Multiple activities detected! Check for activity leaks."
    fi
fi
echo ""

# 5. ヒープダンプ分析のヒント
echo "5. Heap Dump Analysis:"
echo "  To capture a heap dump for detailed analysis:"
echo "  adb shell am dumpheap $PACKAGE /data/local/tmp/heap.hprof"
echo "  adb pull /data/local/tmp/heap.hprof"
echo "  Then analyze with Android Studio or MAT"
echo ""

# 6. メモリ割り当ての追跡
echo "6. Memory Allocations Tracking:"
PID=$(adb shell pidof $PACKAGE)
if [ ! -z "$PID" ]; then
    echo "  Process ID: $PID"
    echo "  Top memory regions:"
    adb shell cat /proc/$PID/maps | grep -E "rw-p|rwxp" | head -10
fi
echo ""

# 7. GCログの確認
echo "7. Recent GC Activity:"
adb logcat -d -s "dalvikvm:I" | tail -20
echo ""

# 8. React Native specific logs
echo "8. React Native Memory Warnings:"
adb logcat -d | grep -E "Memory|memory|GC|ReactNative" | tail -20
echo ""

# 9. メモリ使用量の経時変化を記録
echo "9. Memory Usage Timeline (recording for 30 seconds):"
echo "Time, Total PSS, Native Heap, Dalvik Heap, Views"

for i in {1..6}; do
    TIMESTAMP=$(date +%H:%M:%S)
    TOTAL_PSS=$(adb shell dumpsys meminfo $PACKAGE | grep "TOTAL:" | awk '{print $2}')
    NATIVE=$(adb shell dumpsys meminfo $PACKAGE | grep "Native Heap" | head -1 | awk '{print $3}')
    DALVIK=$(adb shell dumpsys meminfo $PACKAGE | grep "Dalvik Heap" | head -1 | awk '{print $3}')
    VIEWS=$(adb shell dumpsys meminfo $PACKAGE | grep "Views:" | awk '{print $2}')
    
    echo "$TIMESTAMP, $TOTAL_PSS KB, $NATIVE KB, $DALVIK KB, $VIEWS views"
    sleep 5
done

echo ""
echo "=== Analysis Complete ==="
echo ""
echo "Common React Native Memory Leak Causes:"
echo "1. Event listeners not removed (especially location listeners)"
echo "2. Timers/Intervals not cleared"
echo "3. Circular references in closures"
echo "4. Large arrays/objects in state that aren't cleared"
echo "5. Native modules holding references"
echo "6. WebView memory leaks"
echo "7. Image cache not cleared"
echo ""
echo "Recommendations:"
echo "- Check if location event listeners are properly removed"
echo "- Verify that setInterval/setTimeout are cleared"
echo "- Check if large arrays (track points) are properly cleaned up"
echo "- Review native module usage (MMKV, Maps, etc.)"