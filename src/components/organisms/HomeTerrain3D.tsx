/**
 * ネイティブ3D地形ビュー。
 *
 * isTerrainActive時にMapViewの代わりに表示され、自作エンジン（src/utils/terrain3d/）で
 * DEM地形＋表示中ラスタタイルを描画する。ジェスチャは
 * 1本指パン / ピンチズーム / 2本指回転 / 2本指縦ドラッグ（チルト）。
 * カメラはジェスチャ終了時にmapRegionへ同期し、2D復帰時に視点が引き継がれる。
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { editSettingsAction } from '../../modules/settings';
import { TileMapType } from '../../types';
import { withTileSignature } from '../../utils/TileSignature';
import { isDemProtocolUrl } from '../../utils/terrainShading';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { cameraToRegion } from '../../utils/terrain3d/coords';
import { REGION_SYNC_THROTTLE_MS } from '../../utils/terrain3d/constants';
import { LayerSpec, Terrain3DHandle } from '../../utils/terrain3d/types';
import { deltaToZoom } from '../../utils/Coords';
import { useWindow } from '../../hooks/useWindow';
import { MapViewContext } from '../../contexts/MapView';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';

/** 3Dで同時に描画するラスタレイヤの上限（重畳描画のコスト対策） */
const MAX_3D_LAYERS = 3;

/** 表示中tileMapsから3Dで描けるラスタXYZレイヤを抽出する（配列末尾が最下層） */
export const selectTerrainLayers = (
  tileMaps: TileMapType[],
  tileSignatures: RootState['tileSignatures']
): LayerSpec[] => {
  const drawable = tileMaps.filter((tileMap) => {
    if (!tileMap.visible || tileMap.isGroup || !tileMap.url) return false;
    const url = tileMap.url;
    // ベクタ・PMTiles・PDF・陰影プロトコルはv1非対応（陰影はライティングで代替）
    if (url.startsWith('pmtiles://') || url.includes('.pmtiles') || url.includes('.pbf')) return false;
    if (url.endsWith('.pdf') || url.startsWith('pdf://')) return false;
    if (isDemProtocolUrl(url)) return false;
    return true;
  });
  // tileMapsは先頭ほど上に表示される。上位MAX_3D_LAYERS枚を採用し、下層から並べる
  return drawable
    .slice(0, MAX_3D_LAYERS)
    .reverse()
    .map((tileMap) => ({
      id: tileMap.id,
      urlTemplate: withTileSignature(tileMap.url, tileSignatures),
      opacity: 1 - tileMap.transparency,
      minimumZ: tileMap.minimumZ,
      maximumZ: tileMap.maximumZ,
      flipY: tileMap.flipY,
    }));
};

export const HomeTerrain3D = React.memo(() => {
  const dispatch = useDispatch();
  const { mapRegion, windowHeight, windowWidth } = useWindow();
  const { onDragMapView, mapViewRef } = useContext(MapViewContext);
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const tileSignatures = useSelector((state: RootState) => state.tileSignatures);
  const sceneRef = useRef<TerrainScene | null>(null);
  const rafRef = useRef<number | null>(null);
  const handleRef = useRef<Terrain3DHandle | null>(null);
  const lastSyncRef = useRef(0);
  // ジェスチャコールバックから最新値を参照するためのref
  const viewportRef = useRef({ width: windowWidth, height: windowHeight });
  viewportRef.current = { width: windowWidth, height: windowHeight };

  const layers = useMemo(() => selectTerrainLayers(tileMaps, tileSignatures), [tileMaps, tileSignatures]);
  const layersRef = useRef(layers);

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
      const scene = new TerrainScene(gl, mapRegion, viewportRef.current.height);
      sceneRef.current = scene;
      scene.setLayers(layersRef.current);
      const loop = (t: number) => {
        scene.frame(t);
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
          const zoom =
            region.latitudeDelta !== undefined && region.longitudeDelta !== undefined
              ? deltaToZoom(viewportRef.current.width, {
                  latitudeDelta: region.latitudeDelta,
                  longitudeDelta: region.longitudeDelta,
                }).decimalZoom
              : undefined;
          animate({ center: { latitude: region.latitude, longitude: region.longitude }, zoom }, duration);
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

  // レイヤ構成の変化を反映
  useEffect(() => {
    layersRef.current = layers;
    sceneRef.current?.setLayers(layers);
  }, [layers]);

  // ビューポートサイズの変化を反映
  useEffect(() => {
    sceneRef.current?.setViewportHeight(windowHeight);
  }, [windowHeight]);

  // バックグラウンドで描画ループを停止（電池対策）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (rafRef.current === null && sceneRef.current !== null) {
          const loop = (t: number) => {
            sceneRef.current?.frame(t);
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

  const gestures = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onStart(() => {
        sceneRef.current?.controller.stopInertia();
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
    return Gesture.Simultaneous(pan, pinch, rotation, tilt);
  }, [onDragMapView, syncRegion]);

  return (
    <GestureDetector gesture={gestures}>
      <GLView style={styles.gl} onContextCreate={onContextCreate} />
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  gl: {
    flex: 1,
  },
});
