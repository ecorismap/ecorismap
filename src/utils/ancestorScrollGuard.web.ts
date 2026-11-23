// react-native-webのModalは閉じるとき（ModalFocusTrapのアンマウント時）に、開く前に
// フォーカスしていた要素（ピッカーを開いたPressable）へ UIManager.focus → element.focus()
// でフォーカスを戻す。preventScroll なしの focus() はブラウザが要素を見せようとして
// 祖先を自動スクロールさせ、overflow:hidden の祖先（レイヤ編集パネル等）まで
// scrollTop/scrollLeft がずれる。その結果パネルが左上へずれて保存ボタンが押せなくなる
// （Shift+Tab で別要素へフォーカスすると戻る）。フォーカス復帰はキーボード操作のため残し、
// 開く前の祖先のスクロール位置を記録して、閉じた直後に起きたずれだけを戻す。

interface ScrollableNode {
  parentElement: ScrollableNode | null;
  scrollTop: number;
  scrollLeft: number;
}

interface ScrollEntry {
  el: ScrollableNode;
  top: number;
  left: number;
}

export type AncestorScrollSnapshot = ScrollEntry[] | null;

const isScrollableNode = (node: unknown): node is ScrollableNode =>
  typeof node === 'object' &&
  node !== null &&
  'parentElement' in node &&
  typeof (node as ScrollableNode).scrollTop === 'number' &&
  typeof (node as ScrollableNode).scrollLeft === 'number';

export const snapshotAncestorScroll = (node: unknown): AncestorScrollSnapshot => {
  if (!isScrollableNode(node)) return null;
  const entries: ScrollEntry[] = [];
  let el: ScrollableNode | null = node;
  while (el) {
    entries.push({ el, top: el.scrollTop, left: el.scrollLeft });
    el = el.parentElement;
  }
  return entries;
};

export const restoreAncestorScroll = (snapshot: AncestorScrollSnapshot): boolean => {
  if (!snapshot) return false;
  let changed = false;
  for (const { el, top, left } of snapshot) {
    if (el.scrollTop !== top) {
      el.scrollTop = top;
      changed = true;
    }
    if (el.scrollLeft !== left) {
      el.scrollLeft = left;
      changed = true;
    }
  }
  return changed;
};

/**
 * モーダルを閉じた直後の一定時間、記録した祖先がスクロールしたら元へ戻す。
 * フォーカス復帰はReactのコミット（エフェクト）内で閉じる操作より後に起きるため、
 * scrollイベント（キャプチャ）とフレーム境界の両方で戻す。scrollイベントは
 * 描画前に届くので、ずれが一瞬見えることもない。戻り値で途中解除できる。
 */
export const guardAncestorScroll = (snapshot: AncestorScrollSnapshot, durationMs = 500): (() => void) => {
  if (!snapshot || typeof document === 'undefined') return () => {};
  const targets = new Set<unknown>(snapshot.map((e) => e.el));
  let active = true;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const rafIds: number[] = [];

  const onScroll = (e: Event) => {
    if (!active) return;
    // ルート（html/body）のスクロールは target が document になる
    if (targets.has(e.target) || e.target === document) restoreAncestorScroll(snapshot);
  };

  const cancel = () => {
    if (!active) return;
    active = false;
    document.removeEventListener('scroll', onScroll, true);
    if (typeof cancelAnimationFrame === 'function') rafIds.forEach((id) => cancelAnimationFrame(id));
    timers.forEach((id) => clearTimeout(id));
  };

  document.addEventListener('scroll', onScroll, true);
  if (typeof requestAnimationFrame === 'function') {
    rafIds.push(
      requestAnimationFrame(() => {
        if (!active) return;
        restoreAncestorScroll(snapshot);
        rafIds.push(
          requestAnimationFrame(() => {
            if (active) restoreAncestorScroll(snapshot);
          })
        );
      })
    );
  }
  timers.push(setTimeout(cancel, durationMs));
  return cancel;
};
