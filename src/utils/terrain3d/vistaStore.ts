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
}

const INACTIVE: Terrain3DVistaState = { active: false, heightM: 0 };

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
    if (value.active === state.active && value.heightM === state.heightM) return;
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
let pendingVista: { latitude: number; longitude: number } | null = null;

export const requestVistaOnEnter = (latitude: number, longitude: number): void => {
  pendingVista = { latitude, longitude };
};

/** 預けられた地点を取り出す（一度取り出したら消える） */
export const takePendingVista = (): { latitude: number; longitude: number } | null => {
  const value = pendingVista;
  pendingVista = null;
  return value;
};
