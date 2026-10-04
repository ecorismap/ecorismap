/**
 * 眺望の山名表示のON/OFF。眺望バナーのボタンとラベル層だけが購読する
 * （terrain3dVistaStoreと同じ理由で、ページのstateには持たない）。
 */
let enabled = true;
const listeners = new Set<() => void>();

export const peakLabelsStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): boolean => enabled,
  toggle: (): void => {
    enabled = !enabled;
    listeners.forEach((listener) => listener());
  },
};
