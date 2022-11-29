import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { editSettingsAction } from '../modules/settings';

export type UseDisplayReturnType = {
  isDataOpened: 'opened' | 'closed' | 'expanded';
  openData: () => void;
  closeData: () => void;
  expandData: () => void;
};

export const useDisplay = (): UseDisplayReturnType => {
  const dispatch = useDispatch();
  const isDataOpened = useSelector((state: AppState) => state.settings.isDataOpened);

  const openData = useCallback(() => {
    dispatch(editSettingsAction({ isDataOpened: 'opened' }));
  }, [dispatch]);

  const closeData = useCallback(() => {
    dispatch(editSettingsAction({ isDataOpened: 'closed' }));
  }, [dispatch]);

  const expandData = useCallback(() => {
    dispatch(editSettingsAction({ isDataOpened: 'expanded' }));
  }, [dispatch]);

  return { isDataOpened, openData, closeData, expandData } as const;
};
