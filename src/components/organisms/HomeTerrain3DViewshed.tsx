/**
 * 3D表示中の可視領域。
 *
 * 2DのHomeViewshedPreviewに相当する。見える範囲は可視グリッドをマスクにして
 * 地形のシェーダで塗り（起伏にぴったり沿う）、範囲の円は地形に貼るリボンで描く。
 * 眺望でも地形に貼ったまま見えるので、立った目線で「どの斜面が見えるか」を確かめられる。
 *
 * 描画そのものはTerrainSceneに任せ、このコンポーネントは指定を作って渡すだけ（画面には何も出さない）。
 */
import React, { useContext, useEffect, useMemo } from 'react';
import { COLOR } from '../../constants/AppConstants';
import { MapViewStableContext } from '../../contexts/MapViewStable';
import { ViewshedContext } from '../../contexts/Viewshed';
import { parseColorToRgba, Rgba } from '../../utils/terrain3d/colorUtils';
import { TerrainScene } from '../../utils/terrain3d/TerrainScene';
import { trackWidthMeters } from '../../utils/terrain3d/trackOverlay';
import { buildViewshedCircleSpecs, composeViewshedMask } from '../../utils/terrain3d/viewshedMask';

interface Props {
  scene: TerrainScene | null;
}

/** 見える範囲の塗り。2Dの半透明赤（rgba(255, 0, 0, 0.4)）に合わせる */
const VIEWSHED_FILL: Rgba = [1, 0, 0, 0.4];

export const HomeTerrain3DViewshed = React.memo(({ scene }: Props) => {
  const { viewshedResults } = useContext(ViewshedContext);
  // ズームは範囲円の線幅の換算にだけ使う。位置更新で再レンダリングされない安定値のコンテキストから取る
  const { zoom } = useContext(MapViewStableContext);

  // 結果が増減したときだけ作り直す（数百万画素の走査になりうるため）
  const mask = useMemo(() => composeViewshedMask(viewshedResults.map((result) => result.raster)), [viewshedResults]);
  const circleColor = useMemo(() => parseColorToRgba(COLOR.RED), []);
  const widthMeters = useMemo(() => trackWidthMeters(zoom) * 0.5, [zoom]);

  useEffect(() => {
    scene?.setViewshedMask(mask, VIEWSHED_FILL);
  }, [scene, mask]);

  useEffect(() => {
    scene?.setOverlays('viewshed', buildViewshedCircleSpecs(viewshedResults, widthMeters, circleColor));
  }, [scene, viewshedResults, widthMeters, circleColor]);

  // 2Dへ戻る・3Dを閉じるときに残さない
  useEffect(() => {
    return () => {
      scene?.setViewshedMask(null, VIEWSHED_FILL);
      scene?.setOverlays('viewshed', []);
    };
  }, [scene]);

  return null;
});
