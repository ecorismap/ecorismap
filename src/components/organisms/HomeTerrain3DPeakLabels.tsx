/**
 * 通常の3D表示（眺望でないとき）の山名（▲＋山名＋標高）。
 *
 * 地図一覧の「山名」（peaks://）が表示中のときだけ出す（2Dと同じ条件・同じ見た目）。
 * 山頂は3Dシーンのカメラで画面へ投影し、調査データの点と同じ遮蔽判定で尾根の陰の山頂は出さない。
 * 更新の仕方（操作中は止める・間引き・末尾更新）はHomeTerrain3DPointsと同じ。
 * 眺望中はHomeVistaPeakLabels（上部の縦書き＋引き出し線）に任せる。
 */
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { COLOR } from '../../constants/AppConstants';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { terrain3dVistaStore } from '../../utils/terrain3d/vistaStore';
import { loadPeakIndex, PeakIndex } from '../../utils/peaks/peakData';
import { isPeaksUrl } from '../../utils/peaks/peak2dLabels';
import {
  PEAK_3D_SEARCH_RADIUS_M,
  Peak2DLabelCandidates,
  ProjectedPeak3D,
  selectPeak3DCandidates,
  thinPeak3DLabels,
} from '../../utils/peaks/peak3dLabels';
import { HaloText } from './HomeSeaLabels';

interface Props {
  scene: TerrainScene | null;
}

const PROJECT_INTERVAL_MS = 250;
const MAX_LABELS = 40;
/** ラベル1つの画面上の箱（間引き用）。「▲ 山名 標高」の横幅と2行ぶんの高さ */
const BOX_WIDTH = 110;
const BOX_HEIGHT = 26;
const TRIANGLE_SIZE = 12;
/** 左端の操作ボタン列を避ける幅（HomeVistaPeakLabelsと同じ） */
const LEFT_INSET = 56;

export const HomeTerrain3DPeakLabels = React.memo(({ scene }: Props) => {
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const peaksVisible = useMemo(
    () => tileMaps.some((tileMap) => tileMap.visible && !tileMap.isGroup && isPeaksUrl(tileMap.url)),
    [tileMaps]
  );
  const vistaActive = useSyncExternalStore(
    terrain3dVistaStore.subscribe,
    () => terrain3dVistaStore.getSnapshot().active
  );
  const active = peaksVisible && !vistaActive && scene !== null;

  const [index, setIndex] = useState<PeakIndex | null>(null);
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

  const [labels, setLabels] = useState<ProjectedPeak3D[]>([]);

  useEffect(() => {
    if (!active || scene === null || index === null) {
      setLabels([]);
      return;
    }
    // 候補は注視点とズームが大きく変わったときだけ選び直す（毎回8千件を見ない）
    let candidates: Peak2DLabelCandidates = [];
    let candidateKey = '';
    let lastUpdate = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const update = () => {
      const state = scene.controller.getState();
      const key = `${state.latitude.toFixed(2)},${state.longitude.toFixed(2)},${Math.floor(state.zoom)}`;
      if (key !== candidateKey) {
        candidateKey = key;
        candidates = selectPeak3DCandidates(
          index.query(state.latitude, state.longitude, PEAK_3D_SEARCH_RADIUS_M),
          state,
          state.zoom
        );
      }
      const projected: ProjectedPeak3D[] = [];
      for (const peak of candidates) {
        const screen = scene.projectToScreen(peak.latitude, peak.longitude);
        if (screen !== null && screen.x >= LEFT_INSET) projected.push({ ...peak, x: screen.x, y: screen.y });
      }
      setLabels(thinPeak3DLabels(projected, { boxWidth: BOX_WIDTH, boxHeight: BOX_HEIGHT, maxLabels: MAX_LABELS }));
    };

    const unsubscribe = scene.addFrameListener(() => {
      if (scene.interacting) return;
      const now = Date.now();
      if (scene.cameraSettled) {
        if (trailing !== null) {
          clearTimeout(trailing);
          trailing = null;
        }
        lastUpdate = now;
        update();
        return;
      }
      if (now - lastUpdate < PROJECT_INTERVAL_MS) {
        if (trailing === null) {
          trailing = setTimeout(() => {
            trailing = null;
            lastUpdate = Date.now();
            update();
          }, PROJECT_INTERVAL_MS);
        }
        return;
      }
      lastUpdate = now;
      update();
    });
    update();
    return () => {
      if (trailing !== null) clearTimeout(trailing);
      unsubscribe();
    };
  }, [active, scene, index]);

  if (!active || labels.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {labels.map((label) => (
        <PeakMarker key={label.key} x={label.x} y={label.y} text={label.text} />
      ))}
    </View>
  );
});

/** 1件ぶん。位置はtransformではなくleft/topで与える（HomeTerrain3DPointsと同じ理由） */
const PeakMarker = React.memo(({ x, y, text }: { x: number; y: number; text: string }) => {
  const anchorStyle = useMemo(() => [styles.anchor, { left: x, top: y }], [x, y]);
  return (
    <View style={anchorStyle}>
      <View style={styles.body}>
        {/* ▲にも白フチを付ける（航空写真など暗い地図では焦げ茶だけだと沈んで見えない） */}
        <HaloText text="▲" textStyle={styles.triangle} haloStyle={styles.triangleHalo} />
        <HaloText text={text} textStyle={styles.label} haloStyle={styles.halo} />
      </View>
    </View>
  );
});

const LABEL_BOX_WIDTH = 200;

const styles = StyleSheet.create({
  anchor: {
    height: 0,
    position: 'absolute',
    width: 0,
  },
  // ▲の中心が投影位置に乗るように、▲の高さの半分だけ上へずらす
  body: {
    alignItems: 'center',
    left: -LABEL_BOX_WIDTH / 2,
    position: 'absolute',
    top: -TRIANGLE_SIZE / 2,
    width: LABEL_BOX_WIDTH,
  },
  halo: {
    color: COLOR.WHITE,
    fontSize: 11,
    fontWeight: 'bold',
    position: 'absolute',
  },
  label: {
    color: COLOR.PEAK_LABEL,
    fontSize: 11,
    fontWeight: 'bold',
  },
  triangle: {
    color: COLOR.PEAK_LABEL,
    fontSize: 10,
    lineHeight: TRIANGLE_SIZE,
  },
  triangleHalo: {
    color: COLOR.WHITE,
    fontSize: 10,
    lineHeight: TRIANGLE_SIZE,
    position: 'absolute',
  },
});
