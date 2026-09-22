/**
 * 3D描画の計測値を画面へ出すための外部ストア（開発時のみ）。
 *
 * 実機ではMetroのコンソールを見られない場面が多く（現地での確認・リリース手前の実機検証）、
 * console.logでは原因の切り分けができない。headingStoreと同じくuseSyncExternalStoreで
 * 購読し、再レンダリングを計測表示だけに閉じ込める。
 */
let text = '';
const listeners = new Set<() => void>();

export const terrain3dPerfStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): string => text,
  set: (value: string): void => {
    if (value === text) return;
    text = value;
    listeners.forEach((listener) => listener());
  },
};
