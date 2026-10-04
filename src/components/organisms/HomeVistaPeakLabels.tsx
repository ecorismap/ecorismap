/**
 * 眺望中の山名ラベル（ネイティブ・Web共通）。
 *
 * 立ち位置の周辺の山を山頂データから選び、投影（PeakProjector）で画面位置を求めて、
 * 縦書きの山名を画面上部に並べ、山頂まで引き出し線でつなぐ。
 * 地形の陰に隠れる山は投影がnullを返すので出ない。山名をタップすると標高と距離を出す。
 * 投影の更新の仕方（間引き・末尾更新）はHomeTerrain3DPointsと同じ。
 * ただし見回し中は、ラベルが景色に置いていかれるので隠し、止まってから出し直す。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { useHomeTopLayout } from '../../hooks/useHomeTopLayout';
import { t } from '../../i18n/config';
import { terrain3dVistaStore } from '../../utils/terrain3d/vistaStore';
import { loadPeakIndex, PeakIndex } from '../../utils/peaks/peakData';
import {
  layoutPeakLabels,
  PEAK_SEARCH_RADIUS_M,
  PeakCandidate,
  PlacedPeakLabel,
  ProjectedPeak,
  selectPeakCandidates,
} from '../../utils/peaks/peakLabelLayout';
import { PeakProjector } from '../../utils/peaks/peakProjector';
import { peakLabelsStore } from '../../utils/peaks/peakLabelsStore';

interface Props {
  projector: PeakProjector | null;
}

/** 投影の更新間隔[ms]（カメラが動いている間の間引き） */
const PROJECT_INTERVAL_MS = 250;
const COLUMN_WIDTH = 20;
const CHAR_HEIGHT = 15;
const FONT_SIZE = 13;
const MIN_STEM = 12;
const MAX_LABELS = 40;
const SUMMIT_DOT = 5;
/** 左端の操作ボタン列（ズーム・回転・高さ）を避ける幅 */
const LEFT_INSET = 56;
/** 詳細の吹き出しのおおよその最大幅（右端で左側へ出すかの判定用） */
const DETAIL_MAX_WIDTH = 180;
const STEM_COLOR = 'rgba(255,255,255,0.85)';
const SHADOW_COLOR = 'rgba(0,0,0,0.6)';

export const HomeVistaPeakLabels = React.memo(({ projector }: Props) => {
  const vistaActive = useSyncExternalStore(
    terrain3dVistaStore.subscribe,
    () => terrain3dVistaStore.getSnapshot().active
  );
  const enabled = useSyncExternalStore(peakLabelsStore.subscribe, peakLabelsStore.getSnapshot);
  const active = vistaActive && enabled && projector !== null;
  const { windowWidth } = useWindow();
  const { editControlTop } = useHomeTopLayout();
  const [index, setIndex] = useState<PeakIndex | null>(null);
  const [labels, setLabels] = useState<PlacedPeakLabel[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!active || index !== null) return;
    let cancelled = false;
    loadPeakIndex()
      .then((loaded) => {
        if (!cancelled) setIndex(loaded);
      })
      .catch((e) => console.warn('山頂データの読み込みに失敗', e));
    return () => {
      cancelled = true;
    };
  }, [active, index]);

  const layoutRef = useRef({ width: windowWidth, bandTop: editControlTop });
  layoutRef.current = { width: windowWidth, bandTop: editControlTop };

  useEffect(() => {
    if (!active || projector === null || index === null) {
      setLabels([]);
      setSelectedKey(null);
      return;
    }
    // 候補は立ち位置が変わったときだけ選び直す（毎回15万mの範囲を引かない）
    let candidates: PeakCandidate[] = [];
    let viewpointKey = '';
    let previous = new Set<string>();
    let lastUpdate = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      const viewpoint = projector.getViewpoint();
      if (viewpoint === null) {
        setLabels([]);
        return;
      }
      const key = `${viewpoint.latitude},${viewpoint.longitude}`;
      if (key !== viewpointKey) {
        viewpointKey = key;
        candidates = selectPeakCandidates(
          index.query(viewpoint.latitude, viewpoint.longitude, PEAK_SEARCH_RADIUS_M),
          viewpoint
        );
        previous = new Set();
      }
      const projected: ProjectedPeak[] = [];
      for (const peak of candidates) {
        const screen = projector.project(peak.latitude, peak.longitude, peak.ele);
        if (screen !== null) projected.push({ ...peak, x: screen.x, y: screen.y });
      }
      const { width, bandTop } = layoutRef.current;
      const placed = layoutPeakLabels(projected, {
        width,
        leftInset: LEFT_INSET,
        bandTop,
        columnWidth: COLUMN_WIDTH,
        charHeight: CHAR_HEIGHT,
        minStem: MIN_STEM,
        maxLabels: MAX_LABELS,
        previous,
      });
      previous = new Set(placed.map((p) => p.key));
      setLabels(placed);
    };

    // カメラが止まった後は描画が来ないことがある（地形が出揃っていれば再描画しない）。
    // 隠したまま取り残されないよう、止まるまで間隔を空けて見に行く
    const scheduleRetry = () => {
      if (retry !== null) return;
      retry = setTimeout(() => {
        retry = null;
        if (projector.isReady()) {
          lastUpdate = Date.now();
          update();
        } else {
          scheduleRetry();
        }
      }, PROJECT_INTERVAL_MS);
    };

    const unsubscribe = projector.subscribe(() => {
      // 見回している間などは隠す（止まった後の描画で出し直す）
      if (!projector.isReady()) {
        if (trailing !== null) {
          clearTimeout(trailing);
          trailing = null;
        }
        setLabels((current) => (current.length === 0 ? current : []));
        scheduleRetry();
        return;
      }
      const now = Date.now();
      if (now - lastUpdate < PROJECT_INTERVAL_MS) {
        // 間引いた最後の描画を取りこぼさないよう末尾更新を予約する
        if (trailing === null) {
          trailing = setTimeout(() => {
            trailing = null;
            lastUpdate = Date.now();
            if (projector.isReady()) update();
          }, PROJECT_INTERVAL_MS);
        }
        return;
      }
      lastUpdate = now;
      update();
    });
    if (projector.isReady()) update();
    else scheduleRetry();
    return () => {
      if (trailing !== null) clearTimeout(trailing);
      if (retry !== null) clearTimeout(retry);
      unsubscribe();
    };
  }, [active, projector, index]);

  const toggleSelected = useCallback((key: string) => {
    setSelectedKey((current) => (current === key ? null : key));
  }, []);

  if (!active || labels.length === 0) return null;
  const selected = labels.find((label) => label.key === selectedKey);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {labels.map((label) => (
        <PeakLabel key={label.key} label={label} onPress={toggleSelected} />
      ))}
      {/* 詳細は隣の山名や引き出し線より手前に出すため、全ラベルの後に置く */}
      {selected !== undefined && <PeakDetail label={selected} width={windowWidth} />}
      {index !== null && (
        <Text style={styles.attribution} pointerEvents="none">
          {t('Home.vista.peakAttribution')}
        </Text>
      )}
    </View>
  );
});

/** 縦書きで崩れる長音・ダッシュは縦向きの記号に置き換える */
const toVertical = (name: string) =>
  Array.from(name)
    .map((c) => (c === 'ー' || c === '－' || c === '-' ? '｜' : c))
    .join('\n');

const PeakLabel = React.memo(
  ({ label, onPress }: { label: PlacedPeakLabel; onPress: (key: string) => void }) => {
    const stemTop = label.labelTop + label.labelHeight + 2;
    const stemHeight = Math.max(0, label.y - stemTop);
    // 位置はtransformではなくleft/topで与える（HomeTerrain3DPointsと同じ理由）
    const columnStyle = useMemo(
      () => [styles.column, { left: label.x - COLUMN_WIDTH / 2, top: label.labelTop }],
      [label.x, label.labelTop]
    );
    const stemStyle = useMemo(
      () => [styles.stem, { left: label.x - 0.5, top: stemTop, height: stemHeight }],
      [label.x, stemTop, stemHeight]
    );
    const dotStyle = useMemo(
      () => [styles.dot, { left: label.x - SUMMIT_DOT / 2, top: label.y - SUMMIT_DOT / 2 }],
      [label.x, label.y]
    );
    const vertical = useMemo(() => toVertical(label.name), [label.name]);
    const handlePress = useCallback(() => onPress(label.key), [onPress, label.key]);
    return (
      <>
        <View style={stemStyle} pointerEvents="none" />
        <View style={dotStyle} pointerEvents="none" />
        <Pressable style={columnStyle} onPress={handlePress} hitSlop={4}>
          <Text style={[styles.name, label.rank <= 2 && styles.major]}>{vertical}</Text>
        </Pressable>
      </>
    );
  }
);

/** タップした山の標高と距離 */
const PeakDetail = ({ label, width }: { label: PlacedPeakLabel; width: number }) => (
  <View
    style={[
      styles.detail,
      // 右端の山は画面からはみ出さないよう列の左側に出す
      label.x > width - DETAIL_MAX_WIDTH
        ? { right: width - label.x + COLUMN_WIDTH / 2 + 2, top: label.labelTop }
        : { left: label.x + COLUMN_WIDTH / 2 + 2, top: label.labelTop },
    ]}
    pointerEvents="none"
  >
    <Text style={styles.detailName}>{label.name}</Text>
    <Text style={styles.detailText}>
      {t('Home.vista.peakDetail', {
        elevation: Math.round(label.ele),
        distance: (label.distance / 1000).toFixed(1),
      })}
    </Text>
  </View>
);

const textShadow = Platform.select({
  web: { textShadow: '0 0 3px rgba(0,0,0,0.9)' },
  default: { textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
});

const styles = StyleSheet.create({
  attribution: {
    bottom: 4,
    color: COLOR.WHITE,
    fontSize: 10,
    position: 'absolute',
    right: 6,
    ...textShadow,
  },
  column: {
    alignItems: 'center',
    position: 'absolute',
    width: COLUMN_WIDTH,
  },
  container: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    // Webは地図（後ろの兄弟要素）より上に出す必要がある。ネイティブは描画順で
    // ポイントの奥に置くので重ね順を指定しない
    ...Platform.select({ web: { zIndex: 500 }, default: {} }),
  },
  detail: {
    backgroundColor: COLOR.BANNER_BACKGROUND,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
  },
  detailName: {
    color: COLOR.WHITE,
    fontSize: 13,
    fontWeight: 'bold',
  },
  detailText: {
    color: COLOR.WHITE,
    fontSize: 12,
  },
  dot: {
    backgroundColor: COLOR.WHITE,
    borderColor: SHADOW_COLOR,
    borderRadius: SUMMIT_DOT / 2,
    borderWidth: 1,
    height: SUMMIT_DOT,
    position: 'absolute',
    width: SUMMIT_DOT,
  },
  major: {
    fontWeight: 'bold',
  },
  name: {
    color: COLOR.WHITE,
    fontSize: FONT_SIZE,
    lineHeight: CHAR_HEIGHT,
    textAlign: 'center',
    ...textShadow,
  },
  stem: {
    backgroundColor: STEM_COLOR,
    position: 'absolute',
    width: 1,
  },
});
