/**
 * 眺望モード（その地点に立って見る視点）の状態を操作ボタンへ渡す外部ストア。
 *
 * ボタンは眺望中だけ高さ変更を出し、回転の向きも変える必要がある。
 * これをHomeページのuseStateで持つとページツリー全体が作り直され、
 * JSスレッドを共有する描画ループを削るので、購読はボタンだけに閉じ込める
 * （terrain3dHeadingStoreと同じ理由・同じ形）。
 */
export interface Terrain3DVistaState {
  active: boolean;
  /** 地上からの視点の高さ[m] */
  heightM: number;
  /** 画角（縦の視野角[度]）。眺望中のズームはこれを変える */
  fovDeg: number;
  /** 現在地に立つ眺望か。立ち位置が現在地の更新に付いていき、現在地マーカーは隠す */
  followCurrent: boolean;
}

const INACTIVE: Terrain3DVistaState = { active: false, heightM: 0, fovDeg: 0, followCurrent: false };

let state: Terrain3DVistaState = INACTIVE;
const listeners = new Set<() => void>();

export const terrain3dVistaStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): Terrain3DVistaState => state,
  set: (value: Terrain3DVistaState): void => {
    if (
      value.active === state.active &&
      value.heightM === state.heightM &&
      value.fovDeg === state.fovDeg &&
      value.followCurrent === state.followCurrent
    ) {
      return;
    }
    state = value;
    listeners.forEach((listener) => listener());
  },
  clear: (): void => {
    terrain3dVistaStore.set(INACTIVE);
  },
};

/**
 * 2Dの長押しメニューから「ここからの眺望」を選んだ地点。
 *
 * 2Dでは3Dシーンがまだ無いので、地点だけ預けて3Dへ切り替え、
 * シーンの初期化後にHomeTerrain3Dが受け取って眺望へ移す。
 */
interface PendingVista {
  latitude: number;
  longitude: number;
  /** 現在地からの眺望（立ち位置を現在地に付いていかせる） */
  followCurrent: boolean;
}

let pendingVista: PendingVista | null = null;

export const requestVistaOnEnter = (latitude: number, longitude: number, followCurrent = false): void => {
  pendingVista = { latitude, longitude, followCurrent };
};

/** 預けられた地点を取り出す（一度取り出したら消える） */
export const takePendingVista = (): PendingVista | null => {
  const value = pendingVista;
  pendingVista = null;
  return value;
};

/**
 * 眺望中に視線の方位を端末の向き（コンパス）に合わせているか。
 *
 * 方位はセンサーが握るので、見回しのドラッグ・2本指回転は左右を効かせない
 * （指とセンサーが方位を取り合うと視線が揺れる）。ジェスチャのコールバックから
 * 読むだけなので、購読の仕組みは持たない。
 */
let headingFollow = false;

export const setVistaHeadingFollow = (value: boolean): void => {
  headingFollow = value;
};

export const isVistaHeadingFollow = (): boolean => headingFollow;
