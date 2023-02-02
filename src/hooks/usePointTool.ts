import { useCallback } from 'react';
import { LayerType, RecordType } from '../types';
import * as Location from 'expo-location';
import { toLocationType } from '../utils/Location';
import { t } from '../i18n/config';
import { useRecord } from './useRecord';

export type UsePointToolReturnType = {
  addCurrentPoint: () => Promise<{
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    record: RecordType | undefined;
  }>;
};

export const usePointTool = (): UsePointToolReturnType => {
  const { addRecordWithCheck } = useRecord();

  const addCurrentPoint = useCallback(async () => {
    const location = await Location.getLastKnownPositionAsync();
    if (location === null) {
      return { isOK: false, message: t('hooks.message.turnOnGPS'), layer: undefined, record: undefined };
    }
    return addRecordWithCheck('POINT', toLocationType(location)!);
  }, [addRecordWithCheck]);

  return {
    addCurrentPoint,
  } as const;
};
