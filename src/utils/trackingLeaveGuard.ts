import { Platform } from 'react-native';
import { AlertAsync, ConfirmAsync, waitForModalTransition } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';
import { trackLogMMKV } from './mmkvStorage';

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
 *
 * ホームから別の画面（プロジェクト一覧・アカウント設定・ログイン）へ移るときもここを通す（'leaveHome'、軌跡監査 T-H1）。
 * 画面は今の1つだけを描くので、移るとホームがアンマウントされ、記録（useLocation）の購読とこの handler が外れる。
 * そのまま記録を続けると、移った先の画面にいる間の点が軌跡から抜け、プロジェクト編集画面やアカウント画面の
 * ガードも「記録していない」とみなして素通りする。そのため、記録中はホームを離れる前に止めて保存させる。
 */

export type TrackingLeaveAction =
  | 'openProject'
  | 'closeProject'
  | 'logout'
  | 'leaveHome'
  | 'restoreBackup'
  | 'clearData'
  | 'openFile';

/**
 * 手元のデータを丸ごと置き換える操作（設定画面の「バックアップから復元」「新規」「ファイルを開く」と Google Drive から
 * 開く、軌跡監査 T-M8）。置き換えの直前に自動バックアップを取るので、止めて保存した軌跡はそこに残る
 */
const REPLACE_DATA_ACTIONS: ReadonlySet<TrackingLeaveAction> = new Set<TrackingLeaveAction>([
  'restoreBackup',
  'clearData',
  'openFile',
]);

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

/**
 * leaveWithTrackingGuard が実行中か。停止・保存の途中で toggleTracking('off') が記録の状態を先に 'off' にするため、
 * 保存やアップロードが終わる前に2回目の呼び出し（ボタンの押し直しなど）が来ると「記録していない」とみなして
 * 素通りし、1回目の保存・アップロードが終わらないうちに画面を移ったりデータを捨てたりしてしまう。実行中の
 * 呼び出しは何もせず false を返す（1回目が終われば、1回目の呼び出し元が続きを行う）
 */
let leaving = false;

export const registerTrackingLeaveHandler = (next: TrackingLeaveHandler): (() => void) => {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
};

export const isTrackingActive = (): boolean => handler?.isTracking() ?? false;

/**
 * ホームがいない（handler が無い）のに記録の意図が 'on' のまま残っているか。ホームを離れる前に必ず止めるので
 * 通常は起きないが、取りこぼした経路があっても「記録していない」とみなして素通りしないための防御。
 * Web はホームが handler を登録せず記録もしないので対象外
 */
const isTrackingWithoutHandler = (): boolean => Platform.OS !== 'web' && trackLogMMKV.getTrackingState() === 'on';

/**
 * ホームがいない画面で記録の意図だけが残っているときの案内。Android はホームに戻ると記録が再開するので、そこで止めて
 * もらう。iOS はホームの再マウントで記録の状態を 'off' に書き換えて止め、未保存の軌跡を保存するか尋ねる
 * （useLocation の初期化）ので、「ホームで止める」操作はできない。その確認に従ってもらう
 */
const withoutHandlerMessage = (kind: 'blocked' | 'forcedLogout') =>
  Platform.OS === 'ios'
    ? kind === 'blocked'
      ? t('Home.alert.stopTrackingFromHomeIos')
      : t('Home.alert.trackingContinuesAfterForcedLogoutIos')
    : kind === 'blocked'
      ? t('Home.alert.stopTrackingFromHome')
      : t('Home.alert.trackingContinuesAfterForcedLogout');

const shouldUpload = (context: TrackingLeaveContext) => context.projectName !== undefined && context.isRunningProject;

const buildDestination = (context: TrackingLeaveContext) =>
  context.projectName !== undefined
    ? t('Home.label.trackSaveDestProject', { name: context.projectName })
    : t('Home.label.trackSaveDestLocal');

const CONFIRM_KEYS: Record<TrackingLeaveAction, string> = {
  openProject: 'Home.confirm.stopTrackingBeforeOpenProject',
  closeProject: 'Home.confirm.stopTrackingBeforeCloseProject',
  logout: 'Home.confirm.stopTrackingBeforeLogout',
  leaveHome: 'Home.confirm.stopTrackingBeforeLeaveHome',
  restoreBackup: 'Home.confirm.stopTrackingBeforeRestoreBackup',
  clearData: 'Home.confirm.stopTrackingBeforeClearData',
  openFile: 'Home.confirm.stopTrackingBeforeOpenFile',
};

/**
 * 記録中なら、止めて保存（通常利用中のプロジェクトではアップロードも）してよいかを尋ねる。ここでは何も止めない。
 * 戻り値が true なら呼び出し元は続けてよい（記録していないときも true）。
 * ホームがいない画面から呼ばれ、記録の意図だけが残っているときは、ここでは止められないので案内を出して false を返す
 */
export const confirmTrackingLeave = async (action: TrackingLeaveAction): Promise<boolean> => {
  const current = handler;
  if (current === null) {
    if (!isTrackingWithoutHandler()) return true;
    await AlertAsync(withoutHandlerMessage('blocked'));
    return false;
  }
  if (!current.isTracking()) return true;
  const context = current.getContext();
  const dest = buildDestination(context);
  const notes = [
    shouldUpload(context)
      ? t('Home.confirm.stopTrackingUploadNote')
      : REPLACE_DATA_ACTIONS.has(action)
        ? // 端末内のデータや設定の編集中は、保存した軌跡も置き換えで消える。直前の自動バックアップには残るが、
          // 大きすぎる・保存に失敗したときは作られないので、無条件には約束しない（設定監査 S-L2）
          t('Home.confirm.stopTrackingBackupNoteUnlessFailed')
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
  // 実行中なら何もしない（leaving の説明を参照）
  if (leaving) return false;
  leaving = true;
  try {
    if (!(await confirmTrackingLeave(action))) return false;
    if (!(await confirmLeave())) return false;
    return await finishTrackingBeforeLeave();
  } finally {
    leaving = false;
  }
};

/**
 * 手元のデータを置き換える操作（'restoreBackup'・'clearData'・'openFile'、軌跡監査 T-M8）を記録ガードの内側で行う。
 * 軌跡の確認 → select（操作の確認とファイルの選択など。データを変えない。undefined ならやめる）→ 停止・保存
 * （通常利用中のプロジェクトではアップロードも）→ replace(選んだもの) の順。キャンセル、ファイル選択の取りやめ、
 * 保存・アップロードの失敗、別の記録ガードの実行中なら replace を呼ばずに false を返し、記録は続けたまま。
 * ファイル選択を確認の側に入れるのは、ピッカーで取りやめたときに記録を止めずに済ませるため。
 * replace は止め終わってから呼ぶので、置き換え直前の自動バックアップ（store.getState() を読む）に保存した軌跡が入る
 */
export const replaceDataWithTrackingGuard = async <T>(
  action: TrackingLeaveAction,
  select: () => Promise<T | undefined>,
  replace: (selected: T) => Promise<void>
): Promise<boolean> => {
  let selected: T | undefined;
  const proceed = await leaveWithTrackingGuard(action, async () => {
    selected = await select();
    return selected !== undefined;
  });
  if (!proceed || selected === undefined) return false;
  await replace(selected);
  return true;
};

/**
 * ホームから別の画面へ移る（'leaveHome'）。記録中なら止めて保存（通常利用中のプロジェクトではアップロードも）して
 * よいかを尋ね、了承されて止め終わってから navigate を1回だけ呼ぶ。キャンセルや保存・アップロードの失敗、
 * 別の記録ガードの実行中なら navigate を呼ばずに false を返す。記録していない（GPS だけ ON を含む）ときは確認なしに移る。
 * 移る処理を引数で受け取るのは、ガードを通さずに移る・待たずに移る、という配線の誤りを起こしにくくするため
 */
export const leaveHomeWithTrackingGuard = async (navigate: () => void): Promise<boolean> => {
  if (!(await leaveWithTrackingGuard('leaveHome', async () => true))) return false;
  navigate();
  return true;
};

/**
 * 取りやめられないログアウト（暗号化キーの登録中断など）の前に、記録中なら通知を出して止めて保存する。
 * 保存に失敗しても true を返す。ホームがいない画面で記録の意図だけが残っているときは、止められないので通知だけ出す
 */
export const stopTrackingBeforeForcedLogout = async (): Promise<boolean> => {
  const current = handler;
  if (current === null) {
    if (isTrackingWithoutHandler()) await AlertAsync(withoutHandlerMessage('forcedLogout'));
    return true;
  }
  if (!current.isTracking()) return true;
  await AlertAsync(t('Home.alert.stopTrackingForLogout', { dest: buildDestination(current.getContext()) }));
  return await finishTrackingBeforeLeave({ force: true });
};

/**
 * 記録を止めて保存する。軌跡ボタンで止めるとき（Home の pressTracking）と、ホームが登録する stopAndSave の
 * 両方がこれを使う。先に止めて未書き込みの点を MMKV へ確定させ、記録状態を 'off' にしてから保存する。
 * 保存の後に止めると、全点を読んでからチャンクを消すまでの間に届いた点が、最後の消去で失われる（軌跡監査 T-L2）。
 * 保存した軌跡レイヤの id を onSaved に渡す（アップロードの対象）。戻り値は saveTrackLog の結果そのもの
 * （ボタン側はサマリーを開くのに layer と record を使う）。保存に失敗してもチャンクは残り、次の開始時に回収できる
 */
export const stopAndSaveTrack = async <R extends { isOK: boolean; message: string; layer?: { id: string } }>({
  toggleTracking,
  toggleGPS,
  saveTrackLog,
  onSaved,
}: {
  toggleTracking: (state: 'off') => Promise<unknown>;
  toggleGPS: (state: 'off') => Promise<unknown>;
  saveTrackLog: () => Promise<R>;
  onSaved?: (layerId: string | undefined) => void;
}): Promise<R> => {
  await toggleTracking('off');
  await toggleGPS('off');
  const result = await saveTrackLog();
  onSaved?.(result.isOK ? result.layer?.id : undefined);
  return result;
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
