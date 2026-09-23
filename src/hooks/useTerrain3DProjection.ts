/**
 * 3Dシーンのカメラで緯度経度を画面座標へ投影し、描画フレームに合わせて追従させる。
 *
 * 3Dキャンバスの上にRNのビュー（現在地マーカー・フォーカスマーカー）を重ねるための共通処理。
 * 間引きの加減はどれも同じ経験則に依るので、コピーせずここへ集約する:
 * - カメラが止まっているフレームは間引かない（タイルや標高が新しくなった瞬間だけ描かれるため、
 *   ここを落とすと粗いDEMで置いた位置にマーカーが取り残される）
 * - 間引いている間も末尾更新を予約し、最後のフレームを取りこぼさない
 */
import { useEffect, useRef, useState } from 'react';
import { TerrainScene } from '../utils/terrain3d/TerrainScene';

export interface ProjectedPoint {
  /** 画面座標[dp] */
  x: number;
  y: number;
  /**
   * 投影した時点のカメラ方位[度]。
   * 向きを持つマーカー（現在地の矢印）が使う。投影位置と同じフレームの値でないと、
   * 回転の中心に居るマーカー（GPS追従中）は位置が変わらないぶん向きも更新されない
   */
  cameraHeading: number;
}

/** 実質同じなら更新しない（0.5px・0.5度未満は見た目に出ない） */
const isSameProjection = (prev: ProjectedPoint | null, next: ProjectedPoint): boolean =>
  prev !== null &&
  Math.abs(prev.x - next.x) < 0.5 &&
  Math.abs(prev.y - next.y) < 0.5 &&
  Math.abs(((prev.cameraHeading - next.cameraHeading + 540) % 360) - 180) < 0.5;

/**
 * @param scene 3Dシーン（未初期化ならnull）
 * @param location 投影する地点。nullなら非表示
 * @param intervalMs カメラが動いている間の更新間隔
 * @returns 画面座標とカメラ方位。画面外・カメラ後方・地形に隠れている場合はnull
 */
export const useTerrain3DProjection = (
  scene: TerrainScene | null,
  location: { latitude: number; longitude: number } | null,
  intervalMs: number
): ProjectedPoint | null => {
  const [screen, setScreen] = useState<ProjectedPoint | null>(null);

  // フレームリスナーから最新値を読むためのref（値が変わるたびに購読を張り直さない）
  const locationRef = useRef(location);
  locationRef.current = location;

  const updateRef = useRef<() => void>(() => undefined);
  updateRef.current = () => {
    const target = locationRef.current;
    if (scene === null || target === null) {
      setScreen(null);
      return;
    }
    // 標高はドレープ（ライン・ポリゴンを地形に貼る処理）とまったく同じ関数を通る
    const projected = scene.projectToScreen(target.latitude, target.longitude);
    if (projected === null) {
      setScreen(null);
      return;
    }
    const next: ProjectedPoint = { ...projected, cameraHeading: scene.controller.getState().heading };
    setScreen((prev) => (isSameProjection(prev, next) ? prev : next));
  };

  // 購読はsceneにだけ紐づける。依存を増やすと張り直しのたびに
  // cleanupが「最後のフレームに追いつくための末尾更新」を取り消してしまう
  useEffect(() => {
    if (scene === null) return;
    let lastUpdate = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = scene.addFrameListener(() => {
      const now = Date.now();
      if (scene.cameraSettled) {
        if (trailing !== null) {
          clearTimeout(trailing);
          trailing = null;
        }
        lastUpdate = now;
        updateRef.current();
        return;
      }
      if (now - lastUpdate < intervalMs) {
        if (trailing === null) {
          trailing = setTimeout(() => {
            trailing = null;
            lastUpdate = Date.now();
            updateRef.current();
          }, intervalMs);
        }
        return;
      }
      lastUpdate = now;
      updateRef.current();
    });
    updateRef.current();
    return () => {
      if (trailing !== null) clearTimeout(trailing);
      unsubscribe();
    };
  }, [scene, intervalMs]);

  // 地点が変わったときの即時反映。
  // カメラが静止しているとフレームは描かれない（dirty時のみ描画）ので、
  // フレームリスナー任せにすると地点が動いてもマーカーが動かない
  useEffect(() => {
    updateRef.current();
  }, [location]);

  return screen;
};
