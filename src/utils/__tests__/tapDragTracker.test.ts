import {
  createTapDragTracker,
  isDragDistance,
  MULTI_TOUCH_TAP_COOLDOWN_MS,
  shouldHandleAsTap,
  TAP_SLOP_PX,
} from '../tapDragTracker';

describe('createTapDragTracker', () => {
  it('指の揺れ程度の動きはタップのまま', () => {
    const tracker = createTapDragTracker();
    tracker.start(100, 100);
    expect(tracker.move(103, 102)).toBe(false);
    const distance = tracker.release(104, 101);
    expect(isDragDistance(distance)).toBe(false);
  });

  it('閾値を超えた移動で一度だけドラッグ開始を返す', () => {
    const tracker = createTapDragTracker();
    tracker.start(100, 100);
    expect(tracker.move(105, 100)).toBe(false);
    expect(tracker.move(120, 100)).toBe(true);
    expect(tracker.move(140, 100)).toBe(false);
  });

  it('地図を動かして指を止めてから離してもドラッグのまま（300ms解除の回帰）', () => {
    jest.useFakeTimers();
    const tracker = createTapDragTracker();
    tracker.start(100, 100);
    tracker.move(160, 100);
    //指を止めて待つ（旧実装ではこの間にドラッグフラグが消えてタップ扱いになっていた）
    jest.advanceTimersByTime(1000);
    const distance = tracker.release(160, 100);
    expect(isDragDistance(distance)).toBe(true);
    jest.useRealTimers();
  });

  it('動かして開始位置に戻して離してもドラッグ', () => {
    const tracker = createTapDragTracker();
    tracker.start(100, 100);
    tracker.move(150, 100);
    tracker.move(100, 100);
    const distance = tracker.release(100, 100);
    expect(isDragDistance(distance)).toBe(true);
  });

  it('移動イベントが来ず離した位置だけ離れていてもドラッグ', () => {
    const tracker = createTapDragTracker();
    tracker.start(100, 100);
    const distance = tracker.release(100 + TAP_SLOP_PX + 1, 100);
    expect(isDragDistance(distance)).toBe(true);
  });

  it('releaseとcancelで状態がリセットされる', () => {
    const tracker = createTapDragTracker();
    tracker.start(0, 0);
    tracker.move(50, 0);
    tracker.release(50, 0);
    //開始記録がないので移動・解放は無反応
    expect(tracker.move(100, 0)).toBe(false);
    expect(tracker.release(100, 0)).toBe(0);

    tracker.start(0, 0);
    tracker.move(50, 0);
    tracker.cancel();
    expect(tracker.release(50, 0)).toBe(0);
  });
});

describe('shouldHandleAsTap', () => {
  const base = { dragDistance: 0, longPressFired: false, lastMultiTouchEnd: 0, now: 10_000 };

  it('純粋なタップは情報取得する', () => {
    expect(shouldHandleAsTap(base)).toBe(true);
  });

  it('ドラッグ後は情報取得しない', () => {
    expect(shouldHandleAsTap({ ...base, dragDistance: TAP_SLOP_PX + 1 })).toBe(false);
  });

  it('長押しポップアップを出した後は情報取得しない', () => {
    expect(shouldHandleAsTap({ ...base, longPressFired: true })).toBe(false);
  });

  it('2本指ジェスチャー直後の単発タップは無視し、猶予を過ぎれば受け付ける', () => {
    const lastMultiTouchEnd = 10_000;
    expect(
      shouldHandleAsTap({ ...base, lastMultiTouchEnd, now: lastMultiTouchEnd + MULTI_TOUCH_TAP_COOLDOWN_MS - 1 })
    ).toBe(false);
    expect(
      shouldHandleAsTap({ ...base, lastMultiTouchEnd, now: lastMultiTouchEnd + MULTI_TOUCH_TAP_COOLDOWN_MS + 1 })
    ).toBe(true);
  });
});
