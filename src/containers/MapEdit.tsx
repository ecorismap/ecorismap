import React, { useCallback, useRef, useState } from 'react';
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
import { clearPickerInbox } from '../utils/File';
import * as FileSystem from 'expo-file-system/legacy';
import { db } from '../utils/db';
import { TILE_FOLDER } from '../constants/AppConstants';
import { isPeaksUrl } from '../utils/peaks/peak2dLabels';
import { discardStaleTileSources } from '../utils/tileSourceCleanup';
import { nextNativeStyleURL } from '../utils/vectorStyleFile';
import { hasSharedStyle } from '../utils/mapExport';
import { pmtilesHeaderZoom, resetPreviousArchiveZoom } from '../utils/pmtilesHeaderZoom';
import { getPmtileMaximumNativeZ } from '../utils/pmtileProps';
import { isPmtilesSourceUrl } from '../utils/tileSourceChange';
import { removeTerrainTextureCacheForMap } from '../utils/terrain3d/textureDiskCache';
import { Loading } from '../components/molecules/Loading';
import { boundaryType, TileMapType } from '../types';
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

  const { deleteMap, exportSingleMap, readStyleFile, saveStyleFile, getPmtilesBoundary } = useMaps();
  // 読み込んだがまだ保存していないスタイル。保存せずに戻れば捨てる
  const pendingStyleRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

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

    // ヘッダーの取得を待つ間にもう一度押すと、新規の地図が2つできる
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const previousMap = store.getState().tileMaps.find(({ id }) => id === map.id);
      const finalMap: TileMapType = { ...map, ...resetPreviousArchiveZoom(previousMap, map) };

      // 通信はここで済ませる。この後の「スタイルを書く→古いタイルを捨てる→一覧を差し替える」の途中で待つと、
      // まだ表示中の古い地図部品が、捨てたタイルや書いたスタイルを古い内容で書き戻す
      let boundary: boundaryType | undefined;
      if (map.url.includes('pmtiles')) {
        setIsSaving(true);
        const result = await getPmtilesBoundary(map.url).finally(() => setIsSaving(false));
        boundary = result.boundary;
        // ヘッダーが読めない（取得失敗・オフライン）ときは利用者の設定を残す
        if (result.header) {
          Object.assign(finalMap, pmtilesHeaderZoom(finalMap, result.header));
        } else if (!isEdited) {
          // ズームの取り直しのためだけの保存（以前の版で登録した地図）。読めなければ何も変わらないので知らせる
          await AlertAsync(t('hooks.message.failGetData'));
          return;
        }
      }

      // 読み込んだあとでスタイル欄を端末内のスタイル以外（URL・空・共有のスタイル）に変えていたら書かない。
      // style:// の後ろの名前は描画に使わないので、名前だけ書き換えても読み込んだものを書く
      const pendingStyle = pendingStyleRef.current;
      if (pendingStyle !== null && map.styleURL?.startsWith('style://') && !hasSharedStyle(map)) {
        const { isOK, message } = await saveStyleFile(map.id, pendingStyle);
        if (!isOK) {
          // 置けていないスタイルを指したまま保存しない
          await AlertAsync(message);
          return;
        }
      }
      pendingStyleRef.current = null;

      // 取得内容（URL・flipY・tileSize・スタイル）が変わったら、旧ソースのタイル・保存範囲・3Dのテクスチャを
      // 確認なしで捨てる。プリセットの適用もここを通る。boundary.json を書く前に済ませる（M-H6）
      await discardStaleTileSources(store, [finalMap]);
      // 3D は最大ズームより上の段に「タイルなし」の印を残すので、拡大を始めるズームが変わったら捨てる
      if (
        Platform.OS !== 'web' &&
        previousMap !== undefined &&
        isPmtilesSourceUrl(map.url) &&
        getPmtileMaximumNativeZ(previousMap, false) !== getPmtileMaximumNativeZ(finalMap, false)
      ) {
        await removeTerrainTextureCacheForMap(map.id);
      }

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

      saveMapToState(finalMap);
    } finally {
      savingRef.current = false;
    }
  }, [getPmtilesBoundary, isEdited, map, saveMapToState, saveStyleFile, store]);

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
    if (result.message !== '') await AlertAsync(result.message);
  }, [exportSingleMap, map]);

  const pressImportStyle = useCallback(async () => {
    const file = await DocumentPicker.getDocumentAsync({});
    await clearPickerInbox();
    if (file.assets === null) return;
    const name = file.assets[0].name;
    const uri = file.assets[0].uri;
    const ext = getExt(name)?.toLowerCase();
    if (!(ext === 'json')) {
      await AlertAsync(t('hooks.message.wrongExtension'));
      return;
    }
    const result = await readStyleFile(uri);
    // 失敗時に style:// へ切り替えると、置かれていないスタイルを指したまま保存されてしまう
    if (!result.isOK) {
      await AlertAsync(result.message);
      return;
    }
    pendingStyleRef.current = result.style;
    const savedStyleURL = store.getState().tileMaps.find(({ id }) => id === map.id)?.styleURL;
    changeStyleURL(Platform.OS === 'web' ? 'style://' + name : nextNativeStyleURL(savedStyleURL));
  }, [changeStyleURL, map.id, readStyleFile, store]);

  const gotoBack = useCallback(() => {
    // 保存中（ヘッダーの取得待ち）に破棄の確認を出すと、保存されたのに「破棄しますか」が残る
    if (savingRef.current) return;
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
      <Loading visible={isSaving} text={t('common.processing')} />
    </MapEditContext.Provider>
  );
}