//地図タッチのタップ/ドラッグ判定。
//以前は「最後の移動から300msで解除されるドラッグフラグ」で判定していたため、地図を動かして
//指を止めてから離すとタップ扱いになり、指の真下の地物が選択されてしまっていた。
//ここではタッチ中の最大変位で判定し、一度ドラッグになったら離すまでドラッグのままにする。

//タップとドラッグの境界（px）。指の揺れ程度の動きはタップとみなす
export const TAP_SLOP_PX = 8;
//2本指ジェスチャー終了直後の単発タップは、遅れて離れた指の誤タップとみなし無視する猶予（ms）
export const MULTI_TOUCH_TAP_COOLDOWN_MS = 300;

export type TapDragTracker = {
  /** タッチ開始。開始位置を記録し最大変位をリセットする */
  start: (x: number, y: number) => void;
  /** 指の移動。最大変位を更新し、この移動で初めてドラッグになったときだけtrueを返す */
  move: (x: number, y: number) => boolean;
  /** タッチ終了。最大変位（離した位置も含む）を返し、状態をリセットする。開始記録がなければ0 */
  release: (x: number, y: number) => number;
  /** 地図側にタッチを奪われた等の中断。状態をリセットする */
  cancel: () => void;
};

export const createTapDragTracker = (slopPx: number = TAP_SLOP_PX): TapDragTracker => {
  let startPosition: { x: number; y: number } | null = null;
  let maxDistance = 0;

  const distanceFromStart = (x: number, y: number) =>
    startPosition === null ? 0 : Math.hypot(x - startPosition.x, y - startPosition.y);

  return {
    start: (x, y) => {
      startPosition = { x, y };
      maxDistance = 0;
    },
    move: (x, y) => {
      if (startPosition === null) return false;
      const wasDragging = maxDistance > slopPx;
      maxDistance = Math.max(maxDistance, distanceFromStart(x, y));
      return !wasDragging && maxDistance > slopPx;
    },
    release: (x, y) => {
      const distance = startPosition === null ? 0 : Math.max(maxDistance, distanceFromStart(x, y));
      startPosition = null;
      maxDistance = 0;
      return distance;
    },
    cancel: () => {
      startPosition = null;
      maxDistance = 0;
    },
  };
};

export const isDragDistance = (distance: number, slopPx: number = TAP_SLOP_PX) => distance > slopPx;

/**
 * リリース時に情報取得タップとして扱ってよいか。
 * 地図を動かしておらず、長押しポップアップも出しておらず、2本指ジェスチャーの直後でもない場合のみ
 */
export const shouldHandleAsTap = (params: {
  dragDistance: number;
  longPressFired: boolean;
  lastMultiTouchEnd: number;
  now: number;
}) =>
  !isDragDistance(params.dragDistance) &&
  !params.longPressFired &&
  params.now - params.lastMultiTouchEnd > MULTI_TOUCH_TAP_COOLDOWN_MS;
