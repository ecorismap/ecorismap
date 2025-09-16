import React, { useCallback } from 'react';
import MapEdit from '../components/pages/MapEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { MapEditContext } from '../contexts/MapEdit';
import { useMapEdit } from '../hooks/useMapEdit';
import { useMaps } from '../hooks/useMaps';
import { Props_MapEdit } from '../routes';
import { t } from '../i18n/config';
import { Platform } from 'react-native';
import { formattedInputs } from '../utils/Format';
import * as DocumentPicker from 'expo-document-picker';
import { getExt } from '../utils/General';
import * as FileSystem from 'expo-file-system';
import { db } from '../utils/db';
import { TILE_FOLDER } from '../constants/AppConstants';

export default function MapEditContainer({ navigation, route }: Props_MapEdit) {
  const {
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
    saveMap: saveMapToState,
  } = useMapEdit(route.params.targetMap);

  const { deleteMap, exportSingleMap, importStyleFile, getPmtilesBoundary } = useMaps();

  const pressSaveMap = useCallback(async () => {
    const checkInputs = () => {
      if (map.isGroup) return map.name !== '';
      const { isOK } = formattedInputs(map.url, 'url');
      return isOK;
    };
    if (!checkInputs()) {
      await AlertAsync(t('hooks.message.wrongInput'));
      return;
    }

    const finalMap = { ...map };

    // pmTilesの場合、boundaryを取得して保存する
    if (map.url.includes('pmtiles')) {
      // urlが変更された場合、boundaryとcacheを削除する
      if (route.params.targetMap && (route.params.targetMap.url !== map.url || route.params.targetMap.styleURL !== map.styleURL)) {
        if (Platform.OS === 'web') {
          await db.pmtiles.delete(map.id);
        } else {
          await FileSystem.deleteAsync(`${TILE_FOLDER}/${map.id}`, { idempotent: true });
        }
      }
      
      const { header, boundary } = await getPmtilesBoundary(map.url);
      // boundaryが取得できた場合のみ保存処理を行う
      if (boundary) {
        if (Platform.OS === 'web') {
          await db.pmtiles.update(map.id, {
            boundary: JSON.stringify(boundary),
          });
        } else {
          await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${map.id}`, {
            intermediates: true,
          });
          const boundaryUri = `${TILE_FOLDER}/${map.id}/boundary.json`;
          await FileSystem.writeAsStringAsync(boundaryUri, JSON.stringify(boundary));
        }
      }

      finalMap.minimumZ = header ? header.minZoom : 4;
      finalMap.maximumZ = header ? header.maxZoom : 16;
    }

    saveMapToState();
  }, [getPmtilesBoundary, map, route.params.targetMap, saveMapToState]);

  const pressDeleteMap = useCallback(async () => {
    const ret = await ConfirmAsync(t('Maps.confirm.deleteMap'));
    if (ret) {
      const { isOK, message } = await deleteMap(map);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigation.goBack();
      }
    }
  }, [deleteMap, map, navigation]);

  const pressExportMap = useCallback(async () => {
    const result = await exportSingleMap(map);
    await AlertAsync(result.message);
  }, [exportSingleMap, map]);

  const pressImportStyle = useCallback(async () => {
    const file = await DocumentPicker.getDocumentAsync({});
    if (file.assets === null) return;
    const name = file.assets[0].name;
    const uri = file.assets[0].uri;
    const ext = getExt(name)?.toLowerCase();
    if (!(ext === 'json')) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    const { message } = await importStyleFile(uri, name, map);
    if (message !== '') await AlertAsync(message);
    
    // スタイルファイルのインポート後、styleURLを更新
    if (Platform.OS === 'web') {
      changeStyleURL('style://' + name);
    } else {
      changeStyleURL('style://style.json');
    }
  }, [changeStyleURL, importStyleFile, map]);

  const gotoBack = useCallback(() => {
    if (isEdited) {
      ConfirmAsync(t('common.confirm.cancelEdit')).then((ret) => {
        if (ret) navigation.goBack();
      });
    } else {
      navigation.goBack();
    }
  }, [isEdited, navigation]);

  return (
    <MapEditContext.Provider
      value={{
        map,
        isEdited,
        isNewMap,
        pressDeleteMap,
        pressSaveMap,
        pressExportMap,
        pressImportStyle,
        gotoBack,
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
      }}
    >
      <MapEdit />
    </MapEditContext.Provider>
  );
}