import React, { useCallback, useContext, useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { COLOR } from '../../constants/AppConstants';
import { ElevationProfilePoint } from '../../utils/trackStatistics';
import { CHART_PADDING as PADDING, buildElevationChart } from '../../utils/trackChart';
import { TrackFocusContext } from '../../contexts/TrackFocus';
import dayjs from '../../i18n/dayjs';

interface Props {
  profile: ElevationProfilePoint[];
  height?: number;
}

export const TrackSummaryChart = React.memo(({ profile, height = 180 }: Props) => {
  const [width, setWidth] = useState(0);
  // カーソル位置はTrackFocusContextと共有し、地図マーカーと双方向連動する
  const { trackFocusPoint, setTrackFocusPoint } = useContext(TrackFocusContext);
  const touchIndex =
    trackFocusPoint !== null && trackFocusPoint.index >= 0 && trackFocusPoint.index < profile.length
      ? trackFocusPoint.index
      : null;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  // 座標計算はエクスポート画像と共有する（見た目を一致させるため）
  const chart = useMemo(() => buildElevationChart(profile, width, height), [width, height, profile]);

  const updateCursorFromX = useCallback(
    (x: number) => {
      if (chart === null) return;
      // 最近傍のプロファイル点を探す（点数は300以下なので線形探索で十分）
      let nearest = 0;
      let minDiff = Infinity;
      for (let i = 0; i < chart.points.length; i++) {
        const diff = Math.abs(chart.points[i].x - x);
        if (diff < minDiff) {
          minDiff = diff;
          nearest = i;
        }
      }
      setTrackFocusPoint({ ...profile[nearest], index: nearest });
    },
    [chart, profile, setTrackFocusPoint]
  );

  // ボトムシートのコンテンツドラッグ（RNGHのPan）とJSレスポンダは競合して負けるため、
  // グラフ側もRNGHで実装する。横方向の動きで先に活性化してシートのPanをキャンセルし、
  // 縦方向優位のスワイプはフェイルしてシートの開閉に譲る
  const scrubGesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => updateCursorFromX(e.x));
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-5, 5])
      .failOffsetY([-15, 15])
      .onStart((e) => updateCursorFromX(e.x))
      .onUpdate((e) => updateCursorFromX(e.x));
    return Gesture.Race(pan, tap);
  }, [updateCursorFromX]);

  const touchPoint = touchIndex !== null && chart !== null ? chart.points[touchIndex] : null;
  const touchProfile = touchIndex !== null ? profile[touchIndex] : null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {chart !== null && (
        <GestureDetector gesture={scrubGesture}>
          <View>
            <Svg width={width} height={height}>
              {/* グリッドとY軸ラベル */}
              {chart.yTicks.map((v) => (
                <React.Fragment key={`y${v}`}>
                  <Line
                    x1={PADDING.left}
                    y1={chart.toY(v)}
                    x2={width - PADDING.right}
                    y2={chart.toY(v)}
                    stroke={COLOR.GRAY1}
                    strokeWidth={1}
                  />
                  <SvgText x={PADDING.left - 4} y={chart.toY(v) + 3} fontSize={9} fill={COLOR.GRAY3} textAnchor="end">
                    {`${v}m`}
                  </SvgText>
                </React.Fragment>
              ))}
              {/* X軸ラベル */}
              {chart.xTicks.map((v) => (
                <SvgText
                  key={`x${v}`}
                  x={chart.toX(v)}
                  y={height - PADDING.bottom + 14}
                  fontSize={9}
                  fill={COLOR.GRAY3}
                  textAnchor="middle"
                >
                  {`${v % 1 === 0 ? v : v.toFixed(1)}km`}
                </SvgText>
              ))}
              {/* 面塗りと折れ線 */}
              <Path d={chart.areaPath} fill={COLOR.BLUE} fillOpacity={0.15} />
              <Path d={chart.linePath} stroke={COLOR.BLUE} strokeWidth={2} fill="none" />
              {/* タッチ追従の縦線 */}
              {touchPoint !== null && (
                <>
                  <Line
                    x1={touchPoint.x}
                    y1={PADDING.top}
                    x2={touchPoint.x}
                    y2={chart.baseY}
                    stroke={COLOR.GRAY3}
                    strokeWidth={1}
                    strokeDasharray="3,2"
                  />
                  <Circle
                    cx={touchPoint.x}
                    cy={touchPoint.y}
                    r={4}
                    fill={COLOR.ORANGE}
                    stroke={COLOR.WHITE}
                    strokeWidth={1.5}
                  />
                </>
              )}
            </Svg>
            {/* ツールチップ */}
            {touchPoint !== null && touchProfile !== null && (
              <View
                style={[
                  styles.tooltip,
                  {
                    left: Math.min(Math.max(touchPoint.x - 55, 0), width - 110),
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.tooltipText}>
                  {`${touchProfile.distanceKm.toFixed(2)} km  ${Math.round(touchProfile.altitude)} m`}
                </Text>
                {touchProfile.timestamp !== undefined && (
                  <Text style={styles.tooltipText}>{dayjs(touchProfile.timestamp).format('HH:mm:ss')}</Text>
                )}
              </View>
            )}
          </View>
        </GestureDetector>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 4,
  },
  tooltip: {
    backgroundColor: COLOR.GRAY4,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    top: 4,
    width: 110,
  },
  tooltipText: {
    color: COLOR.WHITE,
    fontSize: 11,
    textAlign: 'center',
  },
});
