/**
 * 3D表示中の「記録中の軌跡」。
 *
 * 2DのTrackLog（SavedTrackLog＋CurrentTrackLog）に相当する。データの取り出しは
 * 2Dとまったく同じMMKVチャンク（utils/Location.ts）から行い、3Dでは地形に
 * ドレープするリボンとしてGPUで描く。
 *
 * 描画そのものはTerrainSceneのオーバーレイ系統に任せ、このコンポーネントは
 * 「何を描くか」の指定を作って渡すだけ（画面には何も出さない）。
 * 保存済み（数千〜数万点・数分に1回しか増えない）と記録中（数百点・約1Hzで伸びる）を
 * 別系統にするのは、記録中の更新で保存済みぶんを作り直さないため。
 *
 * 保存後のトラック（trackレイヤのLINEレコード）はレイヤデータとして
 * HomeTerrain3D側で既に描かれるので、ここでは扱わない。
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { COLOR } from '../../constants/AppConstants';
import { TrackSegmentType } from '../../types';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { MapViewStableContext } from '../../contexts/MapViewStable';
import { getDisplayBufferSimplified, getTrackChunkForDisplay, splitTrackByAccuracy } from '../../utils/Location';
import { parseColorToRgba } from '../../utils/terrain3d/colorUtils';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { buildTrackOverlaySpecs, trackWidthMeters } from '../../utils/terrain3d/trackOverlay';

interface Props {
  scene: TerrainScene | null;
}

/** 保存済みチャンク1つあたりの表示点数（2DのSavedTrackLogと同じ） */
const SAVED_CHUNK_POINTS = 320;
/** 記録中チャンクの表示点数（2DのCurrentTrackLogと同じ） */
const CURRENT_CHUNK_POINTS = 400;

export const HomeTerrain3DTrack = React.memo(({ scene }: Props) => {
  const { trackMetadata } = useContext(LocationTrackingContext);
  // ズームは線幅の換算にだけ使う。位置更新で再レンダリングされない安定値のコンテキストから取る
  const { zoom } = useContext(MapViewStableContext);

  // Contextの既定値は{}なので、メタデータ未設定でも壊れないようにする
  const savedChunkCount = trackMetadata?.savedChunkCount ?? 0;
  const totalPoints = trackMetadata?.totalPoints ?? 0;

  // 線幅はメルカトルmでジオメトリへ焼き込まれるので、ズームが変わると作り直しになる
  const widthMeters = useMemo(() => trackWidthMeters(zoom), [zoom]);
  const color = useMemo(() => parseColorToRgba(COLOR.TRACK), []);

  // 記録中チャンク（小さい・約1Hz）。trackMetadataは元から1秒スロットル済み
  useEffect(() => {
    if (scene === null) return;
    const points = getDisplayBufferSimplified(CURRENT_CHUNK_POINTS);
    const specs =
      points.length === 0
        ? []
        : buildTrackOverlaySpecs(splitTrackByAccuracy(points), 'track-live', widthMeters, color);
    scene.setOverlays('trackLive', specs);
  }, [scene, widthMeters, color, totalPoints]);

  // 保存済みチャンク（大きい・500点ごとに1つ増える）。
  // MMKVの読み出しとJSONパースは1チャンクあたり数ms。まとめて読むと3D切替直後に
  // 描画が止まるので、2DのSavedTrackLogと同じくsetTimeout(0)で1チャンクずつ刻む
  const savedSegmentsRef = useRef<TrackSegmentType[]>([]);
  const [savedVersion, setSavedVersion] = useState(0);
  useEffect(() => {
    if (scene === null) return;
    if (savedChunkCount === 0) {
      savedSegmentsRef.current = [];
      setSavedVersion((v) => v + 1);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loaded: TrackSegmentType[] = [];
    let index = 0;
    const step = () => {
      if (cancelled) return;
      const chunk = getTrackChunkForDisplay(index, SAVED_CHUNK_POINTS);
      if (chunk.length > 0) loaded.push(...splitTrackByAccuracy(chunk));
      index++;
      if (index < savedChunkCount) {
        timer = setTimeout(step, 0);
        return;
      }
      savedSegmentsRef.current = loaded;
      setSavedVersion((v) => v + 1);
    };
    timer = setTimeout(step, 0);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
    // ズーム変化ではMMKVを読み直さない（線幅の作り直しは下のeffectで足りる）
  }, [scene, savedChunkCount]);

  // 読み込んだセグメントを指定へ変換する。線幅が変わるズーム変化でもやり直す
  useEffect(() => {
    if (scene === null) return;
    scene.setOverlays(
      'trackSaved',
      buildTrackOverlaySpecs(savedSegmentsRef.current, 'track-saved', widthMeters, color)
    );
  }, [scene, savedVersion, widthMeters, color]);

  // 2Dへ戻る・3Dを閉じるときに軌跡を残さない
  useEffect(() => {
    return () => {
      scene?.setOverlays('trackLive', []);
      scene?.setOverlays('trackSaved', []);
    };
  }, [scene]);

  return null;
});
