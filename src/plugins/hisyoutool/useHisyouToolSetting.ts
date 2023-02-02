import { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useRecord } from '../../hooks/useRecord';
import { AppState } from '../../modules';
import { updateLayerAction } from '../../modules/layers';
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
  const { findLayer } = useRecord();

  const pressHisyouToolSettingOK = useCallback(
    (value: string) => {
      dispatch(editSettingsAction({ plugins: { hisyouTool: { hisyouLayerId: value } } }));
      const hisyouzuLayer = findLayer(value);
      if (hisyouzuLayer !== undefined) {
        dispatch(updateLayerAction({ ...hisyouzuLayer, visible: false }));
      }
      setVisibleHisyouToolSetting(false);
    },
    [dispatch, findLayer]
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
