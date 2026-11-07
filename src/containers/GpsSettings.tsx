import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import GpsSettings from '../components/pages/GpsSettings';
import { GpsSettingsContext } from '../contexts/GpsSettings';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { GpsAccuracyType } from '../types';
import { useExternalGnss } from '../hooks/useExternalGnss';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { t } from '../i18n/config';

export default function GpsSettingsContainers() {
  const { goBack } = useBottomSheetNavigation();
  const dispatch = useDispatch();
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);
  const externalGnss = useExternalGnss();
  const { connectUsb, connectBle, scanBle, disconnect } = externalGnss;

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
        pressDisconnect,
      }}
    >
      <GpsSettings />
    </GpsSettingsContext.Provider>
  );
}
