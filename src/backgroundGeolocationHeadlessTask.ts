import BackgroundGeolocation from 'react-native-background-geolocation';
import { checkAndStoreLocations, toLocationObject } from './utils/Location';

BackgroundGeolocation.registerHeadlessTask(async (event) => {
  if (event.name !== 'location') return;
  try {
    const normalized = toLocationObject(event.params);
    checkAndStoreLocations([normalized]);
  } catch (error) {
    console.error('[tracking][headless] failed to persist location', error);
  }
});
