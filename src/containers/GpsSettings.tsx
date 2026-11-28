import React, { useCallback, useContext } from 'react';
import { Linking } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import GpsSettings from '../components/pages/GpsSettings';
import { GpsSettingsContext } from '../contexts/GpsSettings';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { GpsAccuracyType } from '../types';
import { useExternalGnss } from '../hooks/useExternalGnss';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { MapViewContext } from '../contexts/MapView';
import { RawLogEntry } from '../lib/gnss/rawLog';
import { t } from '../i18n/config';

export default function GpsSettingsContainers() {
  const { goBack } = useBottomSheetNavigation();
  const dispatch = useDispatch();
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const externalGnss = useExternalGnss();
  const {
    connectUsb,
    connectBle,
    scanBle,
    refreshSppDevices,
    connectSpp,
    disconnect,
    startRawLog,
    stopRawLog,
    shareRawLog,
    deleteRawLog,
  } = externalGnss;
  const { gpsState } = useContext(MapViewContext);

  const selectGpsAccuracy = useCallback(
    (value: GpsAccuracyType) => {
      dispatch(editSettingsAction({ gpsAccuracy: value }));
    },
    [dispatch]
  );

  const pressConnectUsb = useCallback(
    async (deviceId: number) => {
      try {
        await connectUsb(deviceId);
      } catch (e) {
        await AlertAsync(
          t('GpsSettings.externalGnss.connectFailed', { message: e instanceof Error ? e.message : String(e) })
        );
      }
    },
    [connectUsb]
  );

  const pressScanBle = useCallback(async () => {
    try {
      await scanBle();
    } catch (e) {
      await AlertAsync(
        t('GpsSettings.externalGnss.connectFailed', { message: e instanceof Error ? e.message : String(e) })
      );
    }
  }, [scanBle]);

  const pressConnectBle = useCallback(
    async (address: string) => {
      try {
        await connectBle(address);
      } catch (e) {
        await AlertAsync(
          t('GpsSettings.externalGnss.connectFailed', { message: e instanceof Error ? e.message : String(e) })
        );
      }
    },
    [connectBle]
  );

  const pressRefreshSpp = useCallback(async () => {
    try {
      await refreshSppDevices();
    } catch (e) {
      await AlertAsync(
        t('GpsSettings.externalGnss.connectFailed', { message: e instanceof Error ? e.message : String(e) })
      );
    }
  }, [refreshSppDevices]);

  const pressConnectSpp = useCallback(
    async (address: string) => {
      try {
        await connectSpp(address);
      } catch (e) {
        await AlertAsync(
          t('GpsSettings.externalGnss.connectFailed', { message: e instanceof Error ? e.message : String(e) })
        );
      }
    },
    [connectSpp]
  );

  // ペアリングはアプリからはできないので、AndroidのBluetooth設定を開く
  const pressPairSpp = useCallback(async () => {
    try {
      await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
    } catch (e) {
      console.log('[gnss] open bluetooth settings failed', e);
    }
  }, []);

  const pressStartRawLog = useCallback(async () => {
    // 受信機の位置を使っている間しか、アプリがバックグラウンドで動き続けられない（GPSのサービスに乗っている）
    if (gpsState === 'off') {
      await AlertAsync(t('GpsSettings.externalGnss.rawLog.needGps'));
      return;
    }
    try {
      await startRawLog();
    } catch (e) {
      await AlertAsync(
        t('GpsSettings.externalGnss.rawLog.startFailed', { message: e instanceof Error ? e.message : String(e) })
      );
    }
  }, [gpsState, startRawLog]);

  const pressStopRawLog = useCallback(async () => {
    try {
      await stopRawLog();
    } catch (e) {
      console.error('[gnss] stop raw log error', e);
    }
  }, [stopRawLog]);

  const pressShareRawLog = useCallback(
    async (entry: RawLogEntry) => {
      const result = await shareRawLog(entry).catch(() => 'error' as const);
      if (result === 'saved') await AlertAsync(t('hooks.message.successSaveFile'));
      else if (result === 'error') await AlertAsync(t('hooks.message.failSaveFile'));
    },
    [shareRawLog]
  );

  const pressDeleteRawLog = useCallback(
    async (entry: RawLogEntry) => {
      const ok = await ConfirmAsync(t('GpsSettings.externalGnss.rawLog.confirmDelete', { name: entry.baseName }));
      if (!ok) return;
      try {
        await deleteRawLog(entry);
      } catch (e) {
        console.error('[gnss] delete raw log error', e);
      }
    },
    [deleteRawLog]
  );

  const pressDisconnect = useCallback(async () => {
    try {
      await disconnect();
    } catch (e) {
      console.error('[gnss] disconnect error', e);
    }
  }, [disconnect]);

  const gotoBack = useCallback(() => {
    goBack();
  }, [goBack]);

  return (
    <GpsSettingsContext.Provider
      value={{
        gpsAccuracy,
        selectGpsAccuracy,
        gotoBack,
        externalGnss,
        pressConnectUsb,
        pressScanBle,
        pressConnectBle,
        pressRefreshSpp,
        pressConnectSpp,
        pressPairSpp,
        pressStartRawLog,
        pressStopRawLog,
        pressShareRawLog,
        pressDeleteRawLog,
        pressDisconnect,
      }}
    >
      <GpsSettings />
    </GpsSettingsContext.Provider>
  );
}
