import { DEVICE_LOCAL_SETTINGS_KEYS, withDeviceLocalSettings } from '../deviceLocalSettings';
import { settingsInitialState } from '../../modules/settings';
import { SettingsType } from '../../types';

describe('withDeviceLocalSettings（永続化監査 S-M1・S-M2）', () => {
  const current = {
    ...settingsInitialState,
    tileRegions: [{ id: 'r', tileMapId: 'm', coords: [], centroid: { latitude: 0, longitude: 0 } }],
    agreedTermsVersion: 'now',
    lastSeenVersion: '0.7.0',
    gpsAccuracy: 'LOW',
    isOffline: true,
    mapListURL: 'https://example.com/list',
    isTrackPhotoVisible: false,
    trackGnssColorAutoApplied: true,
    externalGnss: { baudRate: 9600, antennaHeight: 2, ntrip: { enabled: false } },
    proximityAlert: { enabled: true, targetLayerIds: ['current-layer'], distanceThreshold: 25 },
    projectId: 'current-project',
  } as unknown as SettingsType;

  test('端末ローカルのキーは今の値、それ以外は base の値になる', () => {
    const base = { ...settingsInitialState, projectId: 'snap', isSynced: true } as SettingsType;
    const merged = withDeviceLocalSettings(base, current);
    expect(merged.projectId).toBe('snap');
    expect(merged.isSynced).toBe(true);
    expect(merged.tileRegions).toBe(current.tileRegions);
    expect(merged.agreedTermsVersion).toBe('now');
    expect(merged.lastSeenVersion).toBe('0.7.0');
    expect(merged.gpsAccuracy).toBe('LOW');
    expect(merged.isOffline).toBe(true);
    expect(merged.mapListURL).toBe('https://example.com/list');
    expect(merged.isTrackPhotoVisible).toBe(false);
    expect(merged.trackGnssColorAutoApplied).toBe(true);
    expect(merged.externalGnss?.antennaHeight).toBe(2);
  });

  test('接近通知の対象レイヤは base 側（置き換え後のレイヤ）を使う', () => {
    const base = {
      ...settingsInitialState,
      proximityAlert: { enabled: false, targetLayerIds: ['snap-layer'], distanceThreshold: 99 },
    } as SettingsType;
    expect(withDeviceLocalSettings(base, current).proximityAlert).toEqual({
      enabled: true,
      targetLayerIds: ['snap-layer'],
      distanceThreshold: 25,
    });
    expect(withDeviceLocalSettings(settingsInitialState, current).proximityAlert.targetLayerIds).toEqual([]);
  });

  test('base や current を書き換えない', () => {
    const base = { ...settingsInitialState };
    withDeviceLocalSettings(base, current);
    expect(base).toEqual(settingsInitialState);
  });

  test('位置共有・プロジェクトの項目は一覧に入れない', () => {
    const keys: readonly string[] = DEVICE_LOCAL_SETTINGS_KEYS;
    expect(keys).not.toContain('isSynced');
    expect(keys).not.toContain('memberLocation');
    expect(keys).not.toContain('projectId');
  });
});
