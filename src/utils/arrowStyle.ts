import { Position } from 'geojson';

/** 終点に矢印を描くか（ARROW_START 以外の矢印種別） */
export const hasEndArrow = (style: unknown): boolean => style === 'ARROW_END' || style === 'ARROW_BOTH';

/** 始点に矢印を描くか */
export const hasStartArrow = (style: unknown): boolean => style === 'ARROW_START' || style === 'ARROW_BOTH';

const isSamePosition = (a: Position | undefined, b: Position | undefined) =>
  a !== undefined && b !== undefined && Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;

/**
 * 部分消去で分かれた断片の矢印種別と座標。元の線の始点・終点を含む断片にだけ、その端の矢印を残す（作図監査 E-L9）。
 * 元の種別をそのまま引き継ぐと、切れ目にも矢印が付いてしまう。矢印でない種別（ブラシ・空など）はそのまま返す。
 * 始点側だけ残る断片は座標を反転して ARROW_END で返す。ARROW_START を同期データへ出すと、
 * それを知らない出荷済みの版が終点（切れ目）に矢印を描いてしまうため
 */
export const arrowFragment = (
  style: unknown,
  original: Position[],
  fragment: Position[]
): { style: unknown; positions: Position[] } => {
  if (style !== 'ARROW_END' && style !== 'ARROW_BOTH' && style !== 'ARROW_START') return { style, positions: fragment };
  const keepsStart = hasStartArrow(style) && isSamePosition(fragment[0], original[0]);
  const keepsEnd = hasEndArrow(style) && isSamePosition(fragment[fragment.length - 1], original[original.length - 1]);
  if (keepsStart && keepsEnd) return { style: 'ARROW_BOTH', positions: fragment };
  if (keepsEnd) return { style: 'ARROW_END', positions: fragment };
  if (keepsStart) return { style: 'ARROW_END', positions: [...fragment].reverse() };
  return { style: 'NONE', positions: fragment };
};
