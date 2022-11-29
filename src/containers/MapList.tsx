import React, { useCallback, useEffect, useState } from 'react';
import MapList from '../components/pages/MapList';
import { useMaps } from '../hooks/useMaps';
import { Props_MapList } from '../routes';
import { TileMapItemType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { Alert } from '../components/atoms/Alert';

export default function MapListContainer({ navigation }: Props_MapList) {
  const { mapList, saveMap, fetchMapList } = useMaps();
  const [isLoading, setIsLoading] = useState(false);
  const [reload, setReload] = useState(false);

  const addMap = (map: TileMapItemType) => {
    const tileMap = { ...map, id: uuidv4(), visible: true, maptype: 'none' as const };
    const { isOK, message } = saveMap(tileMap);
    if (!isOK) {
      Alert.alert(message);
      return;
    }
    navigation.navigate('Maps');
  };

  const reloadMapList = useCallback(() => {
    //console.log('$$$press reload');

    setReload(true);
  }, []);

  const gotoBack = useCallback(async () => {
    navigation.navigate('Maps');
  }, [navigation]);

  useEffect(() => {
    const controller = new AbortController();
    let finished = true;

    if (isLoading === false && (mapList.length === 0 || reload)) {
      (async () => {
        setIsLoading(true);
        finished = false;
        const { isOK, message } = await fetchMapList(controller.signal);
        finished = true;
        setIsLoading(false);
        setReload(false);
        if (!isOK) {
          await AlertAsync(message);
        }
      })();
    }
    return () => {
      if (!finished) {
        controller.abort();
      }
    };
    //リロードさせるためにreloadが必要
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMapList, mapList.length, reloadMapList, reload]);

  return (
    <MapList data={mapList} isLoading={isLoading} addMap={addMap} reloadMapList={reloadMapList} gotoBack={gotoBack} />
  );
}
