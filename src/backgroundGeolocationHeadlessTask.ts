import BackgroundGeolocation from 'react-native-background-geolocation';
import { checkAndStoreLocations, toLocationObject, resetTrackLogCache, flushTrackLog } from './utils/Location';
import { trackLogMMKV } from './utils/mmkvStorage';

BackgroundGeolocation.registerHeadlessTask(async (event) => {
  // 端末再起動(boot)・タスクキル(terminate)後はプラグインがstationary状態で開始されることがあり、
  // disableMotionActivityUpdates:trueではmoving復帰が不確実なため、明示的に移動モードへ戻して記録を継続する。
  if (event.name === 'boot' || event.name === 'terminate') {
    try {
      if (trackLogMMKV.getTrackingState() === 'on' || trackLogMMKV.getGpsState() !== 'off') {
        const state = await BackgroundGeolocation.getState();
        if (state.enabled) {
          await BackgroundGeolocation.changePace(true);
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
