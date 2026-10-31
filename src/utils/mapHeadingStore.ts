/**
 * 2D地図（react-native-maps）のカメラ方位をコンパス盤面・現在地マーカーへ渡すための外部ストア。
 *
 * 手で回転している最中は方位が高頻度で変わる。Homeページのstateで持つとページツリー全体が
 * 再レンダリングされるため、terrain3dHeadingStoreと同様にuseSyncExternalStoreで購読させ、
 * 再レンダリングを盤面とマーカーに閉じ込める。
 */
let heading = 0;
const listeners = new Set<() => void>();

export const mapHeadingStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): number => heading,
  set: (value: number): void => {
    if (value === heading) return;
    heading = value;
    listeners.forEach((listener) => listener());
  },
};

// これ未満の傾きは北が上とみなす（回転を戻した直後の誤差やピンチ中のわずかな回転で盤面の意味を切り替えない）
const NORTH_UP_EPSILON_DEG = 0.5;

/** 地図が北が上の状態から回転しているか */
export const isMapRotated = (headingDeg: number | undefined): boolean => {
  if (headingDeg === undefined || !Number.isFinite(headingDeg)) return false;
  return Math.abs(((headingDeg % 360) + 540) % 360 - 180) > NORTH_UP_EPSILON_DEG;
};
