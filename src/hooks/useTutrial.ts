import { useCallback } from 'react';
import { Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { TUTRIALS_MESSAGE } from '../constants/Tutrials';
import { RootState } from '../store';
import { editSettingsAction } from '../modules/settings';
import { Tutrials } from '../types';

export type UseTutrialReturnType = {
  runTutrial: (key: keyof Tutrials) => Promise<void>;
};

export const useTutrial = (): UseTutrialReturnType => {
  const tutrials = useSelector((state: RootState) => state.settings.tutrials, shallowEqual);

  const dispatch = useDispatch();

  const runTutrial = useCallback(
    async (key: keyof Tutrials) => {
      const tutrial = tutrials[key];
      if ((tutrial === undefined || tutrial === true) && Platform.OS !== 'web') {
        await AlertAsync(TUTRIALS_MESSAGE[key]);
        const updatedTutrials = {
          ...tutrials,
          [key]: false,
        };

        dispatch(editSettingsAction({ tutrials: updatedTutrials }));
      }
    },
    [dispatch, tutrials]
  );

  return { runTutrial } as const;
};
