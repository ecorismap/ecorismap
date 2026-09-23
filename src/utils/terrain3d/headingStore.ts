/**
 * 3Dカメラの方位をコンパス盤面へ渡すための外部ストア。
 *
 * 3D中は描画フレーム毎（間引いても約10Hz）に方位が変わる。これをHomeページのuseStateで
 * 持つとページツリー全体が10Hzで再レンダリングされ、JSスレッドを共有する描画ループと
 * ジェスチャの応答性を削ってしまう。useSyncExternalStoreで購読することで、
 * 再レンダリングをコンパス盤面だけに閉じ込める。
 */
let heading = 0;
const listeners = new Set<() => void>();

export const terrain3dHeadingStore = {
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
