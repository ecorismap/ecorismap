/**
 * 軌跡リプレイの状態を、Reactのツリーを経由せずに配る外部ストア。
 *
 * Contextに載せると購読側（Homeコンテナ・地図のポップアップ）が再生のたびに
 * 作り直される。用途は次の3つだけ:
 * - 地図操作でフォーカス地点を消す処理を、セッション中は抑える（進行位置が消えてしまうため）
 * - 地図に触れたら再生を一時停止する
 * - 再生中は軌跡ポイントのポップアップを隠す（進行位置に追随して画面を覆い、
 *   ×を押しても次の更新で戻ってきてしまうため）
 *
 * 購読の形はterrain3dVistaStore・terrain3dHeadingStoreと揃えてある。
 */
export interface TrackReplayState {
  /** 再生セッション中か（一時停止中もtrue。停止・画面離脱でfalse） */
  engaged: boolean;
  /** いま進行しているか（一時停止中はfalse） */
  playing: boolean;
}

const IDLE: TrackReplayState = { engaged: false, playing: false };

let state: TrackReplayState = IDLE;
const listeners = new Set<() => void>();
let pauseRequest: (() => void) | null = null;

export const trackReplayStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): TrackReplayState => state,
  set: (value: TrackReplayState): void => {
    if (value.engaged === state.engaged && value.playing === state.playing) return;
    state = value;
    listeners.forEach((listener) => listener());
  },
  clear: (): void => {
    trackReplayStore.set(IDLE);
  },
};

/** 再生セッション中か（React外から見る用） */
export const isTrackReplayEngaged = (): boolean => state.engaged;

/**
 * 一時停止の依頼先を登録する（再生フックが呼ぶ）。
 * @returns 登録解除
 */
export const registerTrackReplayPause = (handler: () => void): (() => void) => {
  pauseRequest = handler;
  return () => {
    if (pauseRequest === handler) pauseRequest = null;
  };
};

/** 地図に触れたときなど、外から一時停止を依頼する */
export const requestTrackReplayPause = (): void => {
  if (state.playing) pauseRequest?.();
};
