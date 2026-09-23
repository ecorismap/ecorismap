/**
 * ネイティブ3D地形ビュー。
 *
 * isTerrainActive時にMapViewの代わりに表示され、自作エンジン（src/utils/terrain3d/）で
 * DEM地形＋表示中ラスタタイルを描画する。ジェスチャは
 * 1本指パン / ピンチズーム / 2本指回転 / 2本指縦ドラッグ（チルト）。
 * カメラはジェスチャ終了時にmapRegionへ同期し、2D復帰時に視点が引き継がれる。
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, LayoutChangeEvent, PixelRatio, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, CanvasRef, RNCanvasContext } from 'react-native-webgpu';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { editSettingsAction } from '../../modules/settings';
import { TileMapType } from '../../types';
import { withTileSignature } from '../../utils/TileSignature';
import { isDemProtocolUrl, isReliefUrl, toDemUrl } from '../../utils/terrainShading';
import { reliefStyleFromUrl } from '../../utils/colorRelief';
import { DataOverlaySpec, TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { parseColorToRgba } from '../../utils/terrain3d/colorUtils';
import { MERCATOR_CIRCUMFERENCE } from '../../utils/terrain3d/coords';
import { getColor, getLineWidthAtZoom, getLineWidth } from '../../utils/Layer';
import { LineRecordType, PointRecordType, PolygonRecordType } from '../../types';
import { HomeTerrain3DPoints } from './HomeTerrain3DPoints';
import { HomeTerrain3DTrack } from './HomeTerrain3DTrack';
import { HomeTerrain3DCurrentMarker } from './HomeTerrain3DCurrentMarker';
import { HomeTerrain3DFocusMarker } from './HomeTerrain3DFocusMarker';
import { HomeTerrain3DPerf } from './HomeTerrain3DPerf';
import { DataSelectionContext } from '../../contexts/DataSelection';
import { AppStateContext } from '../../contexts/AppState';
import { InfoToolContext } from '../../contexts/InfoTool';
import { cameraToRegion } from '../../utils/terrain3d/coords';
import {
  LONG_PRESS_MAX_MOVE_DP,
  LONG_PRESS_MS,
  MAX_PITCH_DEG,
  MAX_TERRAIN_LAYERS,
  REGION_SYNC_THROTTLE_MS,
  REPLAY_ENTER_MS,
  REPLAY_PITCH_DEG,
  VISTA_DURATION_MS,
  VISTA_EYE_HEIGHT_M,
  VISTA_MAX_PITCH_DEG,
} from '../../utils/terrain3d/constants';
import { LayerSpec, Terrain3DCameraState, Terrain3DHandle } from '../../utils/terrain3d/types';
import { deltaToZoom } from '../../utils/Coords';
import { useWindow } from '../../hooks/useWindow';
import { MapViewStableContext } from '../../contexts/MapViewStable';
import { terrain3dHeadingStore } from '../../utils/terrain3d/headingStore';
import { requestTrackReplayPause } from '../../utils/trackReplayStore';
import { replayEyeDistanceM } from '../../utils/terrain3d/replayCamera';
import { getTerrainDevice } from '../../utils/terrain3d/webgpuSupport';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';

/**
 * 開発時の検証: ポイントの緯度経度にGPUで十字を描く。
 *
 * Reactで重ねるドットと、GPUが地形へ貼る十字を見比べるための仕掛け。
 * ずれの原因が「JS側の標高」か「地形テクスチャ」かを切り分けられる。
 * 常時は要らないのでfalse。調査するときだけtrueにする
 */
const DEBUG_POINT_CROSS = false;

/**
 * 開発時の検証: fps・JS時間・GPU待ち・DEMデコード枚数などを画面に重ねる。
 *
 * 実機ではMetroのコンソールを見られない場面が多く、性能や
 * タイル・標高まわりを調べるときだけtrueにする（計測ログ自体は常に出ている）
 */
const DEBUG_PERF_HUD = false;

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
    // PDF・陰影（hillshade://）は非対応（陰影はライティングで代替）。
    // 段彩（relief://）はJSで生成して貼る。GEBCOスタイルなら地形も海底モードになる。
    // PMTiles・pbf（ベクタ含む）は2Dと同じネイティブラスタライザで描画する
    if (url.endsWith('.pdf') || url.startsWith('pdf://')) return false;
    if (isDemProtocolUrl(url) && !isReliefUrl(url)) return false;
    return true;
  });
  // tileMapsは先頭ほど上に表示される。上位MAX_TERRAIN_LAYERS枚を採用し、下層から並べる
  return drawable
    .slice(0, MAX_TERRAIN_LAYERS)
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
      if (isReliefUrl(tileMap.url)) {
        return {
          id: tileMap.id,
          urlTemplate: toDemUrl(withTileSignature(tileMap.url, tileSignatures)),
          relief: { style: reliefStyleFromUrl(tileMap.url) },
          opacity: 1 - tileMap.transparency,
          minimumZ: tileMap.minimumZ,
          maximumZ: tileMap.maximumZ,
          maximumNativeZ,
          offlineMode: isOffline,
          flipY: tileMap.flipY,
        };
      }
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

export const HomeTerrain3D = React.memo(() => {
  const dispatch = useDispatch();
  const { mapRegion, windowHeight, windowWidth } = useWindow();
  // 位置・方位を含むMapViewContextではなく安定値だけのコンテキストを購読する
  // （GPS更新のたびに再レンダリングされると描画ループとジェスチャを阻害するため）
  const { onDragMapView, mapViewRef, zoom, setMapLocationInfo } = useContext(MapViewStableContext);
  const { pointDataSet, lineDataSet, polygonDataSet } = useContext(DataSelectionContext);
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const tileSignatures = useSelector((state: RootState) => state.tileSignatures);
  const layers = useSelector((state: RootState) => state.layers);
  const { isOffline } = useContext(AppStateContext);
  const { getInfoOfMap, closeVectorTileInfo, getInfoOfFeatureAt } = useContext(InfoToolContext);
  const sceneRef = useRef<TerrainScene | null>(null);
  // ポイントオーバーレイへ渡す用（初期化は非同期のためrefでは購読開始が間に合わない）
  const [sceneState, setSceneState] = useState<TerrainScene | null>(null);
  const canvasRef = useRef<CanvasRef>(null);
  /** getContextはビューのレイアウト確定後でないとサイズが取れない */
  const [canvasLaidOut, setCanvasLaidOut] = useState(false);
  /** デバイスロストからの再初期化トリガー */
  const [deviceGeneration, setDeviceGeneration] = useState(0);
  /** onLayoutで実測したキャンバスのdpサイズ */
  const canvasLayoutRef = useRef({ width: 0, height: 0 });
  const gpuRef = useRef<{ device: GPUDevice; context: RNCanvasContext; format: GPUTextureFormat } | null>(null);
  const rafRef = useRef<number | null>(null);
  const handleRef = useRef<Terrain3DHandle | null>(null);
  const lastSyncRef = useRef(0);
  /** 直近にmapRegionへ同期したカメラ状態（無変化のdispatchを弾く） */
  const lastSyncedCameraRef = useRef<Terrain3DCameraState | null>(null);
  /** animate()が仕掛けた同期タイマー（追従中に何重にも積まない） */
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // 2D(HomePolygon)と同じく、塗りなし設定のレイヤは輪郭線だけを描く
        if (!layer.colorStyle.transparency) {
          specs.push({
            id: `polygon-${dataSet.layerId}-${record.id}`,
            kind: 'polygon',
            coords: record.coords,
            holes: record.holes,
            color: [rgba[0], rgba[1], rgba[2], rgba[3] * POLYGON_FILL_ALPHA],
          });
        }
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
    // 開発時の検証用: ポイントと同じ緯度経度にGPUが描く十字を置く。
    // Reactで重ねる赤ドットと、GPUが地形に貼る十字がずれるなら原因はオーバーレイ側、
    // 両方が地図(ラスタ)からずれるならテクスチャ側、と切り分けられる
    if (__DEV__ && DEBUG_POINT_CROSS) {
      const d = 0.00025;
      let n = 0;
      for (const dataSet of pointDataSet) {
        for (const record of dataSet.data as PointRecordType[]) {
          if (!record.visible || record.coords === undefined || n >= 20) continue;
          n++;
          const { latitude: lat, longitude: lon } = record.coords;
          const w = 3 * pxToMercator;
          specs.push({
            id: `dbg-h-${record.id}`,
            kind: 'line',
            coords: [
              { latitude: lat, longitude: lon - d },
              { latitude: lat, longitude: lon },
              { latitude: lat, longitude: lon + d },
            ],
            color: [0, 0, 1, 1],
            widthMeters: w,
          });
          specs.push({
            id: `dbg-v-${record.id}`,
            kind: 'line',
            coords: [
              { latitude: lat - d, longitude: lon },
              { latitude: lat, longitude: lon },
              { latitude: lat + d, longitude: lon },
            ],
            color: [0, 0, 1, 1],
            widthMeters: w,
          });
        }
      }
    }
    return specs;
  }, [lineDataSet, polygonDataSet, pointDataSet, layers, zoom]);
  const dataOverlaySpecsRef = useRef(dataOverlaySpecs);

  // カメラ→mapRegion同期（ジェスチャ終了時・スロットル付き）。
  // dispatchはHomeツリー全体の再レンダリングを起こすため、実質変化がなければ打たない
  // （GPS追従のanimateCameraが位置更新のたびに呼ばれるため、これがないと常時再レンダリングになる）
  const syncRegion = useCallback(
    (force = false) => {
      const scene = sceneRef.current;
      if (scene === null) return;
      const now = Date.now();
      if (!force && now - lastSyncRef.current < REGION_SYNC_THROTTLE_MS) return;
      const camera = scene.controller.getState();
      const prev = lastSyncedCameraRef.current;
      if (prev !== null) {
        // 緯度経度の差は画面px換算で見る（ズームが浅いほど大きな移動まで無視してよい）
        const pxPerDeg = (256 * Math.pow(2, camera.zoom)) / 360;
        const movedPx = Math.hypot(camera.longitude - prev.longitude, camera.latitude - prev.latitude) * pxPerDeg;
        if (
          movedPx < 0.5 &&
          Math.abs(camera.zoom - prev.zoom) < 0.001 &&
          Math.abs(camera.heading - prev.heading) < 0.5 &&
          Math.abs(camera.pitch - prev.pitch) < 0.5
        ) {
          return;
        }
      }
      lastSyncRef.current = now;
      lastSyncedCameraRef.current = camera;
      const { width, height } = viewportRef.current;
      dispatch(editSettingsAction({ mapRegion: cameraToRegion(camera, width, height) }));
    },
    [dispatch]
  );
  const syncRegionRef = useRef(syncRegion);
  syncRegionRef.current = syncRegion;

  const initScene = useCallback(
    (device: GPUDevice, context: RNCanvasContext, presentationFormat: GPUTextureFormat) => {
      // デバイスロスト等で作り直す場合に備え、旧シーンとループを確実に破棄する
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      sceneRef.current?.dispose();
      const layout = canvasLayoutRef.current;
      const scene = new TerrainScene({ device, context, presentationFormat }, mapRegion, layout.height);
      scene.setViewportSize(layout.width, layout.height);
      sceneRef.current = scene;
      setSceneState(scene);
      scene.setLayers(layersRef.current);
      scene.setDataOverlays(dataOverlaySpecsRef.current);
      const loop = (t: number) => {
        scene.frame(t, false);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);

      // MapView互換のカメラ操作面をmapViewRefへ差し込む。
      // これでズームボタン(useMapView)やGPS追従・ヘディングアップ(useLocation)が3Dでも効く
      const animate = (
        target: { center?: { latitude: number; longitude: number }; heading?: number; zoom?: number; pitch?: number },
        duration: number,
        // 眺望中は水平より上も向けるよう、ピッチ上限を広げる
        maxPitchDeg = scene.isVistaActive ? VISTA_MAX_PITCH_DEG : MAX_PITCH_DEG
      ) => {
        // リプレイ追従中は注視点をリプレイが握っている。GPS追従（useLocationの
        // animateCamera）が毎回の位置更新でcenterを書きに来るので、ここで落とす
        if (scene.isReplayActive && target.center !== undefined) {
          const { center, ...rest } = target;
          void center;
          target = rest;
        }
        scene.controller.animateTo(target, duration, performance.now(), maxPitchDeg);
        scene.markDirty();
        // アニメーション完了後にmapRegionへ同期（ズーム表記等の更新）。
        // GPS追従は位置更新のたびにanimateCameraを呼ぶため、未消化のタイマーがあれば積み増さない。
        // ここはスロットルを効かせる（force=false）: 追従中に毎回dispatchすると
        // mapRegionを購読しているHome全体が秒間十数回作り直される
        if (syncTimerRef.current !== null) return;
        syncTimerRef.current = setTimeout(() => {
          syncTimerRef.current = null;
          syncRegionRef.current(false);
        }, duration + 80);
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
        moveToVista: (latitude, longitude) => {
          const moved = scene.moveToVista(latitude, longitude, VISTA_EYE_HEIGHT_M, performance.now(), VISTA_DURATION_MS);
          // 移動後の視点をmapRegionへ反映する（ズーム表記や2Dへ戻したときの位置）
          if (moved) setTimeout(() => syncRegionRef.current(true), VISTA_DURATION_MS + 80);
          return moved;
        },
        changeVistaHeight: (step) => {
          if (scene.changeVistaHeight(step)) syncRegionRef.current(true);
        },
        clearVista: () => {
          scene.clearVista(performance.now());
          syncRegionRef.current(true);
        },
        startReplay: (start, totalKm) => {
          scene.startReplay(
            start,
            replayEyeDistanceM(totalKm),
            REPLAY_PITCH_DEG,
            REPLAY_ENTER_MS,
            performance.now()
          );
        },
        setReplayTarget: (latitude, longitude, bearingDeg) => scene.setReplayTarget(latitude, longitude, bearingDeg),
        endReplay: () => {
          scene.stopReplay();
          // 追従をやめた位置をmapRegionへ反映する（2Dへ戻したときの視点）
          syncRegionRef.current(true);
        },
        isReplayFollowing: () => scene.isReplayActive,
        // 連打で積み上がるよう、進行中のアニメーションの到達点を基準に足す。
        // 眺望中はアイコンを「地図がどちらへ回るか」ではなく「自分がどちらへ向き直るか」と
        // 読むのが自然なので符号を反転する（地図を回すのと首を振るのは逆向きになる）
        rotateBy: (deltaDeg) =>
          animate({ heading: scene.controller.targetHeading + (scene.isVistaActive ? -deltaDeg : deltaDeg) }, 250),
        pitchBy: (deltaDeg) => animate({ pitch: scene.controller.targetPitch + deltaDeg }, 250),
        zoomBy: (deltaZoom) => animate({ zoom: scene.controller.targetZoom + deltaZoom }, 200),
      };
      handleRef.current = handle;
      (mapViewRef as React.MutableRefObject<MapView | MapRef | Terrain3DHandle | null>).current = handle;
    },
    // mapRegionは起動時の初期視点としてのみ使う（以後はカメラが真）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /**
   * 描画バッファをビューの実サイズ（物理ピクセル）へ合わせる。回転・レイアウト変更のたびに呼ぶ。
   * サイズはonLayoutの実測値を使う（canvas.clientWidthはレイアウト途中で0を返すことがあり、
   * それを信じると描画バッファが1x1に潰れて画面が真っ黒になる）
   */
  const resizeCanvas = useCallback(() => {
    const gpu = gpuRef.current;
    const layout = canvasLayoutRef.current;
    if (gpu === null || layout.width <= 0 || layout.height <= 0) return;
     
    const canvas = gpu.context.canvas as any;
    const width = Math.round(layout.width * PixelRatio.get());
    const height = Math.round(layout.height * PixelRatio.get());
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gpu.context.configure({ device: gpu.device, format: gpu.format, alphaMode: 'opaque' });
    sceneRef.current?.markDirty();
  }, []);

  const onCanvasLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      if (width <= 0 || height <= 0) return;
      canvasLayoutRef.current = { width, height };
      // 投影・逆投影は画面全体ではなくキャンバスの実寸を基準にする
      // （食い違うとドットの位置とタップ位置がずれる）
      sceneRef.current?.setViewportSize(width, height);
      setCanvasLaidOut(true);
      resizeCanvas();
    },
    [resizeCanvas]
  );

  // GPUデバイスとキャンバスコンテキストの初期化（非同期のため、レイアウト確定後）
  useEffect(() => {
    if (!canvasLaidOut) return;
    let cancelled = false;
    (async () => {
      const device = await getTerrainDevice();
      if (cancelled || device === null) return;
      const context = canvasRef.current?.getContext('webgpu') ?? null;
      if (cancelled || context === null) return;
      const format = navigator.gpu.getPreferredCanvasFormat();
      gpuRef.current = { device, context, format };
      resizeCanvas();
      if (cancelled) {
        gpuRef.current = null;
        return;
      }
      // デバイスを失った場合は作り直す（getTerrainDevice側もキャッシュを捨てている）
      device.lost.then(() => {
        if (!cancelled) setDeviceGeneration((n) => n + 1);
      });
      initScene(device, context, format);
    })();
    return () => {
      cancelled = true;
    };
  }, [canvasLaidOut, deviceGeneration, initScene, resizeCanvas]);

  // カメラ方位をコンパス盤面へ通知する（描画フレーム毎・間引き付き）。
  // 外部ストア経由なので、再レンダリングはコンパス盤面だけに閉じる
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
      terrain3dHeadingStore.set(heading);
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

  // ビューポートサイズの変化は onLayout（setViewportSize）で反映する。
  // 画面サイズではなくキャンバスの実寸が要るため、ここでは何もしない

  // バックグラウンドで描画ループを停止（電池対策）。
  // 'inactive' は通知センターを開いた等の一時状態（iOSシミュレータではウィンドウが
  // 最前面でない間ずっとこれになる）で、ここで止めると操作しても描画されなくなるため
  // 止めるのは 'background' のときだけにする
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') {
        if (rafRef.current === null && sceneRef.current !== null) {
          // 復帰時はサーフェスが作り直されている場合があるので、描画前にサイズを合わせ直す
          resizeCanvas();
          const loop = (t: number) => {
            sceneRef.current?.frame(t, false);
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
  }, [resizeCanvas]);

  // 破棄
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
      // 自分が差し込んだファサードだけを外す（2D復帰時はMapViewのrefが上書きする）
      const refMut = mapViewRef as React.MutableRefObject<MapView | MapRef | Terrain3DHandle | null>;
      if (refMut.current === handleRef.current) refMut.current = null;
      handleRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      // デバイスは次回の3D表示で再利用するためここでは破棄しない（webgpuSupportが保持）
      gpuRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const infoRef = useRef({ getInfoOfMap, closeVectorTileInfo, getInfoOfFeatureAt });
  infoRef.current = { getInfoOfMap, closeVectorTileInfo, getInfoOfFeatureAt };
  // タップのポイント画面ピック用（ジェスチャコールバックから最新値を参照）
  const pickDataRef = useRef({ pointDataSet, layers });
  pickDataRef.current = { pointDataSet, layers };
  // 長押しメニューの表示（ジェスチャのuseMemoを張り替えずに最新のsetterを呼ぶ）
  const longPressRef = useRef(setMapLocationInfo);
  longPressRef.current = setMapLocationInfo;

  const gestures = useMemo(() => {
    // 長押し: 2Dと同じ長押しメニュー（HomePoiPopup）をその場に出す。
    // 閾値・キャンセル条件は2D（containers/Home.tsx）に合わせる。
    // タップはmaxDuration(300)なので競合せず、指が動けばpanが勝って自動的に消える
    const longPress = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(LONG_PRESS_MS)
      .maxDistance(LONG_PRESS_MAX_MOVE_DP)
      .onStart((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        const latlon = scene.unprojectToLatLon(e.x, e.y);
        if (latlon === null) return; // 空を指した
        infoRef.current.closeVectorTileInfo();
        longPressRef.current({
          coordinate: { latitude: latlon.latitude, longitude: latlon.longitude },
          position: { x: e.x, y: e.y },
        });
      });
    // タップ: 地形上の地点へ逆投影し、2Dと同じ経路でベクタタイル情報をポップアップ表示する
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(300)
      .onEnd((e, success) => {
        if (!success) return;
        const scene = sceneRef.current;
        if (!scene) return;
        const latlon = scene.unprojectToLatLon(e.x, e.y);
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
            const screen = scene.projectToScreen(record.coords.latitude, record.coords.longitude);
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
    // 操作中はポイントの再投影などを止めるため、開始・終了をシーンへ知らせる
    // （onBegin/onFinalizeは失敗した場合も対で呼ばれるのでカウンタが狂わない）
    const markBegin = () => {
      // 再生中に地図へ触れたら一時停止する。追従だけ止めると進行位置が画面外へ
      // 消えていき、戻す手段がなくなる（動画プレイヤーと同じ挙動にする）
      requestTrackReplayPause();
      sceneRef.current?.beginInteraction();
    };
    const markFinalize = () => sceneRef.current?.endInteraction();
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .onBegin(markBegin)
      .onFinalize(markFinalize)
      .onStart(() => {
        sceneRef.current?.controller.stopInertia();
        infoRef.current.closeVectorTileInfo();
        onDragMapView();
      })
      .onChange((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        // 眺望中はその場で見回す（立ち位置は動かさない）
        if (scene.isVistaActive) scene.lookByScreenDelta(e.changeX, e.changeY);
        else {
          scene.controller.panByScreenDelta(e.changeX, e.changeY);
          scene.markDirty();
        }
      })
      .onEnd((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        // 見回しに慣性は付けない（立ち位置が動かないので流れる意味がなく、視界だけが滑る）
        if (!scene.isVistaActive) scene.controller.startPanInertia(e.velocityX / 1000, e.velocityY / 1000);
        syncRegion(true);
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(markBegin)
      .onFinalize(markFinalize)
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
      .onBegin(markBegin)
      .onFinalize(markFinalize)
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
      .onBegin(markBegin)
      .onFinalize(markFinalize)
      .onChange((e) => {
        const scene = sceneRef.current;
        if (!scene) return;
        // 2本指で上へドラッグ=倒す（maplibreと同じ）
        scene.controller.pitchBy(-e.changeY * 0.3);
        scene.markDirty();
      })
      .onEnd(() => syncRegion(true));
    // タップは移動系ジェスチャとRace構成にする（Simultaneousだとパン中もタップ判定が発火する）
    return Gesture.Race(longPress, tap, Gesture.Simultaneous(pan, pinch, rotation, tilt));
  }, [onDragMapView, syncRegion]);

  return (
    <View style={styles.container}>
      {/* GestureDetectorはCanvasへ直接付けるとタッチを受け取れないことがあるため、
          素のViewを挟んでそちらにハンドラを付ける（collapsable=falseでViewを残す） */}
      <GestureDetector gesture={gestures}>
        <View style={styles.gl} collapsable={false} onLayout={onCanvasLayout}>
          <Canvas ref={canvasRef} style={styles.gl} />
        </View>
      </GestureDetector>
      <HomeTerrain3DPoints scene={sceneState} />
      {/* 軌跡はGPU（シーンのオーバーレイ系統）へ指定を流すだけで、画面出力は持たない */}
      <HomeTerrain3DTrack scene={sceneState} />
      {/* 軌跡サマリーのカーソル位置（グラフをなぞる・リプレイ中の進行位置） */}
      <HomeTerrain3DFocusMarker scene={sceneState} />
      {/* 現在地はポイントより手前に置く（2DのCURRENT_MARKER_ZINDEXと同じ扱い） */}
      <HomeTerrain3DCurrentMarker scene={sceneState} />
      {DEBUG_PERF_HUD && <HomeTerrain3DPerf />}
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
