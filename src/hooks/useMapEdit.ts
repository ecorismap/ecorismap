import { useCallback, useEffect, useState } from 'react';
import { TileMapType } from '../types';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { addTileMapAction, deleteTileMapAction, updateTileMapAction } from '../modules/tileMaps';
import { editSettingsAction } from '../modules/settings';
import { ulid } from 'ulid';

export const useMapEdit = (targetMap?: TileMapType | null) => {
  const dispatch = useDispatch();
  const maps = useSelector((state: RootState) => state.tileMaps);
  
  const defaultMap: TileMapType = {
    id: ulid(),
    name: '',
    url: '',
    attribution: '',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 22,
    flipY: false,
  };

  const [map, setMap] = useState<TileMapType>(targetMap || defaultMap);
  const [isEdited, setIsEdited] = useState(targetMap === null || targetMap === undefined);
  const isNewMap = targetMap === null || targetMap === undefined;

  // isEditedの変更をReduxに同期
  useEffect(() => {
    dispatch(editSettingsAction({ isEditingMap: isEdited }));
  }, [dispatch, isEdited]);

  // コンポーネントがアンマウントされるときにisEditingMapをリセット
  useEffect(() => {
    return () => {
      dispatch(editSettingsAction({ isEditingMap: false }));
    };
  }, [dispatch]);

  const changeMapName = useCallback((name: string) => {
    setMap((prev) => ({ ...prev, name }));
    setIsEdited(true);
  }, []);

  const changeMapURL = useCallback((url: string) => {
    setMap((prev) => ({ ...prev, url }));
    setIsEdited(true);
  }, []);

  const changeStyleURL = useCallback((styleURL: string) => {
    setMap((prev) => ({ ...prev, styleURL }));
    setIsEdited(true);
  }, []);

  const changeIsVector = useCallback((isVector: boolean) => {
    setMap((prev) => ({ ...prev, isVector }));
    setIsEdited(true);
  }, []);

  const changeIsGroup = useCallback((isGroup: boolean) => {
    setMap((prev) => ({ ...prev, isGroup }));
    setIsEdited(true);
  }, []);

  const changeAttribution = useCallback((attribution: string) => {
    setMap((prev) => ({ ...prev, attribution }));
    setIsEdited(true);
  }, []);

  const changeTransparency = useCallback((transparency: number) => {
    setMap((prev) => ({ ...prev, transparency }));
    setIsEdited(true);
  }, []);

  const changeMinimumZ = useCallback((minimumZ: number) => {
    setMap((prev) => ({ ...prev, minimumZ }));
    setIsEdited(true);
  }, []);

  const changeMaximumZ = useCallback((maximumZ: number) => {
    setMap((prev) => ({ ...prev, maximumZ }));
    setIsEdited(true);
  }, []);

  const changeOverzoomThreshold = useCallback((overzoomThreshold: number) => {
    setMap((prev) => ({ ...prev, overzoomThreshold }));
    setIsEdited(true);
  }, []);

  const changeHighResolutionEnabled = useCallback((highResolutionEnabled: boolean) => {
    setMap((prev) => ({ ...prev, highResolutionEnabled }));
    setIsEdited(true);
  }, []);

  const changeFlipY = useCallback((flipY: boolean) => {
    setMap((prev) => ({ ...prev, flipY }));
    setIsEdited(true);
  }, []);

  const saveMap = useCallback(() => {
    const index = maps.findIndex(({ id }) => id === map.id);
    if (index === -1) {
      dispatch(addTileMapAction(map));
    } else {
      dispatch(updateTileMapAction(map));
    }
    setIsEdited(false);
  }, [dispatch, map, maps]);

  const deleteMap = useCallback(() => {
    dispatch(deleteTileMapAction(map));
  }, [dispatch, map]);

  return {
    map,
    isEdited,
    isNewMap,
    changeMapName,
    changeMapURL,
    changeStyleURL,
    changeIsVector,
    changeIsGroup,
    changeAttribution,
    changeTransparency,
    changeMinimumZ,
    changeMaximumZ,
    changeOverzoomThreshold,
    changeHighResolutionEnabled,
    changeFlipY,
    saveMap,
    deleteMap,
  };
};