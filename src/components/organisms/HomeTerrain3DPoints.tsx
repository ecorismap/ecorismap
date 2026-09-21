/**
 * 3D表示中のポイントデータのオーバーレイ。
 *
 * 3Dシーンのカメラ行列で緯度経度をスクリーン座標へ投影し、
 * GLViewの上に2Dと同じ見た目のドット＋ラベル（PointView/PointLabel）を重ねる。
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
import { MapViewContext } from '../../contexts/MapView';
import { DataSelectionContext } from '../../contexts/DataSelection';
import { PointView, PointLabel } from '../atoms';

interface Props {
  scene: TerrainScene | null;
}

/** 3Dで同時に表示するポイント数の上限（投影計算のコスト対策） */
const MAX_3D_POINTS = 300;
/** 投影の更新間隔[ms] */
const PROJECT_INTERVAL_MS = 120;
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
  const { zoom } = useContext(MapViewContext);
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

  useEffect(() => {
    if (scene === null) return;
    let lastUpdate = 0;
    const update = () => {
      const result: ProjectedItem[] = [];
      const { width, height } = viewportRef.current;
      for (const item of itemsRef.current) {
        const screen = scene.projectToScreen(item.latitude, item.longitude, width, height);
        if (screen === null) continue;
        result.push({ ...item, x: screen.x, y: screen.y });
      }
      setProjected(result);
    };
    const unsubscribe = scene.addFrameListener(() => {
      const now = Date.now();
      if (now - lastUpdate < PROJECT_INTERVAL_MS) return;
      lastUpdate = now;
      update();
    });
    // データ変更時は即時反映
    update();
    return unsubscribe;
    // itemsはrefで参照するがデータ変更時の即時反映のため依存に含める
  }, [scene, items]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {projected.map((item) => (
        <View
          key={item.key}
          style={[styles.marker, { left: item.x - DOT_SIZE / 2, top: item.y - DOT_SIZE / 2 }]}
        >
          <PointView size={DOT_SIZE} color={item.color} borderColor={item.borderColor} />
          {item.label !== '' && <PointLabel label={item.label} size={15} color={item.color} borderColor={COLOR.WHITE} />}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  marker: {
    alignItems: 'center',
    position: 'absolute',
  },
});
