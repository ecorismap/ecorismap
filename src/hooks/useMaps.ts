import { useCallback, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import { TILE_FOLDER } from '../constants/AppConstants';
import { TileMapItemType, TileMapType } from '../types';
import { Platform } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { AppState } from '../modules';
import { deleteTileMapAction, setTileMapsAction } from '../modules/tileMaps';
import { cloneDeep } from 'lodash';
import { hasOpened } from '../utils/Project';
import { csvToJsonArray, isMapListArray, isValidMapListURL } from '../utils/Map';
import { t } from '../i18n/config';

export type UseMapsReturnType = {
  mapListURL: string;
  mapList: TileMapItemType[];
  maps: TileMapType[];
  editedMap: TileMapType;
  isOffline: boolean;
  isMapEditorOpen: boolean;
  changeVisible: (visible: boolean, index: number) => void;
  changeMapOrder: (index: number) => void;
  toggleOnline: () => void;
  deleteMap: (deletedTileMap: TileMapType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  openEditMap: (editTileMap: TileMapType | null) => {
    isOK: boolean;
    message: string;
  };
  closeEditMap: () => void;
  saveMap: (newTileMap: TileMapType) => void;
  fetchMapList: (signal: AbortSignal) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  saveMapListURL: (url: string) => void;
};

export const useMaps = (): UseMapsReturnType => {
  const dispatch = useDispatch();
  const projectId = useSelector((state: AppState) => state.settings.projectId);
  const role = useSelector((state: AppState) => state.settings.role);
  const isSettingProject = useSelector((state: AppState) => state.settings.isSettingProject);
  const isOffline = useSelector((state: AppState) => state.settings.isOffline);
  const mapListURL = useSelector((state: AppState) => state.settings.mapListURL);
  const maps = useSelector((state: AppState) => state.tileMaps);
  const tileRegions = useSelector((state: AppState) => state.settings.tileRegions);
  const [editedMap, setEditedMap] = useState({} as TileMapType);
  const [isMapEditorOpen, setMapEditorOpen] = useState(false);
  const isOwnerAdmin = useMemo(() => role === 'OWNER' || role === 'ADMIN', [role]);
  const mapList = useSelector((state: AppState) => state.settings.mapList);

  const fetchMapList = useCallback(
    async (signal: AbortSignal) => {
      //console.log('###', mapListURL);
      dispatch(editSettingsAction({ mapList: [] }));
      if (mapListURL === undefined) return { isOK: true, message: '' };
      if (!isValidMapListURL(mapListURL)) {
        return { isOK: false, message: t('hooks.message.inputMaplistURL') };
      }
      try {
        const response = await fetch(mapListURL, { signal: signal });

        const csv = await response.text();
        //console.log(csv);
        const mapListArray = csvToJsonArray(csv);
        //console.log(mapListArray);
        if (!isMapListArray(mapListArray)) {
          return { isOK: false, message: t('hooks.message.invalidDataFormat') };
        }
        if (mapListArray.length > 50) {
          return { isOK: false, message: t('hooks.message.tooManyMapList') };
        }
        dispatch(editSettingsAction({ mapList: mapListArray }));
        return { isOK: true, message: '' };
      } catch (error: any) {
        if (error.name === 'AbortError') {
          //console.log('Aborted!!');
          return { isOK: true, message: '' };
        }
        //console.log(error);
        return { isOK: false, message: t('hooks.message.failGetData') };
      }
    },
    [dispatch, mapListURL]
  );

  const clearTiles = useCallback(
    async (tileMap_: TileMapType) => {
      if (Platform.OS === 'web') return;

      const { uri } = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMap_.id}/`);
      if (uri) {
        await FileSystem.deleteAsync(uri);
        const newTileRegions = tileRegions.filter((tileRegion) => tileRegion.tileMapId !== tileMap_.id);
        dispatch(editSettingsAction({ tileRegions: newTileRegions }));
      }
    },
    [dispatch, tileRegions]
  );

  const changeVisible = useCallback(
    (visible: boolean, index: number) => {
      const newTileMaps = cloneDeep(maps);
      newTileMaps[index].visible = visible;

      //標準を可視。衛星を不可視に
      if (newTileMaps[index].id === 'standard' && newTileMaps[index].visible) {
        dispatch(editSettingsAction({ mapType: newTileMaps[index].maptype }));
        newTileMaps.find((tileMap_) => tileMap_.id === 'hybrid')!.visible = false;
        //衛星を可視。標準を不可視に
      } else if (newTileMaps[index].id === 'hybrid' && newTileMaps[index].visible) {
        dispatch(editSettingsAction({ mapType: newTileMaps[index].maptype }));
        newTileMaps.find((tileMap_) => tileMap_.id === 'standard')!.visible = false;
        //標準を不可視
      } else if (newTileMaps[index].id === 'standard' && newTileMaps[index].visible === false) {
        dispatch(editSettingsAction({ mapType: 'none' }));
        //衛星を不可視
      } else if (newTileMaps[index].id === 'hybrid' && newTileMaps[index].visible === false) {
        dispatch(editSettingsAction({ mapType: 'none' }));
      }
      dispatch(setTileMapsAction(newTileMaps));
    },
    [dispatch, maps]
  );

  const changeMapOrder = useCallback(
    (index: number) => {
      if (index === 0) return;
      const newTileMaps = cloneDeep(maps);
      [newTileMaps[index], newTileMaps[index - 1]] = [newTileMaps[index - 1], newTileMaps[index]];
      dispatch(setTileMapsAction(newTileMaps));
    },
    [dispatch, maps]
  );

  const toggleOnline = useCallback(() => {
    dispatch(editSettingsAction({ isOffline: !isOffline }));
  }, [dispatch, isOffline]);

  const deleteMap = useCallback(
    async (deletedTileMap: TileMapType) => {
      if (hasOpened(projectId) && !isOwnerAdmin) {
        return { isOK: false, message: t('hooks.message.onlyAdminCanEdit') };
      }
      if (hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }
      clearTiles(deletedTileMap);
      dispatch(deleteTileMapAction(deletedTileMap));
      setMapEditorOpen(false);
      return { isOK: true, message: '' };
    },
    [clearTiles, dispatch, isSettingProject, isOwnerAdmin, projectId]
  );

  const openEditMap = useCallback(
    (editTileMap: TileMapType | null) => {
      if (editTileMap === null) {
        if (hasOpened(projectId) && !isOwnerAdmin) {
          return { isOK: false, message: t('hooks.message.onlyAdminCanEdit') };
        }
        if (hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
          return { isOK: false, message: t('hooks.message.lockProject') };
        }
      }

      let newTileMap: TileMapType;
      if (editTileMap === null) {
        newTileMap = {
          id: uuidv4(),
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
      } else {
        newTileMap = cloneDeep(editTileMap);
      }

      setEditedMap(newTileMap);
      setMapEditorOpen(true);
      return { isOK: true, message: '' };
    },
    [isSettingProject, isOwnerAdmin, projectId]
  );

  const closeEditMap = () => {
    setMapEditorOpen(false);
  };

  const saveMap = useCallback(
    (newTileMap: TileMapType) => {
      if (hasOpened(projectId) && !isOwnerAdmin) {
        return { isOK: false, message: t('hooks.message.onlyAdminCanEdit') };
      }
      if (hasOpened(projectId) && isOwnerAdmin && !isSettingProject) {
        return { isOK: false, message: t('hooks.message.lockProject') };
      }
      const newTileMaps = cloneDeep(maps);
      //新規だったら追加、編集だったら置き換え
      const index = newTileMaps.findIndex(({ id }) => id === newTileMap.id);
      if (index === -1) {
        newTileMaps.unshift(newTileMap);
      } else {
        newTileMaps[index] = newTileMap;
      }
      dispatch(setTileMapsAction(newTileMaps));
      setMapEditorOpen(false);
    },
    [dispatch, isSettingProject, isOwnerAdmin, maps, projectId]
  );

  const saveMapListURL = useCallback(
    (url: string) => {
      dispatch(editSettingsAction({ mapListURL: url }));
    },
    [dispatch]
  );

  return {
    mapListURL,
    mapList,
    maps,
    editedMap,
    isOffline,
    isMapEditorOpen,
    changeVisible,
    changeMapOrder,
    toggleOnline,
    deleteMap,
    openEditMap,
    closeEditMap,
    saveMap,
    fetchMapList,
    saveMapListURL,
  } as const;
};
