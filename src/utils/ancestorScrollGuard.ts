// ネイティブでは「モーダルを閉じたときのフォーカス復帰で祖先がスクロールする」問題が
// 起きないため何もしない。Web版の実装と理由は ancestorScrollGuard.web.ts を参照。

export type AncestorScrollSnapshot = unknown;

export const snapshotAncestorScroll = (_node: unknown): AncestorScrollSnapshot => null;

export const restoreAncestorScroll = (_snapshot: AncestorScrollSnapshot): boolean => false;

export const guardAncestorScroll =
  (_snapshot: AncestorScrollSnapshot, _durationMs?: number): (() => void) =>
  () => {};
