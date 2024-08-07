import React, { useCallback, useEffect, useState } from 'react';
import MapList from '../components/pages/MapList';
import { useMaps } from '../hooks/useMaps';
import { Props_MapList } from '../routes';
import { TileMapItemType } from '../types';
import { ulid } from 'ulid';
import { AlertAsync } from '../components/molecules/AlertAsync';
import { MapListContext } from '../contexts/MapList';

export default function MapListContainer({ navigation }: Props_MapList) {
  const { mapList, saveMap, fetchMapList } = useMaps();
  const [isLoading, setIsLoading] = useState(false);
  const [reload, setReload] = useState(false);

  const addMap = (map: TileMapItemType) => {
    const tileMap = { ...map, id: ulid(), visible: true, maptype: 'none' as const };
    saveMap(tileMap);
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
    <MapListContext.Provider value={{ data: mapList, isLoading, addMap, reloadMapList, gotoBack }}>
      <MapList />
    </MapListContext.Provider>
  );
}
