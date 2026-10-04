/**
 * 2D地図に山名（▲＋山名＋標高）をMarkerで重ねる（ネイティブ）。
 *
 * 地図一覧の「山名」（peaks://）が表示中のときだけ出す。データは眺望の山名と同じ同梱データ
 * （src/presets/data/gsi_peaks.json）。選び方は peak2dLabels.ts（ランク別の表示開始ズーム＋
 * ワールド格子の間引き）。見た目と重ね順は海の地名（HomeSeaLabels）に揃え、地物データより背面に置く。
 * Web版はmaplibreのsymbolレイヤで描く（Home.web.tsx）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { TileMapType } from '../../types';
import { ViewportBounds } from '../../utils/ViewportCulling';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';
import { COLOR } from '../../constants/AppConstants';
import { loadPeakIndex, PeakIndex } from '../../utils/peaks/peakData';
import { isPeaksUrl, selectPeak2DLabels } from '../../utils/peaks/peak2dLabels';
import { HaloText } from './HomeSeaLabels';

interface Props {
  tileMaps: TileMapType[];
  bounds: ViewportBounds | null;
  zoom: number;
}

export const HomePeakLabels = React.memo((props: Props) => {
  const { tileMaps, bounds, zoom } = props;
  const peaksMap = useMemo(
    () => tileMaps.find((tileMap) => tileMap.visible && !tileMap.isGroup && isPeaksUrl(tileMap.url)) ?? null,
    [tileMaps]
  );

  const [index, setIndex] = useState<PeakIndex | null>(null);
  useEffect(() => {
    if (peaksMap === null || index !== null) return;
    let cancelled = false;
    loadPeakIndex()
      .then((loaded) => {
        if (!cancelled) setIndex(loaded);
      })
      .catch((e) => console.warn('山頂データの読み込みに失敗', e));
    return () => {
      cancelled = true;
    };
  }, [peaksMap, index]);

  const labels = useMemo(
    () => (peaksMap !== null && index !== null && bounds !== null ? selectPeak2DLabels(index.all, bounds, zoom) : []),
    [peaksMap, index, bounds, zoom]
  );

  if (peaksMap === null || labels.length === 0) return null;
  const opacity = 1 - (peaksMap.transparency ?? 0);

  return (
    <>
      {labels.map((label) => (
        <Marker
          // 見た目に影響する値をkeyに含め、変更時はremountで再描画する（tracksViewChanges=false運用の定石）
          key={`${label.key}-${opacity}`}
          coordinate={{ latitude: label.latitude, longitude: label.longitude }}
          // ▲の中心が山頂に乗るように、上寄りを基準にする（View先頭が▲）
          anchor={{ x: 0.5, y: 0.12 }}
          tracksViewChanges={false}
          zIndex={Platform.OS === 'ios' ? markerZIndex(MARKER_BAND.SEA_LABEL, label.key) : undefined}
        >
          {/* New ArchのAndroidは先頭子のサイズで切り出すため、単一Viewにまとめる */}
          <View style={[styles.container, { opacity }]}>
            <Text style={styles.triangle} allowFontScaling={false}>
              ▲
            </Text>
            <HaloText text={label.text} textStyle={styles.label} haloStyle={styles.halo} />
          </View>
        </Marker>
      ))}
    </>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
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
    lineHeight: 12,
  },
});
