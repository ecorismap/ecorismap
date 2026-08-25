import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { TileMapType } from '../../types';
import { isReliefUrl, toDemUrl } from '../../utils/terrainShading';
import { reliefStyleFromUrl } from '../../utils/colorRelief';
import { selectSeaLabels } from '../../utils/seaLabels';
import { ContourLabelPoint, selectContourLabels } from '../../utils/contourLabels';
import { ViewportBounds } from '../../utils/ViewportCulling';
import { MARKER_BAND, markerZIndex } from '../../utils/markerZIndex';
import { COLOR, TILE_FOLDER } from '../../constants/AppConstants';

interface Props {
  tileMaps: TileMapType[];
  bounds: ViewportBounds | null;
  zoom: number;
}

/**
 * GEBCO海底地形図（relief:// + #style=gebco）表示中に、島名・海底地形名（海しる由来の
 * 同梱データ）と等値線の数値ラベルをMarkerで重ねる。タイル焼き込みと違い、画面空間の
 * ネイティブ文字描画なので鮮明・正立・タイル境界切れなし。
 * 間引きはワールド格子方式（seaLabels/contourLabels参照）。
 */
export const HomeSeaLabels = React.memo((props: Props) => {
  const { tileMaps, bounds, zoom } = props;

  const gebcoMap = useMemo(
    () =>
      tileMaps.find(
        (tileMap) =>
          tileMap.visible && !tileMap.isGroup && isReliefUrl(tileMap.url) && reliefStyleFromUrl(tileMap.url) === 'gebco'
      ) ?? null,
    [tileMaps]
  );
  const gebcoDemUrl = gebcoMap === null ? null : toDemUrl(gebcoMap.url);
  // オフラインダウンロード済みの生DEMタイルの置き場（機内モードでも数値ラベルを出すため）
  const offlineTileFolder = gebcoMap === null || Platform.OS === 'web' ? null : `${TILE_FOLDER}/${gebcoMap.id}`;

  const nameLabels = useMemo(
    () => (gebcoDemUrl !== null && bounds !== null ? selectSeaLabels(bounds, zoom) : []),
    [gebcoDemUrl, bounds, zoom]
  );

  // 等値線の数値ラベルはDEMタイルの取得を伴うので非同期に計算する
  const [contourLabels, setContourLabels] = useState<ContourLabelPoint[]>([]);
  const requestIdRef = useRef(0);
  useEffect(() => {
    if (gebcoDemUrl === null || bounds === null) {
      setContourLabels([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    selectContourLabels(gebcoDemUrl, bounds, zoom, offlineTileFolder)
      .then((labels) => {
        if (requestIdRef.current === requestId) setContourLabels(labels);
      })
      .catch(() => {
        if (requestIdRef.current === requestId) setContourLabels([]);
      });
  }, [gebcoDemUrl, bounds, zoom, offlineTileFolder]);

  if (nameLabels.length === 0 && contourLabels.length === 0) return null;

  return (
    <>
      {contourLabels.map((label) => (
        <Marker
          key={label.key}
          coordinate={{ latitude: label.lat, longitude: label.lon }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={Platform.OS === 'ios' ? markerZIndex(MARKER_BAND.SEA_LABEL, label.key) : undefined}
        >
          <View style={styles.container}>
            <HaloText text={label.text} textStyle={styles.contourLabel} haloStyle={styles.contourHalo} />
          </View>
        </Marker>
      ))}
      {nameLabels.map((label) => (
        <Marker
          // 見た目に影響する値をkeyに含め、変更時はremountで再描画する（tracksViewChanges=false運用の定石）
          key={label.key}
          coordinate={{ latitude: label.lat, longitude: label.lon }}
          // 黒点が座標に乗るように上端中央を基準にする（View先頭が黒点）
          anchor={{ x: 0.5, y: 0.06 }}
          tracksViewChanges={false}
          zIndex={Platform.OS === 'ios' ? markerZIndex(MARKER_BAND.SEA_LABEL, label.key) : undefined}
        >
          {/* New ArchのAndroidは先頭子のサイズで切り出すため、単一Viewにまとめる */}
          <View style={styles.container}>
            <View style={styles.dot} />
            <HaloText text={label.name} textStyle={styles.label} haloStyle={styles.halo} />
          </View>
        </Marker>
      ))}
    </>
  );
});

/** RNのtextShadowでは縁取りが弱いので、白文字を8方向にずらして重ねてフチにする */
const HaloText = React.memo(
  (props: { text: string; textStyle: object; haloStyle: object }) => (
    <View>
      {HALO_OFFSETS.map((offset, index) => (
        <Text
          key={index}
          style={[props.haloStyle, { left: offset.x, top: offset.y }]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {props.text}
        </Text>
      ))}
      <Text style={props.textStyle} numberOfLines={1} allowFontScaling={false}>
        {props.text}
      </Text>
    </View>
  )
);

const HALO_OFFSETS = [
  { x: -1.5, y: 0 },
  { x: 1.5, y: 0 },
  { x: 0, y: -1.5 },
  { x: 0, y: 1.5 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  contourHalo: {
    color: COLOR.WHITE,
    fontSize: 10,
    fontWeight: 'bold',
    position: 'absolute',
  },
  contourLabel: {
    color: COLOR.BLACK,
    fontSize: 10,
    fontWeight: 'bold',
  },
  dot: {
    backgroundColor: COLOR.BLACK,
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
  halo: {
    color: COLOR.WHITE,
    fontSize: 11,
    fontWeight: 'bold',
    position: 'absolute',
  },
  label: {
    color: COLOR.BLACK,
    fontSize: 11,
    fontWeight: 'bold',
  },
});
