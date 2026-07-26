import BackgroundGeolocation from './lib/backgroundGeolocation';
import { checkAndStoreLocations, toLocationObject, resetTrackLogCache, flushTrackLog } from './utils/Location';
import { trackLogMMKV } from './utils/mmkvStorage';

const RETRY_DELAY_MS = 3000;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// 499(cancelled)/408(timeout)はサービス再起動直後に位置リクエストが競合した際の一時的エラー
// （useLocation.tsのonLocationエラーハンドラと同じ扱い）。ブリッジ経由ではErrorのmessageに
// コードが入った形で届くことがあるため両方を見る。
const isTransientLocationError = (error: unknown): boolean => {
  const code = error instanceof Error ? error.message : String(error);
  return code === '499' || code === '408';
};

// changePace(true)は内部で位置ワンショットを行うため、サービス再起動直後は他のリクエストに
// 横取りされ499/408で失敗することがある（moving切り替え自体は適用されていることが多い）。
// 少し待って状態を確認し、静止のままの場合だけ1回やり直す。
const resumeMovingState = async () => {
  try {
    await BackgroundGeolocation.changePace(true);
  } catch (error) {
    if (!isTransientLocationError(error)) throw error;
    await delay(RETRY_DELAY_MS);
    const state = await BackgroundGeolocation.getState();
    if (!state.enabled || state.isMoving) return;
    await BackgroundGeolocation.changePace(true);
  }
};

BackgroundGeolocation.registerHeadlessTask(async (event) => {
  // 端末再起動(boot)・タスクキル(terminate)後はプラグインがstationary状態で開始されることがあり、
  // disableMotionActivityUpdates:trueではmoving復帰が不確実なため、明示的に移動モードへ戻して記録を継続する。
  if (event.name === 'boot' || event.name === 'terminate') {
    try {
      if (trackLogMMKV.getTrackingState() === 'on' || trackLogMMKV.getGpsState() !== 'off') {
        const state = await BackgroundGeolocation.getState();
        if (state.enabled) {
          await resumeMovingState();
        }
      }
    } catch (error) {
      console.error('[tracking][headless] failed to resume moving state', error);
    }
    return;
  }

  if (event.name !== 'location') return;
  try {
    const normalized = toLocationObject(event.params);
    const latest = { ...normalized.coords, timestamp: normalized.timestamp };

    // 現在地は常に保存（起動直後に地図へ反映するため）
    trackLogMMKV.setCurrentLocation(latest);

    // トラッキング中だけ軌跡を保存（GPSのみONの場合はスキップ）
    if (trackLogMMKV.getTrackingState() === 'on') {
      // headlessはメインとは別のJSコンテキスト。Location.tsのメモリ内キャッシュは共有されないため、
      // タスク先頭でキャッシュを破棄してMMKVから読み込み、末尾で必ずMMKVへ書き戻す（毎回read-modify-write）。
      resetTrackLogCache();
      checkAndStoreLocations([normalized]);
      flushTrackLog();
    }
  } catch (error) {
    console.error('[tracking][headless] failed to persist location', error);
  }
});
