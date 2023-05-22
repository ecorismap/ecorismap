import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';

export type UseScreenReturnType = {
  screenState: 'opened' | 'closed' | 'expanded';
  openData: () => void;
  closeData: () => void;
  expandData: () => void;
};

export const useScreen = (): UseScreenReturnType => {
  const dispatch = useDispatch();
  const screenState = useSelector((state: AppState) => state.settings.screenState);

  const openData = useCallback(() => {
    dispatch(editSettingsAction({ screenState: 'opened' }));
  }, [dispatch]);

  const closeData = useCallback(() => {
    dispatch(editSettingsAction({ screenState: 'closed' }));
    dispatch(editSettingsAction({ isEditingRecord: false }));
  }, [dispatch]);

  const expandData = useCallback(() => {
    dispatch(editSettingsAction({ screenState: 'expanded' }));
  }, [dispatch]);

  return { screenState, openData, closeData, expandData } as const;
};
