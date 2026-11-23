import React, { useCallback } from 'react';
import MapEdit from '../components/pages/MapEdit';
import { AlertAsync, ConfirmAsync } from '../components/molecules/AlertAsync';
import { MapEditContext } from '../contexts/MapEdit';
import { useMapEdit } from '../hooks/useMapEdit';
import { useMaps } from '../hooks/useMaps';
import { useBottomSheetNavigation, useBottomSheetRoute } from '../contexts/BottomSheetNavigationContext';
import { t } from '../i18n/config';
import { Platform } from 'react-native';
import { formattedInputs } from '../utils/Format';
import * as DocumentPicker from 'expo-document-picker';
import { getExt } from '../utils/General';
import * as FileSystem from 'expo-file-system/legacy';
import { db } from '../utils/db';
import { TILE_FOLDER } from '../constants/AppConstants';
import { isPeaksUrl } from '../utils/peaks/peak2dLabels';
import { discardStaleTileSources } from '../utils/tileSourceCleanup';
import { pmtilesHeaderZoom } from '../utils/pmtilesHeaderZoom';
import { useStore } from 'react-redux';
import { RootState } from '../store';

export default function MapEditContainer() {
  const { goBack: navigationGoBack } = useBottomSheetNavigation();
  const { params } = useBottomSheetRoute<'MapEdit'>();
  const store = useStore<RootState>();

  const {
    map,
    isEdited,
    isNewMap,
    changeMapName,
    changeMapURL,
    changeStyleURL,
    changeIsVector,
    changeAttribution,
    changeTransparency,
    changeMinimumZ,
    changeMaximumZ,
    changeOverzoomThreshold,
    changeHighResolutionEnabled,
    changeFlipY,
    applyMapPreset,
    saveMap: saveMapToState,
  } = useMapEdit(params!.targetMap);

  const { deleteMap, exportSingleMap, importStyleFile, getPmtilesBoundary } = useMaps();

  const pressSaveMap = useCallback(async () => {
    const checkInputs = () => {
      if (map.isGroup) return map.name !== '';
      // 山名（peaks://）はタイルURLではない（同梱の山頂データを重ねる印）ので、URL形式の検査をしない
      if (isPeaksUrl(map.url)) return true;
      const { isOK } = formattedInputs(map.url, 'url');
      return isOK;
    };
    if (!checkInputs()) {
      await AlertAsync(t('hooks.message.wrongInput'));
      return;
    }

    const finalMap = { ...map };

    // 取得内容（URL・flipY・tileSize・スタイル）が変わったら、旧ソースのタイル・保存範囲・3Dのテクスチャを
    // 確認なしで捨てる。プリセットの適用もここを通る。boundary.json を書く前に済ませる（M-H6）
    await discardStaleTileSources(store, [map]);

    // pmTilesの場合、boundaryを取得して保存する
    if (map.url.includes('pmtiles')) {
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

      // ヘッダーが読めない（ネイティブ・取得失敗）ときは利用者の設定を残す
      if (header) Object.assign(finalMap, pmtilesHeaderZoom(map, header));
    }

    saveMapToState(finalMap);
  }, [getPmtilesBoundary, map, saveMapToState, store]);

  const pressDeleteMap = useCallback(async () => {
    const ret = await ConfirmAsync(t('Maps.confirm.deleteMap'));
    if (ret) {
      const { isOK, message } = await deleteMap(map);
      if (!isOK) {
        await AlertAsync(message);
      } else {
        navigationGoBack();
      }
    }
  }, [deleteMap, navigationGoBack, map]);

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
    const { isOK, message } = await importStyleFile(uri, name, map);
    if (message !== '') await AlertAsync(message);
    // 失敗時に style:// へ切り替えると、置かれていないスタイルを指したまま保存されてしまう
    if (!isOK) return;

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
        if (ret) navigationGoBack();
      });
    } else {
      navigationGoBack();
    }
  }, [navigationGoBack, isEdited]);

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
        changeAttribution,
        changeTransparency,
        changeMinimumZ,
        changeMaximumZ,
        changeOverzoomThreshold,
        changeHighResolutionEnabled,
        changeFlipY,
        changeMapPreset: applyMapPreset,
      }}
    >
      <MapEdit />
    </MapEditContext.Provider>
  );
}