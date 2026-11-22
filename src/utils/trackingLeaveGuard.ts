import { AlertAsync, ConfirmAsync, waitForModalTransition } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';

/**
 * 軌跡の記録中にプロジェクトを切り替える・閉じる・ログアウトするときの確認と、記録の停止・保存・アップロード（同期監査 M13）。
 *
 * 記録（useLocation）はホーム画面が持っているため、プロジェクト編集画面やアカウント画面からは直接止められない。
 * ホームが記録の停止・保存・アップロードの手順を登録し、各画面はここを通して呼ぶ。停止・保存そのものは
 * ホームのボタンで止めるときと同じ処理（useLocation の toggleTracking / toggleGPS / saveTrackLog）を使う。
 *
 * 止めずに進めると、切り替え先のプロジェクトや別の名義で軌跡が保存され、位置情報が意図しない相手に共有される。
 * 閉じる・切り替える・ログアウトは手元のデータを捨てるので、通常利用中のプロジェクトでは保存した軌跡をアップロード
 * してから進める（端末内に保存するだけだと、捨てるデータと一緒に消える）。
 *
 * 確認と実行は分ける。軌跡の確認 → 操作そのものの確認（「アップロードしていないデータは破棄されます」など）→
 * 停止・保存・アップロード の順にし、どちらかの確認でキャンセルしたら記録を続けたまま何もしない（leaveWithTrackingGuard）。
 */

export type TrackingLeaveAction = 'openProject' | 'closeProject' | 'logout';

export type TrackingLeaveContext = {
  /** いま開いているプロジェクトの名前。開いていなければ undefined（端末内のデータ） */
  projectName: string | undefined;
  /** 通常利用中のプロジェクトか（設定の編集中は false）。保存した軌跡をアップロードするかの判断に使う */
  isRunningProject: boolean;
};

export type TrackingLeaveResult = { isOK: boolean; message: string };

export type TrackingLeaveHandler = {
  isTracking: () => boolean;
  getContext: () => TrackingLeaveContext;
  /** 記録を止め、ここまでの軌跡を現在開いているデータの軌跡レイヤへ保存する */
  stopAndSave: () => Promise<TrackingLeaveResult>;
  /** stopAndSave で保存した軌跡をアップロードする（通常利用中のプロジェクトのときだけ呼ぶ）。保存していなければ何もしない */
  uploadTrack: () => Promise<TrackingLeaveResult>;
};

let handler: TrackingLeaveHandler | null = null;

export const registerTrackingLeaveHandler = (next: TrackingLeaveHandler): (() => void) => {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
};

export const isTrackingActive = (): boolean => handler?.isTracking() ?? false;

const shouldUpload = (context: TrackingLeaveContext) => context.projectName !== undefined && context.isRunningProject;

const buildDestination = (context: TrackingLeaveContext) =>
  context.projectName !== undefined
    ? t('Home.label.trackSaveDestProject', { name: context.projectName })
    : t('Home.label.trackSaveDestLocal');

const CONFIRM_KEYS: Record<TrackingLeaveAction, string> = {
  openProject: 'Home.confirm.stopTrackingBeforeOpenProject',
  closeProject: 'Home.confirm.stopTrackingBeforeCloseProject',
  logout: 'Home.confirm.stopTrackingBeforeLogout',
};

/**
 * 記録中なら、止めて保存（通常利用中のプロジェクトではアップロードも）してよいかを尋ねる。ここでは何も止めない。
 * 戻り値が true なら呼び出し元は続けてよい（記録していないときも true）
 */
export const confirmTrackingLeave = async (action: TrackingLeaveAction): Promise<boolean> => {
  const current = handler;
  if (current === null || !current.isTracking()) return true;
  const context = current.getContext();
  const dest = buildDestination(context);
  const notes = [
    shouldUpload(context)
      ? t('Home.confirm.stopTrackingUploadNote')
      : context.projectName !== undefined
        ? t('Home.confirm.stopTrackingSettingNote')
        : undefined,
    t('Home.confirm.stopTrackingCancelNote'),
  ].filter((note): note is string => note !== undefined);
  const ok = await ConfirmAsync(`${t(CONFIRM_KEYS[action], { dest })}\n${notes.join('\n')}`, {
    true: t('Home.confirm.stopTrackingAndSave'),
    false: t('common.cancel'),
  });
  if (!ok) return false;
  // 呼び出し元が続けて確認を出すため、ダイアログの切り替わりを待つ（iOSでの二重表示を避ける）
  await waitForModalTransition();
  return true;
};

/**
 * 記録中なら止めて保存し、通常利用中のプロジェクトでは保存した軌跡をアップロードする。確認は出さない
 * （confirmTrackingLeave と操作の確認が済んだあとに呼ぶ）。戻り値が true なら呼び出し元は続けてよい。
 *
 * force: 取りやめられないログアウト（暗号化キーの登録中断など）用。保存に失敗しても true を返す（ログアウト自体は
 * 止められないため）。アップロードはしない（この経路のログアウトは手元のデータを消さず、キー登録の中断などで
 * アップロードできる状態でもないため。保存した軌跡は再ログイン後に通常どおりアップロードできる）
 */
export const finishTrackingBeforeLeave = async (options: { force?: boolean } = {}): Promise<boolean> => {
  const current = handler;
  if (current === null || !current.isTracking()) return true;
  const force = options.force === true;
  const context = current.getContext();

  let result: TrackingLeaveResult;
  try {
    result = await current.stopAndSave();
  } catch (e) {
    result = { isOK: false, message: e instanceof Error ? e.message : String(e) };
  }

  if (!result.isOK) {
    await waitForModalTransition();
    await AlertAsync(
      force
        ? `${t('Home.alert.stopTrackingSaveFailedForced')}${result.message ? `\n${result.message}` : ''}`
        : `${t('Home.alert.stopTrackingSaveFailed')}${result.message ? `\n${result.message}` : ''}`
    );
    return force;
  }
  if (result.message) {
    // 点が足りず保存しなかった、無効な点を除いた、などの知らせ
    await waitForModalTransition();
    await AlertAsync(result.message);
  }

  if (!force && shouldUpload(context)) {
    let upload: TrackingLeaveResult;
    try {
      upload = await current.uploadTrack();
    } catch (e) {
      upload = { isOK: false, message: e instanceof Error ? e.message : String(e) };
    }
    if (!upload.isOK) {
      // 軌跡は手元の軌跡レイヤに保存済み。このまま進めると捨てるデータと一緒に消えるので、操作をやめる
      await waitForModalTransition();
      await AlertAsync(`${t('Home.alert.stopTrackingUploadFailed')}${upload.message ? `\n${upload.message}` : ''}`);
      return false;
    }
  }
  // 呼び出し元が続けてダイアログを出すことがあるため、切り替わりを待つ（iOSでの二重表示を避ける）
  await waitForModalTransition();
  return true;
};

/**
 * 軌跡の確認 → 操作の確認（confirmLeave。副作用を持たせない）→ 停止・保存・アップロード の順に進める。
 * どちらかの確認でキャンセルしたら false を返し、記録は続けたまま。true なら呼び出し元は操作を続けてよい
 */
export const leaveWithTrackingGuard = async (
  action: TrackingLeaveAction,
  confirmLeave: () => Promise<boolean>
): Promise<boolean> => {
  if (!(await confirmTrackingLeave(action))) return false;
  if (!(await confirmLeave())) return false;
  return await finishTrackingBeforeLeave();
};

/**
 * 取りやめられないログアウト（暗号化キーの登録中断など）の前に、記録中なら通知を出して止めて保存する。
 * 保存に失敗しても true を返す
 */
export const stopTrackingBeforeForcedLogout = async (): Promise<boolean> => {
  const current = handler;
  if (current === null || !current.isTracking()) return true;
  await AlertAsync(t('Home.alert.stopTrackingForLogout', { dest: buildDestination(current.getContext()) }));
  return await finishTrackingBeforeLeave({ force: true });
};

/**
 * ホームが登録する stopAndSave の中身。ボタンで止めるときと同じ停止処理で、先に止めて未書き込みの点を MMKV へ
 * 確定させてから保存する（保存の後に止めると、その間に届いた点がチャンクに残り、次の記録開始時に切り替え先へ
 * 保存されうる）。保存した軌跡レイヤの id を onSaved に渡す（アップロードの対象）
 */
export const stopAndSaveTrack = async ({
  toggleTracking,
  toggleGPS,
  saveTrackLog,
  onSaved,
}: {
  toggleTracking: (state: 'off') => Promise<unknown>;
  toggleGPS: (state: 'off') => Promise<unknown>;
  saveTrackLog: () => Promise<{ isOK: boolean; message: string; layer?: { id: string } }>;
  onSaved: (layerId: string | undefined) => void;
}): Promise<TrackingLeaveResult> => {
  await toggleTracking('off');
  await toggleGPS('off');
  const result = await saveTrackLog();
  onSaved(result.isOK ? result.layer?.id : undefined);
  return { isOK: result.isOK, message: result.message };
};

/** 条件が満たされるまで待つ。満たされたら true、時間切れなら false */
export const waitUntil = async (
  condition: () => boolean,
  { timeoutMs = 3000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return true;
};
