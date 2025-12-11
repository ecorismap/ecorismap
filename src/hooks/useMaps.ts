import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { ulid } from 'ulid';
import { TILE_FOLDER } from '../constants/AppConstants';
import { boundaryType, TileMapItemType, TileMapType } from '../types';
import { Platform } from 'react-native';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { addTileMapAction, deleteTileMapAction, setTileMapsAction, updateTileMapAction } from '../modules/tileMaps';
import { cloneDeep } from 'lodash';
import { csvToJsonArray, isMapListArray, isTileMapType, isValidMapListURL } from '../utils/Map';
import { t } from '../i18n/config';
import { decodeUri } from '../utils/File.web';
import { blobToBase64 } from '../utils/blob';
import { convert, warpedFileType } from 'react-native-gdalwarp';
import { webMercatorToLatLon } from '../utils/Coords';
import { Buffer } from 'buffer';
import { unlink, exportFileFromData } from '../utils/File';
import { convertPDFToGeoTiff } from '../utils/PDF';
import { db } from '../utils/db';
import { generateTilesFromPDF } from '../utils/PDF';
import * as pmtiles from 'pmtiles';
import * as projectStorage from '../lib/firebase/storage';
import dayjs from 'dayjs';
import sanitize from 'sanitize-filename';

const PDF_PROGRESS = {
  idle: 0,
  downloadStart: 0,
  downloadEnd: 45,
  convertStart: 50,
  convertEnd: 100,
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const formatProgress = (value: number) => Math.round(value).toString();

export type UseMapsReturnType = {
  progress: string;
  mapListURL: string;
  mapList: TileMapItemType[];
  maps: TileMapType[];
  editedMap: TileMapType;
  isOffline: boolean;
  isMapEditorOpen: boolean;
  filterdMaps: TileMapType[];
  changeVisible: (visible: boolean, tileMap: TileMapType) => void;
  changeMapOrder: (tileMap: TileMapType, direction: 'up' | 'down') => void;
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
  importStyleFile: (
    uri: string,
    name: string,
    tileMap: TileMapType
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importMapFile: (
    uri: string,
    name: string,
    ext: string,
    id?: string,
    key?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importPdfFile: (
    uri: string,
    name: string,
    id?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  importPmtilesFile: (
    uri: string,
    name: string,
    id?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  clearTileCache: () => Promise<void>;
  clearTiles: (tileMap_: TileMapType) => Promise<void>;
  updatePmtilesURL: () => Promise<void>;

  changeExpand: (expanded: boolean, tileMap: TileMapType) => void;
  getPmtilesBoundary: (url: string) => Promise<{
    header: pmtiles.Header | undefined;
    boundary: boundaryType | undefined;
  }>;
  updateMapOrder: (data: TileMapType[], from: number, to: number) => void;
  onDragBegin: (tileMap: TileMapType) => void;
  exportSingleMap: (tileMap: TileMapType) => Promise<{ isOK: boolean; message: string }>;
};

export const useMaps = (): UseMapsReturnType => {
  const dispatch = useDispatch();
  const isOffline = useSelector((state: RootState) => state.settings.isOffline, shallowEqual);
  const mapListURL = useSelector((state: RootState) => state.settings.mapListURL, shallowEqual);
  const maps = useSelector((state: RootState) => state.tileMaps);
  const tileRegions = useSelector((state: RootState) => state.settings.tileRegions, shallowEqual);
  const [editedMap, setEditedMap] = useState({} as TileMapType);
  const [isMapEditorOpen, setMapEditorOpen] = useState(false);
  const [progress, setProgress] = useState(formatProgress(PDF_PROGRESS.idle));
  const mapList = useSelector((state: RootState) => state.settings.mapList, shallowEqual);

  // stale closure対策: 常に最新のmapsを参照できるようにする
  const mapsRef = useRef(maps);
  useEffect(() => {
    mapsRef.current = maps;
  }, [maps]);

  const filterdMaps = useMemo(
    () =>
      maps.filter((map) => {
        if (map.isGroup) return true;
        if (!map.groupId) return true;
        // 親グループのexpanded状態を確認
        const parentGroup = maps.find((m) => m.id === map.groupId);
        return parentGroup?.expanded === true;
      }),
    [maps]
  );

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
      if (Platform.OS === 'web') {
        await db.geotiff.delete(tileMap_.id);
        await db.pmtiles.delete(tileMap_.id);
      } else {
        const { uri } = await FileSystem.getInfoAsync(`${TILE_FOLDER}/${tileMap_.id}/`);
        if (uri) {
          await FileSystem.deleteAsync(uri);
          const newTileRegions = tileRegions.filter((tileRegion) => tileRegion.tileMapId !== tileMap_.id);
          dispatch(editSettingsAction({ tileRegions: newTileRegions }));
        }
      }
    },
    [dispatch, tileRegions]
  );

  const clearTileCache = useCallback(async () => {
    if (Platform.OS === 'web') {
      await db.geotiff.clear();
      await db.pmtiles.clear();
    } else {
      const { uri } = await FileSystem.getInfoAsync(TILE_FOLDER);
      if (uri) {
        await FileSystem.deleteAsync(uri);
        dispatch(editSettingsAction({ tileRegions: [] }));
      }
    }
  }, [dispatch]);

  const changeVisible = useCallback(
    (visible: boolean, tileMap: TileMapType) => {
      const newTileMaps = cloneDeep(maps);
      const index = newTileMaps.findIndex(({ id }) => id === tileMap.id);
      newTileMaps[index].visible = visible;

      const groupTileMapId = maps[index].id;
      newTileMaps.forEach((item) => {
        if (item.groupId === groupTileMapId) {
          item.visible = visible;
        }
      });

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

  const changeExpand = useCallback(
    (expanded: boolean, tileMap: TileMapType) => {
      const currentMaps = mapsRef.current;
      const currentMap = currentMaps.find((m) => m.id === tileMap.id);
      if (!currentMap) return;

      const newTileMaps = currentMaps.map((item) => {
        if (item.id === currentMap.id) {
          return { ...item, expanded };
        }
        if (currentMap.isGroup && item.groupId === currentMap.id) {
          return { ...item, expanded };
        }
        return item;
      });
      dispatch(setTileMapsAction(newTileMaps));
    },
    [dispatch]
  );

  const changeMapOrder = useCallback(
    (tileMap: TileMapType, direction: 'up' | 'down') => {
      const newTileMaps = cloneDeep(maps);
      const index = newTileMaps.findIndex(({ id }) => id === tileMap.id);

      if (direction === 'up') {
        if (index === 0) return;
        const currentTileMap = newTileMaps[index];
        const previousTileMap = newTileMaps[index - 1];
        if (currentTileMap.isGroup) {
          const childTileMaps = newTileMaps.filter((item) => item.groupId === currentTileMap.id);
          const childTileMapCount = childTileMaps.length;
          if (previousTileMap.groupId === undefined) {
            newTileMaps.splice(index, 1 + childTileMapCount);
            newTileMaps.splice(index - 1, 0, currentTileMap, ...childTileMaps);
          } else {
            const groupParentIndex = newTileMaps.findIndex((item) => item.id === previousTileMap.groupId);
            if (groupParentIndex !== -1) {
              newTileMaps.splice(index, 1 + childTileMapCount);
              newTileMaps.splice(groupParentIndex, 0, currentTileMap, ...childTileMaps);
            }
          }
          dispatch(setTileMapsAction(newTileMaps));
          return;
        } else {
          if (previousTileMap.isGroup && currentTileMap.groupId !== previousTileMap.id) {
            currentTileMap.groupId = previousTileMap.id;
            currentTileMap.expanded = previousTileMap.expanded;
            dispatch(setTileMapsAction(newTileMaps));
            return;
          } else if (previousTileMap.groupId && currentTileMap.groupId !== previousTileMap.groupId) {
            currentTileMap.groupId = previousTileMap.groupId;
            currentTileMap.expanded = previousTileMap.expanded;
            dispatch(setTileMapsAction(newTileMaps));
            return;
          } else if (previousTileMap.isGroup && currentTileMap.groupId) {
            const groupParentIndex = newTileMaps.findIndex((item) => item.id === currentTileMap.groupId);
            if (groupParentIndex !== -1) {
              currentTileMap.groupId = undefined;
              newTileMaps.splice(index, 1);
              newTileMaps.splice(groupParentIndex, 0, currentTileMap);
              dispatch(setTileMapsAction(newTileMaps));
              return;
            }
          }
        }
        [newTileMaps[index], newTileMaps[index - 1]] = [newTileMaps[index - 1], newTileMaps[index]];
        dispatch(setTileMapsAction(newTileMaps));
      } else if (direction === 'down') {
        const currentTileMap = newTileMaps[index];
        if (currentTileMap.isGroup) {
          const childTileMaps = newTileMaps.filter((item) => item.groupId === currentTileMap.id);
          const childTileMapCount = childTileMaps.length;
          const groupEndIndex = index + childTileMapCount;
          if (groupEndIndex >= newTileMaps.length - 3) {
            return;
          }
          const groupToMove = newTileMaps.slice(index, groupEndIndex + 1);
          const nextItemIndex = groupEndIndex + 1;
          const nextItem = newTileMaps[nextItemIndex];
          let endOfNextBlockIndex;
          if (nextItem.isGroup) {
            const nextGroupChildren = newTileMaps.filter((item) => item.groupId === nextItem.id);
            endOfNextBlockIndex = nextItemIndex + nextGroupChildren.length;
          } else {
            endOfNextBlockIndex = nextItemIndex;
          }
          let insertionIndex = endOfNextBlockIndex + 1;
          newTileMaps.splice(index, 1 + childTileMapCount);
          if (index < insertionIndex) {
            insertionIndex -= 1 + childTileMapCount;
          }
          newTileMaps.splice(insertionIndex, 0, ...groupToMove);
          dispatch(setTileMapsAction(newTileMaps));
          return;
        } else {
          const nextTileMap = newTileMaps[index + 1];
          if (nextTileMap.isGroup && currentTileMap.groupId !== nextTileMap.id) {
            currentTileMap.groupId = nextTileMap.id;
            currentTileMap.expanded = nextTileMap.expanded;
            newTileMaps.splice(index, 1);
            newTileMaps.splice(index + 1, 0, currentTileMap);
            dispatch(setTileMapsAction(newTileMaps));
            return;
          } else if (nextTileMap.groupId && currentTileMap.groupId !== nextTileMap.groupId) {
            currentTileMap.groupId = nextTileMap.groupId;
            const parent = newTileMaps.find((l) => l.id === nextTileMap.groupId);
            if (parent) currentTileMap.expanded = parent.expanded;
            newTileMaps.splice(index, 1);
            newTileMaps.splice(index, 0, currentTileMap);
            dispatch(setTileMapsAction(newTileMaps));
            return;
          } else if (currentTileMap.groupId && (!nextTileMap || nextTileMap.groupId !== currentTileMap.groupId)) {
            const currentGroupId = currentTileMap.groupId;
            currentTileMap.groupId = undefined;
            let groupLastIndex = -1;
            for (let i = newTileMaps.length - 1; i >= 0; i--) {
              if (i !== index && newTileMaps[i].groupId === currentGroupId) {
                groupLastIndex = i;
                break;
              }
            }
            if (groupLastIndex !== -1) {
              const tileMapToMove = newTileMaps.splice(index, 1)[0];
              const insertionIndex = index < groupLastIndex ? groupLastIndex : groupLastIndex + 1;
              newTileMaps.splice(insertionIndex, 0, tileMapToMove);
              dispatch(setTileMapsAction(newTileMaps));
              return;
            }
          } else if (index === newTileMaps.length - 3) {
            return;
          }
        }
        const tileMapToMove = newTileMaps[index];
        const nextTileMap = newTileMaps[index + 1];
        [newTileMaps[index], newTileMaps[index + 1]] = [nextTileMap, tileMapToMove];
        dispatch(setTileMapsAction(newTileMaps));
      }
    },
    [dispatch, maps]
  );

  const updateMapOrder = useCallback(
    (data: TileMapType[], from: number, to: number) => {
      if (from === to) return;
      if (to > data.length - 2) return;
      if (from > data.length - 3) return;

      const draggedTileMap = data[from];
      const targetTileMap = to > 0 ? data[to - 1] : undefined;
      const fromIndex = maps.findIndex(({ id }) => id === data[from].id);
      const toIndex = maps.findIndex(({ id }) => id === data[to].id);
      const newMaps = cloneDeep(maps);

      //ドラッグするものがグループ親の場合
      if (draggedTileMap.isGroup) {
        //グループの中には移動できない
        if (targetTileMap && targetTileMap.expanded && (targetTileMap.isGroup || targetTileMap.groupId)) {
          return;
        } else {
          //グループごと移動する
          const groupTileMaps = newMaps.filter(
            (tileMap) => tileMap.id === draggedTileMap.id || tileMap.groupId === draggedTileMap.id
          );
          newMaps.splice(fromIndex, groupTileMaps.length);
          const fixedToIndex = toIndex > fromIndex ? toIndex - groupTileMaps.length : toIndex;
          // groupTileMapsはすでにdeep cloneされているのでそのまま使う
          newMaps.splice(fixedToIndex, 0, ...groupTileMaps);
        }
        //ドラッグするものがグループの子要素の場合
      } else if (draggedTileMap.groupId) {
        // 子要素の場合は新しいオブジェクトとして挿入
        newMaps.splice(fromIndex, 1);
        const fixedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
        newMaps.splice(fixedToIndex, 0, draggedTileMap);
        //グループの中で移動する場合
        if (
          targetTileMap &&
          targetTileMap.expanded &&
          ((targetTileMap.isGroup && targetTileMap.id === draggedTileMap.groupId) ||
            (targetTileMap.groupId && targetTileMap.groupId === draggedTileMap.groupId))
        ) {
          // 何もしない
        } else if (
          targetTileMap &&
          targetTileMap.expanded &&
          ((targetTileMap.isGroup && targetTileMap.id !== draggedTileMap.groupId) ||
            (targetTileMap.groupId && targetTileMap.groupId !== draggedTileMap.groupId))
        ) {
          // 別のグループに移動
          newMaps[fixedToIndex] = {
            ...newMaps[fixedToIndex],
            groupId: targetTileMap.isGroup ? targetTileMap.id : targetTileMap.groupId,
            expanded: targetTileMap.expanded,
          };
        } else {
          // グループの外に移動
          newMaps[fixedToIndex] = {
            ...newMaps[fixedToIndex],
            groupId: undefined,
          };
        }
      } else {
        //グループに属していない場合
        newMaps.splice(fromIndex, 1);
        const fixedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
        newMaps.splice(fixedToIndex, 0, draggedTileMap);
        if (targetTileMap && targetTileMap.expanded && (targetTileMap.isGroup || targetTileMap.groupId)) {
          newMaps[fixedToIndex] = {
            ...newMaps[fixedToIndex],
            groupId: targetTileMap.isGroup ? targetTileMap.id : targetTileMap.groupId,
            expanded: targetTileMap.expanded,
          };
        }
        //グループに入らない場合は何もしない
      }

      dispatch(setTileMapsAction(newMaps));
    },
    [dispatch, maps]
  );

  const onDragBegin = useCallback(
    (tileMap: TileMapType) => {
      // ドラッグ開始時の処理
      //ドラッグしたものがグループの場合、グループの展開を閉じる
      const index = maps.findIndex(({ id }) => id === tileMap.id);
      const item = maps[index];
      if (item.isGroup) {
        const newMaps = maps.map((map) => {
          if (map.groupId === item.id || map.id === item.id) {
            return { ...map, expanded: false };
          }
          return map;
        });
        dispatch(setTileMapsAction(newMaps));
      }
    },
    [maps, dispatch]
  );

  const exportSingleMap = useCallback(async (tileMap: TileMapType) => {
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const mapData = JSON.stringify(tileMap, null, 2);
    // ZIP処理と同様にUnicode正規化を追加
    const fileName = `map_${sanitize(tileMap.name).normalize('NFC')}_${time}.json`;
    const isOK = await exportFileFromData(mapData, fileName);
    if (!isOK && Platform.OS !== 'web') {
      return { isOK: false, message: t('hooks.message.failExport') };
    } else {
      return { isOK: true, message: t('hooks.message.successExportMaps') };
    }
  }, []);

  const toggleOnline = useCallback(() => {
    dispatch(editSettingsAction({ isOffline: !isOffline }));
  }, [dispatch, isOffline]);

  const deleteMap = useCallback(
    async (deletedTileMap: TileMapType) => {
      if (deletedTileMap.isGroup) {
        const childTileMaps = maps
          .map((tileMap) => {
            if (tileMap.groupId === deletedTileMap.id) {
              return { ...tileMap, groupId: undefined };
            }
            return tileMap;
          })
          .filter((tileMap) => tileMap.id !== deletedTileMap.id);
        dispatch(setTileMapsAction(childTileMaps));
        setMapEditorOpen(false);
        return { isOK: true, message: '' };
      } else {
        clearTiles(deletedTileMap);
        dispatch(deleteTileMapAction(deletedTileMap));
        setMapEditorOpen(false);
        return { isOK: true, message: '' };
      }
    },
    [clearTiles, dispatch, maps]
  );

  const openEditMap = useCallback((editTileMap: TileMapType | null) => {
    let newTileMap: TileMapType;
    if (editTileMap === null) {
      newTileMap = {
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
    } else {
      newTileMap = cloneDeep(editTileMap);
    }

    setEditedMap(newTileMap);
    setMapEditorOpen(true);
    return { isOK: true, message: '' };
  }, []);

  const closeEditMap = () => {
    setMapEditorOpen(false);
  };

  const saveMap = useCallback(
    (newTileMap: TileMapType) => {
      //新規だったら追加、編集だったら置き換え
      const index = maps.findIndex(({ id }) => id === newTileMap.id);
      if (index === -1) {
        dispatch(addTileMapAction(newTileMap));
      } else {
        dispatch(updateTileMapAction(newTileMap));
      }
      setMapEditorOpen(false);
    },
    [dispatch, maps]
  );

  const saveMapListURL = useCallback(
    (url: string) => {
      dispatch(editSettingsAction({ mapListURL: url }));
    },
    [dispatch]
  );

  const importStyleFile = useCallback(async (uri: string, name: string, tileMap: TileMapType) => {
    try {
      // console.log('importStyleFile', uri, name, id);
      if (Platform.OS === 'web') {
        const jsonStrings = decodeUri(uri);
        db.pmtiles.put({ mapId: tileMap.id, blob: undefined, boundary: '', style: jsonStrings });
        setEditedMap({ ...tileMap, styleURL: 'style://' + name });
      } else {
        const styleUri = `${TILE_FOLDER}/${tileMap.id}/style.json`;
        await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${tileMap.id}`, { intermediates: true });
        await FileSystem.copyAsync({ from: uri, to: styleUri });
        setEditedMap({ ...tileMap, styleURL: 'style://style.json' });
      }

      return { isOK: true, message: '' };
    } catch (e: any) {
      console.log(e);
      return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
    }
  }, []);

  const updatePmtilesURL = useCallback(async () => {
    //URL.createObjectURLはセッションごとにリセットされるため、再度生成する必要がある
    if (Platform.OS !== 'web') return;
    for (const tileMap of maps) {
      try {
        if (tileMap.url && tileMap.url.startsWith('pmtiles://')) {
          const pmtile = await db.pmtiles.get(tileMap.id);
          if (pmtile && pmtile.blob) {
            const url = 'pmtiles://' + URL.createObjectURL(pmtile.blob);
            dispatch(updateTileMapAction({ ...tileMap, url }));
          }
        }
      } catch (e) {
        console.log(e);
      }
    }
  }, [dispatch, maps]);

  const importJsonMapFile = useCallback(
    async (uri: string) => {
      try {
        const jsonStrings = Platform.OS === 'web' ? decodeUri(uri) : await FileSystem.readAsStringAsync(uri);
        const json = JSON.parse(jsonStrings);

        // 配列形式の場合（従来の全体インポート）
        if (Array.isArray(json)) {
          const isValid = json.every((tileMap) => isTileMapType(tileMap));
          if (!isValid) {
            return { isOK: false, message: t('hooks.message.invalidDataFormat') };
          }
          dispatch(setTileMapsAction(json));
          await updatePmtilesURL();
          return { isOK: true, message: t('hooks.message.receiveFile') };
        }
        // オブジェクト形式の場合（個別地図）
        else if (typeof json === 'object' && json !== null && json.id) {
          const isValid = isTileMapType(json);
          if (!isValid) {
            return { isOK: false, message: t('hooks.message.invalidDataFormat') };
          }

          // 既存の地図があれば更新、なければ追加
          const existingMapIndex = maps.findIndex((m) => m.id === json.id);
          if (existingMapIndex !== -1) {
            dispatch(updateTileMapAction(json));
            return { isOK: true, message: t('hooks.message.updateMap') };
          } else {
            dispatch(addTileMapAction(json));
            return { isOK: true, message: t('hooks.message.addMap') };
          }
        } else {
          return { isOK: false, message: t('hooks.message.invalidDataFormat') };
        }
      } catch (e: any) {
        return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
      }
    },
    [dispatch, maps, updatePmtilesURL]
  );

  const calculateZoomLevel = (pdfTopCoord: number, pdfBottomCoord: number, imageHeight: number) => {
    const coordPerPixel = (pdfTopCoord - pdfBottomCoord) / imageHeight;
    const earthCircumference = Math.PI * 2 * 6378137;
    return Math.round(Math.log2(earthCircumference / coordPerPixel / 256)) - 1;
  };

  const importPdfFile = useCallback(
    async (uri: string, name: string, id?: string) => {
      let outputFiles: warpedFileType[] = [];
      if (Platform.OS === 'web') {
        outputFiles = await convertPDFToGeoTiff(uri);
      } else {
        const result = await convert(uri.replace('file://', '')).catch((e) => {
          console.error('Error processing PDF:', e);
          return { outputFiles: [] };
        });
        outputFiles = result.outputFiles;
      }
      if (outputFiles.length === 0) {
        return { isOK: false, message: t('hooks.message.failReceiveFile') };
      }
      setProgress(formatProgress(PDF_PROGRESS.convertStart));

      const totalPages = outputFiles.length;
      for (let page = 1; page <= totalPages; page++) {
        const outputFile = outputFiles[page - 1];
        const mapId = id === undefined || totalPages > 1 ? ulid() : id;
        const pdfImage = 'file://' + outputFile.uri;

        const { y: pdfTopCoord } = outputFile.topLeft;
        const { y: pdfBottomCoord } = outputFile.bottomRight;
        //const imageWidth = outputFile.width;
        const imageHeight = outputFile.height;
        const topLeftLatLon = webMercatorToLatLon(outputFile.topLeft);
        const bottomRightLatLon = webMercatorToLatLon(outputFile.bottomRight);
        const coordPerPixel = (pdfTopCoord - pdfBottomCoord) / imageHeight;
        const baseZoomLevel = calculateZoomLevel(pdfTopCoord, pdfBottomCoord, imageHeight);
        const tileSize = 512;
        const minimumZ = 3;
        const boundary = {
          center: {
            latitude: (topLeftLatLon.latitude + bottomRightLatLon.latitude) / 2,
            longitude: (topLeftLatLon.longitude + bottomRightLatLon.longitude) / 2,
          },
          zoom: baseZoomLevel - 1,
          bounds: {
            north: topLeftLatLon.latitude,
            south: bottomRightLatLon.latitude,
            west: topLeftLatLon.longitude,
            east: bottomRightLatLon.longitude,
          },
        };
        const boundaryJson = JSON.stringify(boundary);
        //console.log('width', imageWidth, 'height', imageHeight);
        if (Platform.OS === 'web') {
          await db.geotiff.put({ mapId, blob: outputFile.blob!, boundary: boundaryJson, pdf: uri });
        } else {
          generateTilesFromPDF(pdfImage, outputFile, mapId, tileSize, minimumZ, baseZoomLevel, coordPerPixel);
          //${TILE_FOLDER}/${mapId}/boundary.jsonに保存.
          const boundaryUri = `${TILE_FOLDER}/${mapId}/boundary.json`;
          await FileSystem.writeAsStringAsync(boundaryUri, boundaryJson);
        }

        const tileMap: TileMapType = {
          id: mapId,
          name: name,
          url: `file://${name}`,
          attribution: 'PDF',
          maptype: 'none',
          visible: true,
          transparency: 0,
          overzoomThreshold: baseZoomLevel,
          highResolutionEnabled: false,
          minimumZ: minimumZ,
          maximumZ: 22,
          flipY: false,
          tileSize: tileSize,
          boundary,
        };
        if (totalPages > 1) {
          //複数ページの場合は名前を変える
          tileMap.name = `${name}_page${page.toString().padStart(2, '0')}`;
          dispatch(addTileMapAction(tileMap));
        } else if (id === undefined) {
          //単ページでローカル読み込みの場合は新規追加
          dispatch(addTileMapAction(tileMap));
        } else if (id) {
          //単ページでファイルダウンロードの場合は置き換え
          const index = maps.findIndex((item) => item.id === id);
          const oldTileMap = maps[index];
          tileMap.name = oldTileMap.name;
          tileMap.url = oldTileMap.url;
          tileMap.attribution = oldTileMap.attribution;
          tileMap.transparency = oldTileMap.transparency;
          tileMap.encryptKey = oldTileMap.encryptKey;
          tileMap.redraw = !oldTileMap.redraw;
          dispatch(updateTileMapAction(tileMap));
        }

        const convertProgress =
          PDF_PROGRESS.convertStart + (page / totalPages) * (PDF_PROGRESS.convertEnd - PDF_PROGRESS.convertStart);
        setProgress(formatProgress(convertProgress));
      }
      setProgress(formatProgress(PDF_PROGRESS.idle)); //次回のための初期値

      return { isOK: true, message: t('hooks.message.receiveFile') };
    },
    [dispatch, maps]
  );

  const getPmtilesBoundary = useCallback(
    async (url: string): Promise<{ header: pmtiles.Header | undefined; boundary: boundaryType | undefined }> => {
      try {
        if (Platform.OS !== 'web') {
          return { header: undefined, boundary: undefined };
        }
        const pmtile = new pmtiles.PMTiles(url.replace('pmtiles://', ''));
        const header = await pmtile.getHeader();
        return {
          header: header,
          boundary: {
            center: {
              latitude: header.centerLat,
              longitude: header.centerLon,
            },
            zoom: Math.floor((header.maxZoom + header.minZoom) / 2),
            bounds: {
              north: header.maxLat,
              south: header.minLat,
              west: header.minLon,
              east: header.maxLon,
            },
          },
        };
      } catch (e: any) {
        return { header: undefined, boundary: undefined };
      }
    },
    []
  );

  const importPmtilesFile = useCallback(
    async (uri: string, name: string, id?: string) => {
      const mapId = id === undefined ? ulid() : id;
      let url;
      let blob;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        blob = await response.blob();
        url = URL.createObjectURL(blob);
      } else {
        url = `${TILE_FOLDER}/${mapId}/${name}`;
        await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${mapId}`, { intermediates: true });
        await FileSystem.copyAsync({ from: uri, to: url });
      }
      const { header, boundary } = await getPmtilesBoundary(url);
      if (header === undefined || boundary === undefined) {
        return { isOK: false, message: t('hooks.message.failReceiveFile') };
      }
      //console.log('AAA', metadata);
      //console.log('BBB', header);

      if (Platform.OS === 'web') {
        await db.pmtiles.put({ mapId, blob: blob, boundary: JSON.stringify(boundary), style: undefined });
      } else {
        const boundaryUri = `${TILE_FOLDER}/${mapId}/boundary.json`;
        await FileSystem.writeAsStringAsync(boundaryUri, JSON.stringify(boundary));
      }

      const tileMap: TileMapType = {
        id: mapId,
        name: name,
        url: 'pmtiles://' + url,
        attribution: 'pmtiles',
        maptype: 'none',
        visible: true,
        transparency: 0,
        overzoomThreshold: header.maxZoom,
        highResolutionEnabled: false,
        minimumZ: header.minZoom,
        maximumZ: header.maxZoom,
        flipY: false,
        tileSize: 512,
        isVector: header.tileType === 1,
      };
      dispatch(addTileMapAction(tileMap));
      return { isOK: true, message: t('hooks.message.receiveFile') };
    },
    [dispatch, getPmtilesBoundary]
  );
  const importMapFile = useCallback(
    async (uri: string, name: string, ext: string, id?: string, key?: string) => {
      //設定ファイルの場合
      if (ext === 'json') return importJsonMapFile(uri);
      //PDFでローカルファイルでWebブラウザの場合
      if (ext === 'pmtiles') return importPmtilesFile(uri, name, id);
      if (ext === 'pdf' && uri.startsWith('data:')) {
        return importPdfFile(uri, name, id);
      }
      //PDFでローカルファイルでモバイルの場合
      if (ext === 'pdf' && uri.startsWith('file://')) {
        return await importPdfFile(uri, name, id);
      }
      //PDFでWebからダウンロードする場合
      if ((ext === 'pdf' && uri.startsWith('http')) || uri.startsWith('pdf://')) {
        //uriからbasicauth部分を取得
        let dataUri = '';
        const auth = uri.split('@')[0].split('//')[1];
        const options = auth ? 'Basic' + ' ' + Buffer.from(auth).toString('base64') : '';
        const tempPdf = `${FileSystem.cacheDirectory}${ulid()}.pdf`;
        const updateDownloadProgress = (ratio: number) => {
          if (!Number.isFinite(ratio)) return;
          const clampedRatio = clamp(ratio, 0, 1);
          const range = PDF_PROGRESS.downloadEnd - PDF_PROGRESS.downloadStart;
          const value = PDF_PROGRESS.downloadStart + clampedRatio * range;
          setProgress(formatProgress(value));
        };
        updateDownloadProgress(0);
        //firebaseからダウンロードする場合
        if (uri.startsWith('pdf://')) {
          const downloadUrl = uri.replace('pdf://', '');
          if (!key) return { isOK: false, message: t('hooks.message.failReceiveFile') };
          const result = await projectStorage.downloadPDF(downloadUrl, key, updateDownloadProgress);
          if (!result.isOK || result.data === undefined) {
            return { isOK: false, message: t('hooks.message.failReceiveFile') };
          }
          dataUri = result.data;
        } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
          const downloadUrl = uri;
          const download = FileSystem.createDownloadResumable(
            downloadUrl,
            tempPdf,
            {
              headers: { Authorization: options },
            },
            (downloadProgress) => {
              const { totalBytesExpectedToWrite, totalBytesWritten } = downloadProgress;
              if (!totalBytesExpectedToWrite) return;
              updateDownloadProgress(totalBytesWritten / totalBytesExpectedToWrite);
            }
          );
          const response = await download.downloadAsync();
          if (!response || response.status !== 200) {
            return { isOK: false, message: t('hooks.message.failReceiveFile') };
          }
          updateDownloadProgress(1);
          dataUri = response.uri;
        } else if (Platform.OS === 'web') {
          try {
            const noAuthUri = uri.replace(/^(https?:\/\/)([^:]+):([^@]+)@/, '$1');
            const response = await fetch(noAuthUri, {
              mode: 'cors',
              headers: {
                Authorization: options,
              },
            });

            if (!response.ok) {
              return { isOK: false, message: t('hooks.message.failReceiveFile') };
            }
            let blob: Blob;
            const contentLengthHeader = response.headers.get('content-length');
            if (response.body && contentLengthHeader) {
              const totalBytes = parseInt(contentLengthHeader, 10);
              if (Number.isFinite(totalBytes) && totalBytes > 0) {
                const reader = response.body.getReader();
                const chunks: Uint8Array[] = [];
                let loaded = 0;
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) {
                    chunks.push(value);
                    loaded += value.length;
                    updateDownloadProgress(loaded / totalBytes);
                  }
                }
                blob = new Blob(chunks as BlobPart[]);
              } else {
                blob = await response.blob();
              }
            } else {
              blob = await response.blob();
            }
            updateDownloadProgress(1);
            const base64 = await blobToBase64(blob);
            dataUri = `data:application/pdf;base64,${base64}`;
          } catch (error) {
            console.error('PDF download error:', error);
            // CORSエラーの可能性が高い
            return { isOK: false, message: t('hooks.message.corsError') };
          }
        }
        const result = await importPdfFile(dataUri, name, id);
        unlink(tempPdf);
        return result;
      }

      return { isOK: false, message: '' };
    },
    [importJsonMapFile, importPdfFile, importPmtilesFile]
  );

  return {
    progress,
    mapListURL,
    mapList,
    maps,
    editedMap,
    isOffline,
    isMapEditorOpen,
    filterdMaps,
    changeVisible,
    changeMapOrder,
    toggleOnline,
    deleteMap,
    openEditMap,
    closeEditMap,
    saveMap,
    fetchMapList,
    saveMapListURL,
    importMapFile,
    importPdfFile,
    importPmtilesFile,
    importStyleFile,
    clearTileCache,
    clearTiles,
    updatePmtilesURL,
    changeExpand,
    getPmtilesBoundary,
    updateMapOrder,
    onDragBegin,
    exportSingleMap,
  } as const;
};
