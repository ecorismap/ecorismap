import { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../../modules';
import { editSettingsAction } from '../../modules/settings';

export type UseHisyouToolSettingReturnType = {
  isHisyouToolActive: boolean;
  visibleHisyouToolSetting: boolean;
  hisyouLayerId: string;
  pressHisyouToolSettingOK: (value: string) => void;
  pressHisyouToolSettingCancel: () => void;
  showHisyouToolSetting: () => void;
};

export const useHisyouToolSetting = (): UseHisyouToolSettingReturnType => {
  const dispatch = useDispatch();
  const hisyouLayerId = useSelector((state: AppState) => state.settings.plugins?.hisyouTool?.hisyouLayerId ?? '');
  const isHisyouToolActive = useMemo(() => hisyouLayerId !== '', [hisyouLayerId]);
  const [visibleHisyouToolSetting, setVisibleHisyouToolSetting] = useState(false);

  const pressHisyouToolSettingOK = useCallback(
    (value: string) => {
      dispatch(editSettingsAction({ plugins: { hisyouTool: { hisyouLayerId: value } } }));
      setVisibleHisyouToolSetting(false);
    },
    [dispatch]
  );

  const pressHisyouToolSettingCancel = useCallback(() => {
    setVisibleHisyouToolSetting(false);
  }, []);

  const showHisyouToolSetting = useCallback(() => {
    setVisibleHisyouToolSetting(true);
  }, []);

  return {
    isHisyouToolActive,
    visibleHisyouToolSetting,
    hisyouLayerId,
    pressHisyouToolSettingOK,
    pressHisyouToolSettingCancel,
    showHisyouToolSetting,
  } as const;
};
