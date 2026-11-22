// 軌跡の記録中に利用者へ知らせる判定（純粋関数）。useLocation とヘッドレスタスクから使う。
// ヘッドレスタスクからも読み込むので、重いモジュール（AppConstants は expo-file-system と i18n を読む）を import しない

/**
 * プラグインの途中経過の位置（getCurrentPosition や changePace の samples）かどうか。
 * プラグインは「samples は保存すべきでない」としている。現在地の表示には使い、軌跡には入れない（軌跡監査 T-L6）
 */
export const isSampleLocation = (location: unknown): boolean =>
  typeof location === 'object' && location !== null && (location as { sample?: unknown }).sample === true;

/** 軌跡の点が精度で捨てられ続けたと知らせるまでの点数と時間（両方を満たしたら知らせる） */
export const TRACK_DISCARD_NOTICE_MIN_POINTS = 10;
export const TRACK_DISCARD_NOTICE_MIN_DURATION_MS = 60_000;

/** checkLocations の精度フィルタと同じ条件（recordThreshold には TRACK_ACCURACY.RECORD を渡す） */
export const isDiscardedByAccuracy = (accuracy: number | null | undefined, recordThreshold: number): boolean =>
  typeof accuracy === 'number' && accuracy > recordThreshold;

export type TrackDiscardWatchState = {
  /** 続けて捨てられ始めた点の時刻。続いていなければ null */
  firstAt: number | null;
  count: number;
  /** この続きのあいだに知らせ済みか */
  notified: boolean;
};

export const initialTrackDiscardWatchState: TrackDiscardWatchState = { firstAt: null, count: 0, notified: false };

/**
 * 記録中に届いた点の精度を見て、精度で捨てられる点が続いているかを数える。
 * 使える点が1つ届いたら数え直す。続きのあいだに知らせるのは1回だけ（軌跡監査 T-M5）。
 * 「おおよその位置」の許可では精度が km 単位になり、記録中の表示のまま1点も保存されないため
 */
export const observeTrackAccuracy = (
  state: TrackDiscardWatchState,
  accuracy: number | null | undefined,
  timestamp: number,
  recordThreshold: number
): { state: TrackDiscardWatchState; notify: boolean } => {
  if (!isDiscardedByAccuracy(accuracy, recordThreshold)) {
    return { state: initialTrackDiscardWatchState, notify: false };
  }
  const firstAt = state.firstAt ?? timestamp;
  const count = state.count + 1;
  const reached = count >= TRACK_DISCARD_NOTICE_MIN_POINTS && timestamp - firstAt >= TRACK_DISCARD_NOTICE_MIN_DURATION_MS;
  const notify = reached && !state.notified;
  return { state: { firstAt, count, notified: state.notified || notify }, notify };
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 中断の知らせに出す時刻。同じ日なら時:分、別の日なら年/月/日 時:分（端末の時刻帯） */
export const formatTrackTime = (timestamp: number, now: number = Date.now()): string => {
  const d = new Date(timestamp);
  const n = new Date(now);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? hm : `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${hm}`;
};
