import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import GpsSettings from '../components/pages/GpsSettings';
import { GpsSettingsContext } from '../contexts/GpsSettings';
import { useBottomSheetNavigation } from '../contexts/BottomSheetNavigationContext';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { GpsAccuracyType } from '../types';

export default function GpsSettingsContainers() {
  const { goBack } = useBottomSheetNavigation();
  const dispatch = useDispatch();
  const gpsAccuracy = useSelector((state: RootState) => state.settings.gpsAccuracy);

  const selectGpsAccuracy = useCallback(
    (value: GpsAccuracyType) => {
      dispatch(editSettingsAction({ gpsAccuracy: value }));
    },
    [dispatch]
  );

  const gotoBack = useCallback(() => {
    goBack();
  }, [goBack]);

  return (
    <GpsSettingsContext.Provider
      value={{
        gpsAccuracy,
        selectGpsAccuracy,
        gotoBack,
      }}
    >
      <GpsSettings />
    </GpsSettingsContext.Provider>
  );
}
