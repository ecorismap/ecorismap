import { useCallback, useState } from 'react';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { RecordType } from '../types';

export type UseFeatureSelectionWebType = {
  unselectFeatureWeb: () => void;
  selectFeatureWeb: (
    selectedRecord:
      | {
          layerId: string;
          record: RecordType;
        }
      | undefined
  ) => void;
};

export const useFeatureSelectionWeb = (mapViewRef: MapView | MapRef | null): UseFeatureSelectionWebType => {
  const [beforeFeature, setBeforeFeature] = useState<
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined
  >(undefined);

  const unselectFeatureWeb = useCallback(() => {
    try {
      const map = (mapViewRef as MapRef).getMap();

      if (beforeFeature !== undefined && beforeFeature.record !== undefined) {
        const userId = beforeFeature.record.userId === undefined ? '' : beforeFeature.record.userId;
        const source = `${beforeFeature.layerId}_${userId}`;
        map.removeFeatureState({ source });
      }
    } catch (e) {
      //console.log(e);
    }
  }, [beforeFeature, mapViewRef]);

  const selectFeatureWeb = useCallback(
    (
      selectedRecord:
        | {
            layerId: string;
            record: RecordType;
          }
        | undefined
    ) => {
      try {
        unselectFeatureWeb();
        const map = (mapViewRef as MapRef).getMap();

        if (selectedRecord !== undefined) {
          const userId = selectedRecord.record.userId === undefined ? '' : selectedRecord.record.userId;
          const source = `${selectedRecord.layerId}_${userId}`;
          map.setFeatureState(
            {
              source: source,
              id: selectedRecord?.record?.id,
            },
            {
              clicked: true,
            }
          );
        }
        setBeforeFeature(selectedRecord);
      } catch (e) {
        //console.log(e);
      }
    },
    [mapViewRef, unselectFeatureWeb]
  );

  return {
    selectFeatureWeb,
    unselectFeatureWeb,
  } as const;
};
