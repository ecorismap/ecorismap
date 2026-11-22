// 軌跡ボタン（Home の pressTracking）の処理。Home はテストしにくいので、本体と判定をここに置く
import { stopAndSaveTrack } from './trackingLeaveGuard';

export type BusyFlag = { current: boolean };

/**
 * 処理中なら何もせず false を返す。そうでなければ処理中にして task を実行し、終わったら（失敗しても）戻して true を返す。
 * 軌跡の開始は OK のあと記録状態になるまで数十秒かかることがあり（位置の取得待ち）、その間ボタンは押せる。
 * 押し直して二重に開始すると、2回目の開始が1回目に記録した点を消していた（軌跡監査 T-M2）
 */
export const runIfIdle = async (busy: BusyFlag, task: () => Promise<void>): Promise<boolean> => {
  if (busy.current) return false;
  busy.current = true;
  try {
    await task();
    return true;
  } finally {
    busy.current = false;
  }
};

/**
 * 軌跡を止めて保存した結果のうち、利用者へ知らせる文言（なければ undefined）。
 * 失敗に加えて、点が足りず保存しなかった・無効な点を除いた、などの知らせも出す（軌跡監査 T-L1。
 * 離脱時の停止 finishTrackingBeforeLeave と同じ扱い）
 */
export const getTrackSaveNotice = (result: { isOK: boolean; message: string }): string | undefined =>
  !result.isOK || result.message !== '' ? result.message : undefined;

type TrackSaveResult<L extends { id: string }, R> = { isOK: boolean; message: string; layer?: L; record?: R };

export type TrackingPressFlags = {
  /** 開始の処理中（確認〜toggleTracking('on') の完了まで） */
  starting: BusyFlag;
  /** 停止・保存の処理中 */
  stopping: BusyFlag;
};

export type TrackingPressDeps<L extends { id: string }, R> = {
  trackingState: 'on' | 'off';
  flags: TrackingPressFlags;
  messages: { confirmStart: string; confirmStop: string; busy: string };
  checkUnsavedTrackLog: () => Promise<{ isOK: boolean; message: string }>;
  confirm: (message: string) => Promise<boolean>;
  alert: (message: string) => Promise<unknown>;
  waitForModalTransition: () => Promise<unknown>;
  confirmLocationPermission: () => Promise<'granted' | undefined>;
  toggleGPS: (state: 'follow' | 'off') => Promise<unknown>;
  toggleTracking: (state: 'on' | 'off') => Promise<unknown>;
  saveTrackLog: () => Promise<TrackSaveResult<L, R>>;
  /** 記録を始めたあと（描きかけがなければ作図タブを閉じる、など） */
  onStarted: () => void;
  /** 保存できたとき（軌跡サマリーを開く）。知らせのアラートを閉じたあとに呼ぶ */
  onSaved: (layer: L, record: R) => void;
};

/**
 * 軌跡ボタンを押したときの処理（Home の pressTracking の本体）。
 * - 開始: 処理中フラグで再入を防ぐ。押し直しによる二重開始が、先に始めた記録の点を消していた（軌跡監査 T-M2）。
 *   開始中・停止中に開始側へ入ったときは黙って捨てず、処理中である旨を知らせる。
 * - 停止: 開始の処理中でも止められる（開始は位置の取得待ちで数十秒かかることがあり、その間もボタンは記録中の表示になる）。
 *   停止の二重実行だけを停止専用のフラグで防ぐ。先に止めてから保存し（stopAndSaveTrack と同じ順。T-L2）、
 *   知らせの文言があればサマリーを開く前に出す（T-L1）
 */
export const runTrackingPress = async <L extends { id: string }, R>(deps: TrackingPressDeps<L, R>): Promise<void> => {
  const { flags } = deps;
  if (deps.trackingState === 'off') {
    // 停止・保存の途中は、記録の状態が先に 'off' になるので開始側へ入る。保存し終わる前に始めさせない
    if (flags.starting.current || flags.stopping.current) {
      await deps.alert(deps.messages.busy);
      return;
    }
    await runIfIdle(flags.starting, async () => {
      const unsaved = await deps.checkUnsavedTrackLog();
      if (!unsaved.isOK) {
        await deps.alert(unsaved.message);
        return;
      }
      if (!(await deps.confirm(deps.messages.confirmStart))) return;
      if ((await deps.confirmLocationPermission()) !== 'granted') return;
      await deps.toggleGPS('follow');
      await deps.toggleTracking('on');
      deps.onStarted();
    });
    return;
  }
  await runIfIdle(flags.stopping, async () => {
    if (!(await deps.confirm(deps.messages.confirmStop))) return;
    // 先に止めてから保存する（離脱時と同じ stopAndSaveTrack。保存の途中に届いた点が消えないように）
    const result = await stopAndSaveTrack<TrackSaveResult<L, R>>({
      toggleTracking: deps.toggleTracking,
      toggleGPS: deps.toggleGPS,
      saveTrackLog: deps.saveTrackLog,
    });
    const notice = getTrackSaveNotice(result);
    if (notice !== undefined) {
      await deps.waitForModalTransition();
      await deps.alert(notice);
    }
    if (result.isOK && result.layer !== undefined && result.record !== undefined) {
      deps.onSaved(result.layer, result.record);
    }
  });
};
