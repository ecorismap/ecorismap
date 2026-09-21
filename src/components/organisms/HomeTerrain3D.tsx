/**
 * ネイティブ3D地形ビュー。
 *
 * isTerrainActive時にMapViewの代わりに表示され、自作エンジン（src/utils/terrain3d/）で
 * DEM地形＋表示中ラスタタイルを描画する。ジェスチャは
 * 1本指パン / ピンチズーム / 2本指回転 / 2本指縦ドラッグ（チルト）。
 * カメラはジェスチャ終了時にmapRegionへ同期し、2D復帰時に視点が引き継がれる。
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { editSettingsAction } from '../../modules/settings';
import { TileMapType } from '../../types';
import { withTileSignature } from '../../utils/TileSignature';
import { isDemProtocolUrl } from '../../utils/terrainShading';
import { DataOverlaySpec, TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { parseColorToRgba } from '../../utils/terrain3d/colorUtils';
import { MERCATOR_CIRCUMFERENCE } from '../../utils/terrain3d/coords';
import { getColor, getLineWidthAtZoom, getLineWidth } from '../../utils/Layer';
import { LineRecordType, PointRecordType, PolygonRecordType } from '../../types';
import { HomeTerrain3DPoints } from './HomeTerrain3DPoints';
import { DataSelectionContext } from '../../contexts/DataSelection';
import { AppStateContext } from '../../contexts/AppState';
import { InfoToolContext } from '../../contexts/InfoTool';
import { cameraToRegion } from '../../utils/terrain3d/coords';
import { REGION_SYNC_THROTTLE_MS } from '../../utils/terrain3d/constants';
import { LayerSpec, Terrain3DHandle } from '../../utils/terrain3d/types';
import { deltaToZoom } from '../../utils/Coords';
import { useWindow } from '../../hooks/useWindow';
import { MapViewContext } from '../../contexts/MapView';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';

/**
 * 3Dで同時に描画するタイルレイヤの上限（重畳描画とテクスチャメモリのコスト対策）。
 * PMTiles（距離標等のベクタ）も1枠を使うため、部分配信の写真+ベース地図の
 * 実運用構成が収まるよう余裕を持たせる。範囲外タイル(missing)はコストゼロ
 */
const MAX_3D_LAYERS = 8;
/** 3Dでドレープ描画するライン・ポリゴンの上限件数（超過分は表示しない） */
const MAX_OVERLAY_FEATURES = 200;
/** ポリゴン塗りの不透明度（2Dの塗りに近い控えめな値） */
const POLYGON_FILL_ALPHA = 0.35;

/** 表示中tileMapsから3Dで描けるレイヤを抽出する（配列末尾が最下層） */
export const selectTerrainLayers = (
  tileMaps: TileMapType[],
  tileSignatures: RootState['tileSignatures'],
  isOffline: boolean
): LayerSpec[] => {
  const drawable = tileMaps.filter((tileMap) => {
    if (!tileMap.visible || tileMap.isGroup || !tileMap.url) return false;
    const url = tileMap.url;
    // PDF・陰影プロトコルは非対応（陰影はライティングで代替）。
    // PMTiles・pbf（ベクタ含む）は2Dと同じネイティブラスタライザで描画する
    if (url.endsWith('.pdf') || url.startsWith('pdf://')) return false;
    if (isDemProtocolUrl(url)) return false;
    return true;
  });
  // tileMapsは先頭ほど上に表示される。上位MAX_3D_LAYERS枚を採用し、下層から並べる
  return drawable
    .slice(0, MAX_3D_LAYERS)
    .reverse()
    .map((tileMap) => {
      const isPmtiles =
        tileMap.url.startsWith('pmtiles://') || tileMap.url.includes('.pmtiles') || tileMap.url.includes('.pbf');
      // オーバーズーム開始は2DのPMTile/UrlTile propsと同じ式
      const maximumNativeZ =
        isOffline && tileMap.overzoomThreshold > 16 && !tileMap.isVector
          ? 16
          : isOffline && tileMap.overzoomThreshold > 18 && tileMap.isVector
          ? 18
          : tileMap.overzoomThreshold;
      return {
        id: tileMap.id,
        urlTemplate: withTileSignature(tileMap.url, tileSignatures).replace('pmtiles://', ''),
        isPmtiles,
        isVector: !!tileMap.isVector,
        styleURL: tileMap.styleURL ? withTileSignature(tileMap.styleURL, tileSignatures) : undefined,
        opacity: 1 - tileMap.transparency,
        // 2DのPMTile描画（minimumZ=0/maximumZ=22固定）に合わせ、範囲はアーカイブ任せにする
        minimumZ: isPmtiles ? 0 : tileMap.minimumZ,
        maximumZ: isPmtiles ? 22 : tileMap.maximumZ,
        maximumNativeZ,
        offlineMode: isOffline,
        flipY: isPmtiles ? false : tileMap.flipY,
      };
    });
};

interface Props {
  /** カメラ方位の変化通知（コンパス盤面の連動用、約100ms/1°で間引き） */
  onHeadingChange?: (heading: number) => void;
}

export const HomeTerrain3D = React.memo(({ onHeadingChange }: Props) => {
  const dispatch = useDispatch();
  const { mapRegion, windowHeight, windowWidth } = useWindow();
  const { onDragMapView, mapViewRef, zoom } = useContext(MapViewContext);
  const { pointDataSet, lineDataSet, polygonDataSet } = useContext(DataSelectionContext);
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const tileSignatures = useSelector((state: RootState) => state.tileSignatures);
  const layers = useSelector((state: RootState) => state.layers);
  const { isOffline } = useContext(AppStateContext);
  const { getInfoOfMap, closeVectorTileInfo, getInfoOfFeatureAt } = useContext(InfoToolContext);
  const sceneRef = useRef<TerrainScene | null>(null);
  // ポイントオーバーレイへ渡す用（onContextCreateは非同期のためrefでは購読開始が間に合わない）
  const [sceneState, setSceneState] = useState<TerrainScene | null>(null);
  const rafRef = useRef<number | null>(null);
  const handleRef = useRef<Terrain3DHandle | null>(null);
  const lastSyncRef = useRef(0);
  // ジェスチャコールバックから最新値を参照するためのref
  const viewportRef = useRef({ width: windowWidth, height: windowHeight });
  viewportRef.current = { width: windowWidth, height: windowHeight };

  const terrainLayers = useMemo(
    () => selectTerrainLayers(tileMaps, tileSignatures, isOffline),
    [tileMaps, tileSignatures, isOffline]
  );
  const layersRef = useRef(terrainLayers);

  // 可視レイヤのライン・ポリゴンをドレープ描画の指定へ変換する
  const dataOverlaySpecs = useMemo(() => {
    const specs: DataOverlaySpec[] = [];
    // 線幅(px)→メルカトルm換算（整数ズーム単位で再計算し、再構築の頻発を避ける）
    const pxToMercator = MERCATOR_CIRCUMFERENCE / (256 * Math.pow(2, zoom));
    let featureCount = 0;
    for (const dataSet of lineDataSet) {
      const layer = layers.find((v) => v.id === dataSet.layerId);
      if (!layer?.visible) continue;
      for (const record of dataSet.data as LineRecordType[]) {
        if (!record.visible || !Array.isArray(record.coords) || record.coords.length < 2) continue;
        if (featureCount >= MAX_OVERLAY_FEATURES) break;
        featureCount++;
        const rgba = parseColorToRgba(getColor(layer, record));
        specs.push({
          id: `line-${dataSet.layerId}-${record.id}`,
          kind: 'line',
          coords: record.coords,
          color: rgba,
          widthMeters: Math.max(2, getLineWidthAtZoom(layer, record, zoom)) * pxToMercator,
        });
      }
    }
    for (const dataSet of polygonDataSet) {
      const layer = layers.find((v) => v.id === dataSet.layerId);
      if (!layer?.visible) continue;
      for (const record of dataSet.data as PolygonRecordType[]) {
        if (!record.visible || !Array.isArray(record.coords) || record.coords.length < 3) continue;
        if (featureCount >= MAX_OVERLAY_FEATURES) break;
        featureCount++;
        const rgba = parseColorToRgba(getColor(layer, record));
        specs.push({
          id: `polygon-${dataSet.layerId}-${record.id}`,
          kind: 'polygon',
          coords: record.coords,
          holes: record.holes,
          color: [rgba[0], rgba[1], rgba[2], rgba[3] * POLYGON_FILL_ALPHA],
        });
        // 輪郭線（外周リングを閉じたリボン）
        specs.push({
          id: `polygon-outline-${dataSet.layerId}-${record.id}`,
          kind: 'line',
          coords: [...record.coords, record.coords[0]],
          color: rgba,
          widthMeters: Math.max(2, getLineWidth(layer, record)) * pxToMercator,
        });
      }
    }
    return specs;
  }, [lineDataSet, polygonDataSet, layers, zoom]);
  const dataOverlaySpecsRef = useRef(dataOverlaySpecs);

  // カメラ→mapRegion同期（ジェスチャ終了時・スロットル付き）
  const syncRegion = useCallback(
    (force = false) => {
      const scene = sceneRef.current;
      if (scene === null) return;
      const now = Date.now();
      if (!force && now - lastSyncRef.current < REGION_SYNC_THROTTLE_MS) return;
      lastSyncRef.current = now;
      const { width, height } = viewportRef.current;
      dispatch(editSettingsAction({ mapRegion: cameraToRegion(scene.controller.getState(), width, height) }));
    },
    [dispatch]
  );
  const syncRegionRef = useRef(syncRegion);
  syncRegionRef.current = syncRegion;

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      // GLコンテキストが再生成された場合（iOSで発生しうる）に旧シーンとループを確実に破棄する
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      sceneRef.current?.dispose();
      const scene = new TerrainScene(gl, mapRegion, viewportRef.current.height);
      sceneRef.current = scene;
      setSceneState(scene);
      scene.setLayers(layersRef.current);
      scene.setDataOverlays(dataOverlaySpecsRef.current);
      // ハートビート再描画: 静止時も一定間隔で強制的に1フレーム描く。
      // iOSでプレゼントの取りこぼしや描画フラグの固着が起きても、最悪この間隔で自己回復する
      const HEARTBEAT_MS = 500;
      let lastRenderMs = 0;
      const loop = (t: number) => {
        const force = t - lastRenderMs > HEARTBEAT_MS;
        const rendered = scene.frame(t, force);
        if (rendered) lastRenderMs = t;
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

      // MapView互換のカメラ操作面をmapViewRefへ差し込む。
      // これでズームボタン(useMapView)やGPS追従・ヘディングアップ(useLocation)が3Dでも効く
      const animate = (
        target: { center?: { latitude: number; longitude: number }; heading?: number; zoom?: number; pitch?: number },
        duration: number
      ) => {
        scene.controller.animateTo(target, duration, performance.now());
        scene.markDirty();
        // アニメーション完了後にmapRegionへ同期（ズーム表記等の更新）
        setTimeout(() => syncRegionRef.current(true), duration + 80);
      };
      const handle: Terrain3DHandle = {
        isTerrain3D: true,
        animateCamera: (camera, opts) => animate(camera, opts?.duration ?? 300),
        animateToRegion: (region, duration = 300) => {
          const targetZoom =
            region.latitudeDelta !== undefined && region.longitudeDelta !== undefined
              ? deltaToZoom(viewportRef.current.width, {
                  latitudeDelta: region.latitudeDelta,
                  longitudeDelta: region.longitudeDelta,
                }).decimalZoom
              : undefined;
          animate({ center: { latitude: region.latitude, longitude: region.longitude }, zoom: targetZoom }, duration);
        },
        getCamera: async () => {
          const state = scene.controller.getState();
          return {
            center: { latitude: state.latitude, longitude: state.longitude },
            heading: state.heading,
            zoom: state.zoom,
            pitch: state.pitch,
          };
        },
        setCamera: (camera) => animate(camera, 0),
        rotateBy: (deltaDeg) => animate({ heading: scene.controller.getState().heading + deltaDeg }, 250),
        pitchBy: (deltaDeg) => animate({ pitch: scene.controller.getState().pitch + deltaDeg }, 250),
      };
      handleRef.current = handle;
      (mapViewRef as React.MutableRefObject<MapView | MapRef | Terrain3DHandle | null>).current = handle;
    },
    // mapRegionは起動時の初期視点としてのみ使う（以後はカメラが真）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // カメラ方位をコンパス盤面へ通知する（描画フレーム毎・間引き付き）
  const onHeadingChangeRef = useRef(onHeadingChange);
  onHeadingChangeRef.current = onHeadingChange;
  useEffect(() => {
    if (sceneState === null) return;
    let lastSent = -999;
    let lastSentMs = 0;
    const emit = (force = false) => {
      const heading = sceneState.controller.getState().heading;
      const now = Date.now();
      const delta = Math.abs(((heading - lastSent + 540) % 360) - 180);
      if (!force && (delta < 1 || now - lastSentMs < 100)) return;
      lastSent = heading;
      lastSentMs = now;
      onHeadingChangeRef.current?.(heading);
    };
    emit(true);
    return sceneState.addFrameListener(() => emit());
  }, [sceneState]);

  // レイヤ構成の変化を反映
  useEffect(() => {
    layersRef.current = terrainLayers;
    sceneRef.current?.setLayers(terrainLayers);
  }, [terrainLayers]);

  // ライン・ポリゴンデータの変化を反映
  useEffect(() => {
    dataOverlaySpecsRef.current = dataOverlaySpecs;
    sceneRef.current?.setDataOverlays(dataOverlaySpecs);
  }, [dataOverlaySpecs]);

  // ビューポートサイズの変化を反映
  useEffect(() => {
    sceneRef.current?.setViewportHeight(windowHeight);
  }, [windowHeight]);

  // バックグラウンドで描画ループを停止（電池対策）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (rafRef.current === null && sceneRef.current !== null) {
          // 復帰時もハートビート付きループで再開（onContextCreate側と同じ規律）
          const HEARTBEAT_MS = 500;
          let lastRenderMs = 0;
          const loop = (t: number) => {
            const force = t - lastRenderMs > HEARTBEAT_MS;
            if (sceneRef.current?.frame(t, force)) lastRenderMs = t;
            rafRef.current = requestAnimationFrame(loop);
          };
          sceneRef.current.markDirty();
          rafRef.current = requestAnimationFrame(loop);
        }
      } else if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  // 破棄
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // 自分が差し込んだファサードだけを外す（2D復帰時はMapViewのrefが上書きする）
      const refMut = mapViewRef as React.MutableRefObject<MapView | MapRef | Terrain3DHandle | null>;
      if (refMut.current === handleRef.current) refMut.current = null;
      handleRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const infoRef = useRef({ getInfoOfMap, closeVectorTileInfo, getInfoOfFeatureAt });
  infoRef.current = { getInfoOfMap, closeVectorTileInfo, getInfoOfFeatureAt };
  // タップのポイント画面ピック用（ジェスチャコールバックから最新値を参照）
  const pickDataRef = useRef({ pointDataSet, layers });
  pickDataRef.current = { pointDataSet, layers };

  const gestures = useMemo(() => {
    // タップ: 地形上の地点へ逆投影し、2Dと同じ経路でベクタタイル情報をポップアップ表示する
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(300)
      .onEnd((e, success) => {
        if (!success) return;
        const scene = sceneRef.current;
        if (!scene) return;
        const { width, height } = viewportRef.current;
        const latlon = scene.unprojectToLatLon(e.x, e.y, width, height);
        if (latlon === null) return;
        const position = [latlon.longitude, latlon.latitude];
        // ポイントは画面上の距離で先にピックする（描画と同じ投影を使うため、
        // 俯瞰時の標高サンプル誤差で緯度経度判定が外れてもドットに確実に当たる）
        let pickPosition = position;
        let bestDp = 20;
        for (const dataSet of pickDataRef.current.pointDataSet) {
          const layer = pickDataRef.current.layers.find((v) => v.id === dataSet.layerId);
          if (!layer?.visible) continue;
          for (const record of dataSet.data as PointRecordType[]) {
            if (!record.visible || record.coords === undefined) continue;
            const screen = scene.projectToScreen(record.coords.latitude, record.coords.longitude, width, height);
            if (screen === null) continue;
            const d = Math.hypot(screen.x - e.x, screen.y - e.y);
            if (d < bestDp) {
              bestDp = d;
              pickPosition = [record.coords.longitude, record.coords.latitude];
            }
          }
        }
        // 2Dと同じ優先順: レイヤの地物（ポイント/ライン/ポリゴン/軌跡）を先にヒットテストし、
        // 何も見つからなければベクタタイル（PMTiles）の属性ポップアップへ
        infoRef.current
          .getInfoOfFeatureAt(pickPosition)
          .then((notFound) => {
            if (notFound) return infoRef.current.getInfoOfMap(position, [e.x, e.y]);
          })
          .catch(() => undefined);
      });
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onStart(() => {
        sceneRef.current?.controller.stopInertia();
        infoRef.current.closeVectorTileInfo();
        onDragMapView();
      })
      .onChange((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        scene.controller.panByScreenDelta(e.changeX, e.changeY);
        scene.markDirty();
      })
      .onEnd((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        scene.controller.startPanInertia(e.velocityX / 1000, e.velocityY / 1000);
        syncRegion(true);
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => infoRef.current.closeVectorTileInfo())
      .onChange((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        scene.controller.zoomByScale(e.scaleChange);
        scene.markDirty();
      })
      .onEnd(() => syncRegion(true));
    const rotation = Gesture.Rotation()
      .runOnJS(true)
      .onChange((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        // 2本指を時計回りに回すと地図が反時計回りに回る（2D地図と同じ感覚）
        scene.controller.rotateBy((-e.rotationChange * 180) / Math.PI);
        scene.markDirty();
      })
      .onEnd(() => syncRegion(true));
    const tilt = Gesture.Pan()
      .runOnJS(true)
      .minPointers(2)
      .maxPointers(2)
      .onChange((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        // 2本指で上へドラッグ=倒す（maplibreと同じ）
        scene.controller.pitchBy(-e.changeY * 0.3);
        scene.markDirty();
      })
      .onEnd(() => syncRegion(true));
    // タップは移動系ジェスチャとRace構成にする（Simultaneousだとパン中もタップ判定が発火する）
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch, rotation, tilt));
  }, [onDragMapView, syncRegion]);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={gestures}>
        <GLView style={styles.gl} onContextCreate={onContextCreate} />
      </GestureDetector>
      <HomeTerrain3DPoints scene={sceneState} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gl: {
    flex: 1,
  },
});
