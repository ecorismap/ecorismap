/**
 * 3D表示中のポイントデータのオーバーレイ。
 *
 * 3Dシーンのカメラ行列で緯度経度をスクリーン座標へ投影し、
 * 3Dキャンバスの上に2Dと同じ見た目のドット＋ラベル（PointView/PointLabel）を重ねる。
 * 描画フレーム毎（スロットル付き）に位置を追従させる。タッチは透過。
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { COLOR } from '../../constants/AppConstants';
import { PointRecordType } from '../../types';
import { generateLabel, getColor } from '../../utils/Layer';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { useWindow } from '../../hooks/useWindow';
import { MapViewStableContext } from '../../contexts/MapViewStable';
import { DataSelectionContext } from '../../contexts/DataSelection';
import { PointView, PointLabel } from '../atoms';

interface Props {
  scene: TerrainScene | null;
}

/** 3Dで同時に表示するポイント数の上限（投影計算のコスト対策） */
const MAX_3D_POINTS = 300;
/** 投影の更新間隔[ms]。1回で最大300点ぶんのReact更新が走るので細かくしすぎない */
const PROJECT_INTERVAL_MS = 250;
const DOT_SIZE = 15;

interface PointItem {
  key: string;
  latitude: number;
  longitude: number;
  color: string;
  borderColor: string;
  label: string;
}

interface ProjectedItem extends PointItem {
  x: number;
  y: number;
}

export const HomeTerrain3DPoints = React.memo(({ scene }: Props) => {
  const { windowWidth, windowHeight } = useWindow();
  // 位置更新で再レンダリングされないよう安定値だけのコンテキストを購読する
  const { zoom } = useContext(MapViewStableContext);
  const { pointDataSet, selectedRecord } = useContext(DataSelectionContext);
  const layers = useSelector((state: RootState) => state.layers);
  const [projected, setProjected] = useState<ProjectedItem[]>([]);

  const items = useMemo(() => {
    const result: PointItem[] = [];
    for (const dataSet of pointDataSet) {
      const layer = layers.find((v) => v.id === dataSet.layerId);
      if (!layer?.visible) continue;
      for (const record of dataSet.data as PointRecordType[]) {
        if (!record.visible || record.coords === undefined) continue;
        if (result.length >= MAX_3D_POINTS) return result;
        const selected = selectedRecord?.record?.id === record.id;
        const color = getColor(layer, record);
        result.push({
          key: `${dataSet.layerId}-${record.id}`,
          latitude: record.coords.latitude,
          longitude: record.coords.longitude,
          color,
          borderColor: selected ? COLOR.BLACK : COLOR.WHITE,
          label: zoom > 8 ? generateLabel(layer, record) : '',
        });
      }
    }
    return result;
  }, [pointDataSet, layers, selectedRecord, zoom]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const viewportRef = useRef({ width: windowWidth, height: windowHeight });
  viewportRef.current = { width: windowWidth, height: windowHeight };

  const updateRef = useRef<() => void>(() => undefined);

  // 購読と末尾更新タイマーはsceneにだけ紐づける。
  // itemsに紐づけるとzoomが変わるたびに張り直しになり、cleanupが
  // 「最後のフレームに追いつくための末尾更新」を取り消してしまう。
  // 3D切替直後は粗いDEMしか届いていないので、その更新を落とすと
  // 標高が粗いままの位置でドットが固定され、ずれたまま戻らなくなる
  useEffect(() => {
    if (scene === null) return;
    let lastUpdate = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      const result: ProjectedItem[] = [];
      for (const item of itemsRef.current) {
        const screen = scene.projectToScreen(item.latitude, item.longitude);
        if (screen === null) continue;
        result.push({ ...item, x: screen.x, y: screen.y });
      }
      setProjected(result);
    };
    updateRef.current = update;
    const unsubscribe = scene.addFrameListener(() => {
      // ジェスチャ中は更新しない（指を離した直後のフレームで最終位置へ追いつく）。
      // 操作中の再投影はカメラに追従できない上、300点ぶんのReact更新が
      // ジェスチャのコールバックと同じスレッドを奪い合って操作を重くする
      if (scene.interacting) return;
      const now = Date.now();
      // カメラが止まっているときの描画は、タイルや標高が新しくなった瞬間だけ。
      // 数の多い更新ではないので間引かず即座に投影し直し、
      // 「粗いDEMで置いた位置にドットが取り残される」状態を作らない
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
        // 間引き中でも最後のフレームを取りこぼさないよう末尾更新を予約する
        // （最終描画を落とすとカメラ確定後もドットが古い位置に残る）
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
  }, [scene]);

  // データ（表示するポイントやラベル）が変わったときの即時反映。
  // 購読を張り直さないので、進行中の末尾更新は生き残る
  useEffect(() => {
    if (scene === null) return;
    updateRef.current();
  }, [scene, items]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {projected.map((item) => (
        <ProjectedPointMarker
          key={item.key}
          x={item.x}
          y={item.y}
          color={item.color}
          borderColor={item.borderColor}
          label={item.label}
        />
      ))}
    </View>
  );
});

/**
 * 1点ぶんのラベル。
 *
 * 位置が変わっていない点を再描画しないようmemo化する（300点を数Hzで作り直すと
 * それだけでJSスレッドが埋まる）。styleを毎回新しい配列で作ると差分が出て
 * memoが効かないので、transformの単一オブジェクトに畳んでいる。
 */
const ProjectedPointMarker = React.memo(
  ({
    x,
    y,
    color,
    borderColor,
    label,
  }: {
    x: number;
    y: number;
    color: string;
    borderColor: string;
    label: string;
  }) => {
    // 幅0のアンカーを投影座標に置き、ドットとラベルをそれぞれ絶対配置で中央合わせする
    // （コンテナのalignItemsだとラベル幅にドットが引きずられて位置がずれる）。
    // 位置はtransformではなくleft/topで与える。サイズ0のViewのtransform更新は
    // 画面に反映されず、マウント時の位置にドットが取り残された（遮蔽で作り直されるまで直らない）
    const anchorStyle = useMemo(() => [styles.anchor, { left: x, top: y }], [x, y]);
    return (
      <View style={anchorStyle}>
        <View style={styles.dot}>
          <PointView size={DOT_SIZE} color={color} borderColor={borderColor} />
        </View>
        {label !== '' && (
          <View style={styles.label}>
            <PointLabel label={label} size={15} color={color} borderColor={COLOR.WHITE} />
          </View>
        )}
      </View>
    );
  }
);

const LABEL_BOX_WIDTH = 200;

const styles = StyleSheet.create({
  anchor: {
    height: 0,
    position: 'absolute',
    width: 0,
  },
  dot: {
    left: -DOT_SIZE / 2,
    position: 'absolute',
    top: -DOT_SIZE / 2,
  },
  label: {
    alignItems: 'center',
    left: -LABEL_BOX_WIDTH / 2,
    position: 'absolute',
    top: DOT_SIZE / 2,
    width: LABEL_BOX_WIDTH,
  },
});
