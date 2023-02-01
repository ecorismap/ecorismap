import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { TUTRIALS_MESSAGE } from '../constants/Tutrials';
import { t } from '../i18n/config';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';
import { Tutrials } from '../types';

export type UseTutrialReturnType = {
  isTermsOfUseOpen: boolean;
  termsOfUseOK: () => void;
  termsOfUseCancel: () => void;
  runTutrial: (key: keyof Tutrials) => Promise<void>;
};

export const useTutrial = (): UseTutrialReturnType => {
  const tutrials = useSelector((state: AppState) => state.settings.tutrials);
  const isTermsOfUseOpen = useMemo(() => tutrials.TERMS_OF_USE, [tutrials.TERMS_OF_USE]);
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

  const termsOfUseOK = useCallback(() => {
    const key = 'TERMS_OF_USE';
    const updatedTutrials = {
      ...tutrials,
      [key]: false,
    };
    dispatch(editSettingsAction({ tutrials: updatedTutrials }));
  }, [dispatch, tutrials]);

  const termsOfUseCancel = useCallback(() => {
    AlertAsync(t('Home.alert.termsOfuse'));
  }, []);

  return { isTermsOfUseOpen, runTutrial, termsOfUseOK, termsOfUseCancel } as const;
};
