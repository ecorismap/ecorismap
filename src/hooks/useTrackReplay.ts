/**
 * 軌跡リプレイの再生制御。
 *
 * 進行位置はTrackFocus（標高グラフのカーソル）で表す。グラフ・2Dのマーカー・
 * 3Dのマーカーがすでにこれを見ているので、カーソルを時間で進めるだけで
 * 2D・3D両方が動く。3Dのカメラ追従だけはReactを通さず、毎フレーム
 * Terrain3DHandleへ直接届ける（60HzでReactのstateを触らないため）。
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { MapViewContext } from '../contexts/MapView';
import { TrackFocusSetterContext } from '../contexts/TrackFocus';
import { ElevationProfilePoint } from '../utils/trackStatistics';
import { interpolateProfileAt, REPLAY_DURATION_MS } from '../utils/trackReplay';
import { isTerrain3DHandle } from '../utils/terrain3d/types';
import { registerTrackReplayPause, trackReplayStore } from '../utils/trackReplayStore';

/** グラフのカーソル（＝Reactのstate）を動かす間隔[ms] */
const FOCUS_INTERVAL_MS = 100;

export interface TrackReplayControl {
  isReplaying: boolean;
  /** 再生できる軌跡か（標高プロファイルが無い・全長0なら不可） */
  canReplay: boolean;
  toggleReplay: () => void;
}

export const useTrackReplay = (profile: ElevationProfilePoint[]): TrackReplayControl => {
  const setTrackFocusPoint = useContext(TrackFocusSetterContext);
  const { mapViewRef } = useContext(MapViewContext);
  const [isReplaying, setIsReplaying] = useState(false);

  const totalKm = profile.length > 0 ? profile[profile.length - 1].distanceKm : 0;
  const canReplay = profile.length >= 2 && totalKm > 0;

  const rafRef = useRef<number | null>(null);
  const stateRef = useRef({ elapsedMs: 0, lastTickMs: 0, lastFocusMs: 0, lastIndex: -1 });
  /**
   * 再生に使うプロファイル。記録中は5秒ごとに作り直されるので、
   * 再生開始時に固定しないと進行位置が途中で飛ぶ
   */
  const profileRef = useRef(profile);
  if (!isReplaying) profileRef.current = profile;

  /**
   * 進行を止めてカメラの追従を外す。セッション（＝進行位置を保持している状態）は続く。
   *
   * 地図に触れたときもここまで戻すのは、追従だけ残すと操作とカメラが取り合いになり、
   * 距離バッファの撮り直しも止まったままになるため
   */
  const pause = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsReplaying(false);
    // 止めた地点の時刻・標高を見られるよう、セッションは残したままポップアップを戻す
    trackReplayStore.set({ engaged: true, playing: false });
    const handle = mapViewRef.current;
    if (isTerrain3DHandle(handle)) handle.endReplay();
  }, [mapViewRef]);

  /** セッションごと終える（終点到達・画面離脱）。以後は進行位置を保護しない */
  const stop = useCallback(() => {
    pause();
    trackReplayStore.clear();
  }, [pause]);

  const tick = useCallback(() => {
    const state = stateRef.current;
    const activeProfile = profileRef.current;
    const now = Date.now();
    // バックグラウンド復帰の巨大なdtで一気に進まないよう頭を抑える
    state.elapsedMs += Math.min(100, now - state.lastTickMs);
    state.lastTickMs = now;
    const progress = Math.min(1, state.elapsedMs / REPLAY_DURATION_MS);
    const sample = interpolateProfileAt(activeProfile, progress);
    if (sample === null) {
      stop();
      return;
    }

    // 3Dのカメラへは毎フレーム直接届ける（Reactのstateを介さない）。
    // 再生中に2D→3Dへ切り替えた場合も、追従していなければここで取り付ける
    const handle = mapViewRef.current;
    if (isTerrain3DHandle(handle)) {
      if (!handle.isReplayFollowing()) {
        handle.startReplay(
          { latitude: sample.latitude, longitude: sample.longitude, bearingDeg: sample.bearing },
          totalKm
        );
      }
      handle.setReplayTarget(sample.latitude, sample.longitude, sample.bearing);
    }

    // グラフのカーソルとマーカーは間引いて動かす（Reactの再レンダリングを伴うため）
    if (now - state.lastFocusMs >= FOCUS_INTERVAL_MS && sample.index !== state.lastIndex) {
      state.lastFocusMs = now;
      state.lastIndex = sample.index;
      setTrackFocusPoint({ ...activeProfile[sample.index], index: sample.index });
    }

    if (progress >= 1) {
      // 終点まで来たらカーソルを終点に合わせて止める（ループしない）
      const lastIndex = activeProfile.length - 1;
      setTrackFocusPoint({ ...activeProfile[lastIndex], index: lastIndex });
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [mapViewRef, setTrackFocusPoint, stop, totalKm]);

  const start = useCallback(() => {
    if (!canReplay) return;
    profileRef.current = profile;
    const state = stateRef.current;
    // 終端から押したときは頭から流し直す
    if (state.elapsedMs >= REPLAY_DURATION_MS) state.elapsedMs = 0;
    state.lastTickMs = Date.now();
    state.lastFocusMs = 0;
    state.lastIndex = -1;
    trackReplayStore.set({ engaged: true, playing: true });
    setIsReplaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [canReplay, profile, tick]);

  const toggleReplay = useCallback(() => {
    if (isReplaying) pause();
    else start();
  }, [isReplaying, pause, start]);

  // 地図に触れられたら一時停止する（3Dのジェスチャから依頼が来る）。
  // セッションは残すので、進行位置のマーカーは消えず、続きから再開できる
  useEffect(() => registerTrackReplayPause(pause), [pause]);

  // 画面を離れる・シートを閉じる・アンマウントで必ず止める
  useEffect(() => stop, [stop]);

  return { isReplaying, canReplay, toggleReplay };
};
