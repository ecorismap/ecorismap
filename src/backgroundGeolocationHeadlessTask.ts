import BackgroundGeolocation from 'react-native-background-geolocation';
import { checkAndStoreLocations, toLocationObject } from './utils/Location';
import { trackLogMMKV } from './utils/mmkvStorage';

BackgroundGeolocation.registerHeadlessTask(async (event) => {
  if (event.name !== 'location') return;
  try {
    const normalized = toLocationObject(event.params);
    const latest = { ...normalized.coords, timestamp: normalized.timestamp };

    // 現在地は常に保存（起動直後に地図へ反映するため）
    trackLogMMKV.setCurrentLocation(latest);

    // トラッキング中だけ軌跡を保存（GPSのみONの場合はスキップ）
    if (trackLogMMKV.getTrackingState() === 'on') {
      checkAndStoreLocations([normalized]);
    }
  } catch (error) {
    console.error('[tracking][headless] failed to persist location', error);
  }
});
