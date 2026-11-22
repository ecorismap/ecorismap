import {
  formatTrackTime,
  initialTrackDiscardWatchState,
  isSampleLocation,
  observeTrackAccuracy,
  TrackDiscardWatchState,
  TRACK_DISCARD_NOTICE_MIN_DURATION_MS,
  TRACK_DISCARD_NOTICE_MIN_POINTS,
} from '../trackRecordingNotice';

const RECORD = 100;

describe('isSampleLocation（途中経過の位置、軌跡監査 T-L6）', () => {
  it('sample:true だけを途中経過とみなす', () => {
    expect(isSampleLocation({ sample: true })).toBe(true);
    expect(isSampleLocation({ sample: false })).toBe(false);
    expect(isSampleLocation({})).toBe(false);
    expect(isSampleLocation(null)).toBe(false);
    expect(isSampleLocation(undefined)).toBe(false);
  });
});

describe('observeTrackAccuracy（精度で捨てられ続けたら知らせる、軌跡監査 T-M5）', () => {
  const feed = (accuracies: (number | null)[], startAt = 0, intervalMs = 10_000) => {
    let state: TrackDiscardWatchState = initialTrackDiscardWatchState;
    const notices: number[] = [];
    accuracies.forEach((accuracy, i) => {
      const r = observeTrackAccuracy(state, accuracy, startAt + i * intervalMs, RECORD);
      state = r.state;
      if (r.notify) notices.push(i);
    });
    return { state, notices };
  };

  it('点数と時間の両方を満たしたときに1回だけ知らせる', () => {
    const { notices } = feed(Array(20).fill(5000));
    // 10点目（index 9）は経過90秒で両方を満たす
    expect(notices).toEqual([TRACK_DISCARD_NOTICE_MIN_POINTS - 1]);
  });

  it('点数が足りても時間が短ければ知らせない', () => {
    const { notices } = feed(Array(TRACK_DISCARD_NOTICE_MIN_POINTS * 2).fill(5000), 0, 1000);
    // 1秒間隔なら、時間の条件を満たす61点目まで知らせない
    expect(notices).toEqual([]);
    const longer = feed(Array(TRACK_DISCARD_NOTICE_MIN_DURATION_MS / 1000 + 1).fill(5000), 0, 1000);
    expect(longer.notices).toEqual([TRACK_DISCARD_NOTICE_MIN_DURATION_MS / 1000]);
  });

  it('使える点が届いたら数え直し、次に続いたらまた知らせる', () => {
    const bad = Array(10).fill(5000);
    const { notices } = feed([...bad, 10, ...bad]);
    expect(notices).toEqual([9, 20]);
  });

  it('精度が記録の閾値以下・不明の点は捨てられないので数えない', () => {
    const { notices, state } = feed([...Array(15).fill(RECORD), null]);
    expect(notices).toEqual([]);
    expect(state).toEqual(initialTrackDiscardWatchState);
  });
});

describe('formatTrackTime（中断の時刻、軌跡監査 T-M4）', () => {
  it('同じ日なら時:分、別の日なら日付つき', () => {
    const ts = new Date(2026, 10, 22, 9, 5).getTime();
    expect(formatTrackTime(ts, new Date(2026, 10, 22, 18, 0).getTime())).toBe('09:05');
    expect(formatTrackTime(ts, new Date(2026, 10, 23, 8, 0).getTime())).toBe('2026/11/22 09:05');
  });
});
