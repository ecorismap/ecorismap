import { guardAncestorScroll, restoreAncestorScroll, snapshotAncestorScroll } from '../ancestorScrollGuard.web';

type FakeNode = { parentElement: FakeNode | null; scrollTop: number; scrollLeft: number };

const makeChain = (): { leaf: FakeNode; panel: FakeNode; root: FakeNode } => {
  const root: FakeNode = { parentElement: null, scrollTop: 0, scrollLeft: 0 };
  const panel: FakeNode = { parentElement: root, scrollTop: 0, scrollLeft: 0 };
  const leaf: FakeNode = { parentElement: panel, scrollTop: 0, scrollLeft: 0 };
  return { leaf, panel, root };
};

describe('ancestorScrollGuard.web', () => {
  it('null/非DOMノードではスナップショットを作らない', () => {
    expect(snapshotAncestorScroll(null)).toBeNull();
    expect(snapshotAncestorScroll({})).toBeNull();
    expect(restoreAncestorScroll(null)).toBe(false);
  });

  it('フォーカス復帰でずれた overflow:hidden の祖先を元の位置へ戻す', () => {
    const { leaf, panel, root } = makeChain();
    panel.scrollTop = 10;
    const snapshot = snapshotAncestorScroll(leaf);

    // focus() による自動スクロールで左上へずれた状態
    panel.scrollTop = 180;
    panel.scrollLeft = 240;
    root.scrollTop = 30;

    expect(restoreAncestorScroll(snapshot)).toBe(true);
    expect(panel.scrollTop).toBe(10);
    expect(panel.scrollLeft).toBe(0);
    expect(root.scrollTop).toBe(0);
    expect(restoreAncestorScroll(snapshot)).toBe(false);
  });

  it('ガードは期限まで次フレームで戻し、解除後は触らない', () => {
    jest.useFakeTimers();
    const rafCallbacks: FrameRequestCallback[] = [];
    const g = globalThis as unknown as {
      document?: unknown;
      requestAnimationFrame?: unknown;
      cancelAnimationFrame?: unknown;
    };
    const saved = { document: g.document, raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
    const listeners: ((e: { target: unknown }) => void)[] = [];
    g.document = {
      addEventListener: (_t: string, fn: (e: { target: unknown }) => void) => listeners.push(fn),
      removeEventListener: (_t: string, fn: (e: { target: unknown }) => void) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
    g.requestAnimationFrame = (cb: FrameRequestCallback) => rafCallbacks.push(cb);
    g.cancelAnimationFrame = () => {};
    try {
      const { leaf, panel } = makeChain();
      const snapshot = snapshotAncestorScroll(leaf);
      guardAncestorScroll(snapshot, 500);

      // scrollイベントで即座に戻る
      panel.scrollLeft = 120;
      listeners.forEach((fn) => fn({ target: panel }));
      expect(panel.scrollLeft).toBe(0);

      // フレーム境界でも戻る
      panel.scrollTop = 50;
      rafCallbacks.shift()?.(0);
      expect(panel.scrollTop).toBe(0);

      // 期限切れ後はユーザーのスクロールを妨げない
      jest.advanceTimersByTime(500);
      expect(listeners).toHaveLength(0);
      panel.scrollTop = 70;
      rafCallbacks.splice(0).forEach((cb) => cb(0));
      expect(panel.scrollTop).toBe(70);
    } finally {
      g.document = saved.document;
      g.requestAnimationFrame = saved.raf;
      g.cancelAnimationFrame = saved.caf;
      jest.useRealTimers();
    }
  });
});
