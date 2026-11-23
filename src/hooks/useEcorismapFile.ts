import { useCallback, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import { saveProjectBackup } from '../utils/projectBackup';
import {
  DataType,
  EcorisMapFileType,
  ExportType,
  LayerType,
  PhotoType,
  RecordType,
  RegionType,
  SettingsType,
  TileMapType,
} from '../types';

import { RootState } from '../store';
import { layersInitialState, setLayersAction } from '../modules/layers';
import { dataSetInitialState } from '../modules/dataSet';
import { tileMapsInitialState } from '../modules/tileMaps';
import { settingsInitialState } from '../modules/settings';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { setDataSetAction } from '../modules/dataSet';
import { cloneDeep } from 'lodash';
import { setTileMapsAction } from '../modules/tileMaps';
import { dropUnsafeTileMaps } from '../utils/tileMapId';
import { setSettingsAction } from '../modules/settings';
import { t } from '../i18n/config';
import { findDictionaryFileKey, findPhotoFileKey, getExt, photoContentTypeFromName, truncateMiddle } from '../utils/General';

import dayjs from '../i18n/dayjs';
import { PHOTO_FOLDER } from '../constants/AppConstants';
import { isSafePathSegment, isUriInsideFolder } from '../utils/safePath';
import { unzipFromUri, ZipTooLargeError } from '../utils/Zip';
import JSZip from 'jszip';
import { ulid } from 'ulid';
import { deleteDatabase, importDictionary } from '../utils/SQLite';
import { useGeoFile } from './useGeoFile';
import { clearAllDynamicDictionaries } from './useDynamicDictionaryInput';
import { clearAllVisibilitySnapshots } from './useData';
import { runPhotoUriRebase } from '../utils/photoUriRebase';

export type UseEcorisMapFileReturnType = {
  isLoading: boolean;
  clearEcorisMap: () => Promise<{
    isOK: boolean;
    message: string;
  }>;
  generateEcorisMapData: (
    data: {
      dataSet: DataType[];
      layers: LayerType[];
      settings: SettingsType;
      maps: TileMapType[];
    },
    option?: {
      includePhoto: boolean;
      fromProject: boolean;
    }
  ) => Promise<
    {
      data: string;
      name: string;
      type: ExportType;
      folder: string;
    }[]
  >;

  openEcorisMapFile: (uri: string) => Promise<{
    isOK: boolean;
    message: string;
    region?: RegionType;
  }>;
  createExportSettings: () => SettingsType;
};

export const useEcorisMapFile = (): UseEcorisMapFileReturnType => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const settings = useSelector((state: RootState) => state.settings);
  const [isLoading, setIsLoading] = useState(false);

  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const user = useSelector((state: RootState) => state.user, shallowEqual);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );
  const { generateExportGeoData } = useGeoFile();

  const createExportSettings = useCallback(() => {
    return {
      ...settings,
      tutrials: { ...settings.tutrials, TERMS_OF_USE: false },
      isSettingProject: false,
      isSynced: false,
      isEditingRecord: false,
      role: undefined,
      tileRegions: [],
      projectId: undefined,
      projectName: undefined,
      memberLocation: [],
      tracking: undefined,
      selectedRecord: undefined,
      plugins: {},
      photosToBeDeleted: [],
    } as SettingsType;
  }, [settings]);

  const sortGroupData = (data: RecordType[]) => {
    // 親要素を取得
    const parents = data.filter((item) => (item.field._group ? item.field._group === '' : true));
    // 子要素を取得（一時的に使用しないが、後のステップで役立つかもしれない）
    // const children = data.filter(item => item._group !== "");

    // ソートされたデータを保持する配列
    const sortedData: RecordType[] = [];

    // 各親要素に対して、その子要素を見つけて配列に追加する
    parents.forEach((parent) => {
      sortedData.push(parent); // 親要素を追加
      // この親の子要素を見つけて追加
      data
        .filter((child) => child.field._group === parent.id)
        .forEach((child) => {
          sortedData.push(child);
        });
    });

    return sortedData;
  };

  const generateEcorisMapData = useCallback(
    async (
      data: {
        dataSet: DataType[];
        layers: LayerType[];
        settings: SettingsType;
        maps: TileMapType[];
      },
      option?: { includePhoto: boolean; fromProject: boolean }
    ) => {
      const exportData: { data: string; name: string; type: ExportType; folder: string }[] = [];
      const savedData = JSON.stringify(data);
      const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
      const savedDataName = `local_${time}.json`;
      exportData.push({ data: savedData, name: savedDataName, type: 'JSON', folder: '' });

      for (const layer of data.layers) {
        if (layer.type === 'LAYERGROUP') continue;
        // 長いレイヤ名でzip内部パスがWindowsのMAX_PATH(260文字)を超えると、
        // Windows標準の圧縮フォルダー機能で解凍に失敗する。識別性を保ちつつ短くするため:
        //  ・レイヤ名は中略（先頭＋末尾）で切り詰め、フォルダ名・ファイル名の両方に付与
        //  ・フォルダ名末尾に layer.id を付けて一意性を担保
        //  ・ファイル名には時刻を入れない（zip名が日付付き＋拡張子で種別が分かる＝冗長回避）
        // フォルダ名のサニタイズはFile.ts/File.web.ts側で行われる。
        // インポートはlayer.id基準で照合するため新旧バックアップとも互換。
        const safeLayerName = truncateMiddle(layer.name.normalize('NFC'));
        const fileNameBase = safeLayerName;
        const exportFolder = `${safeLayerName}_${layer.id}`;
        //mapMemoの場合はグループ化されたデータをソートしてエクスポート
        const records = data.dataSet.map((d) => (d.layerId === layer.id ? d.data.map((v) => v) : [])).flat();
        const isMapMemoLayer = records.some((r) => r.field._strokeColor !== undefined);
        const sortedRecords = isMapMemoLayer ? sortGroupData(records) : records;
        const geoData = await generateExportGeoData(layer, sortedRecords, fileNameBase, {
          exportPhoto: option?.includePhoto || option?.fromProject,
          folder: exportFolder,
          exportDictionary: true,
        });
        // fromProjectでもクラウドの写真はここで別に取得しない。generateExportGeoDataが写真ごとに
        // url/key と photoId を積み、ZIP作成時（File.ts/File.web.ts）にローカルが無ければクラウドから取得する。
        // 別途積むと photoId なしの同じ写真がレイヤフォルダ直下にも入り、二重取得・二重格納になる
        exportData.push(...geoData);
      }
      return exportData;
    },
    [generateExportGeoData]
  );

  async function importPhotos(
    files: {
      [key: string]: JSZip.JSZipObject;
    },
    from: string,
    to: string
  ) {
    try {
      let newUri;

      if (Platform.OS === 'web') {
        const content = await files[from].async('arraybuffer');
        const buffer = new Uint8Array(content);
        //種類のないBlobはアップロードでapplication/octet-streamになりRulesに拒否されるので、名前から付ける（写真監査 P-M5）
        const photoData = new Blob([buffer.buffer], { type: photoContentTypeFromName(to) ?? 'image/jpeg' });
        newUri = URL.createObjectURL(photoData);
        //console.log(newUri);
      } else {
        // 呼び出し側で検証済みでも、写真フォルダの外へ書く経路を最後にもう一度塞ぐ
        if (!isUriInsideFolder(to, PHOTO_FOLDER)) return undefined;
        const photoData = await files[from].async('base64');
        newUri = to;
        //console.log(newUri);
        await FileSystem.writeAsStringAsync(newUri, photoData, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      return newUri;
    } catch (e) {
      console.log('#####', e);
      return undefined;
    }
  }

  const updatePhotoField = useCallback(
    async (
      data: EcorisMapFileType,
      files: {
        [key: string]: JSZip.JSZipObject;
      }
    ) => {
      //写真をコピー
      //URIを書き換える
      let newDataSet: DataType[] = [];
      for (const layer of data.layers) {
        // layer.idと写真名はファイル由来。%2f等で写真フォルダの外を指せるため、満たさないものは写真を取り込まない
        const isLayerIdSafe = isSafePathSegment(layer.id);
        const toFolder = `${PHOTO_FOLDER}/LOCAL/${layer.id}/OWNER`;
        if (Platform.OS !== 'web' && isLayerIdSafe && isUriInsideFolder(toFolder, PHOTO_FOLDER)) {
          await FileSystem.makeDirectoryAsync(toFolder, {
            intermediates: true,
          });
        }
        const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
        const layerDataSet = data.dataSet.filter((d) => d.layerId === layer.id);

        const newLayerDataSet = layerDataSet.map(async (layerData) => {
          const newRecords = layerData.data.map(async (record) => {
            const newRecord = cloneDeep(record);
            for (const photoField of photoFields) {
              const photos = (record.field[photoField.name] as PhotoType[]).map(async (photo) => {
                if (photo.uri) {
                  if (!isLayerIdSafe || !isSafePathSegment(photo.name)) return photo;
                  // zip内の写真ファイルを layer.id 基準で探す。
                  // エクスポート時にレイヤ名を切り詰めてもフォルダ名には layer.id が
                  // 含まれるため、新旧どちらのバックアップでもヒットする。
                  // 写真名は秒単位の自動命名で別レコードと重なりうる。新形式のZIPは photo.id のフォルダに分けて
                  // 入っているので photo.id で照合し、書き込み先も photo.id のフォルダに分けて上書きし合わないようにする。
                  // 旧形式（レイヤフォルダ直下）のZIPは findPhotoFileKey がベース名だけで拾う
                  const from = findPhotoFileKey(Object.keys(files), layer.id, photo.name, photo.id);
                  if (from === undefined) return photo;
                  const toDir = isSafePathSegment(photo.id) ? `${toFolder}/${photo.id}` : toFolder;
                  const to = `${toDir}/${photo.name}`;
                  if (Platform.OS !== 'web' && toDir !== toFolder) {
                    if (!isUriInsideFolder(to, PHOTO_FOLDER)) return photo;
                    await FileSystem.makeDirectoryAsync(toDir, { intermediates: true });
                  }
                  const newUri = await importPhotos(files, from, to);
                  return { ...photo, uri: newUri };
                } else {
                  return photo;
                }
              });
              newRecord.field[photoField.name] = await Promise.all(photos);
            }

            return newRecord;
          });
          return { ...layerData, data: await Promise.all(newRecords) };
        });
        newDataSet = [...newDataSet, ...(await Promise.all(newLayerDataSet))];
      }
      return newDataSet;
    },
    []
  );

  const loadDictionary = useCallback(async (layers: LayerType[], loaded: JSZip) => {
    const files = loaded.files;

    for (const layer of layers) {
      // sqliteはレイヤ別フォルダ（layer.idを含む）配下に置かれる。
      // レイヤ名はエクスポート時に切り詰められる可能性があるため layer.id で照合する。
      const sqliteFile = findDictionaryFileKey(Object.keys(files), layer.id);

      if (sqliteFile !== undefined) {
        const sqlite =
          Platform.OS !== 'web'
            ? await loaded.files[sqliteFile].async('uint8array')
            : await loaded.files[sqliteFile].async('arraybuffer');

        await importDictionary(sqlite);
      }
    }
  }, []);

  const updateDataSetUser = useCallback(
    (dataSet: DataType[]) => {
      //userとidを書き換える
      //複数の管理者がデータをアップロードするときに、同じidが発生する？ので書き換える。要調査
      const newDataSet = dataSet.map((d) => {
        const newData = d.data.map((v) => {
          return { ...v, id: ulid(), userId: dataUser.uid, displayName: dataUser.displayName };
        });
        return { ...d, userId: dataUser.uid, data: newData };
      });
      return newDataSet;
    },
    [dataUser.displayName, dataUser.uid]
  );

  const mergeSameLayer = useCallback(
    (dataSet: DataType[]) => {
      //同じレイヤーのデータをマージ.ユーザーも書き換える
      const newDataSet: DataType[] = [];
      const layerIds = dataSet.map((d) => d.layerId);
      const uniqueLayerIds = layerIds.filter((x, i, self) => self.indexOf(x) === i);
      uniqueLayerIds.forEach((layerId) => {
        const layerDataSet = dataSet.filter((d) => d.layerId === layerId);
        const mergedData = layerDataSet.map((d) => d.data).flat();
        newDataSet.push({ layerId: layerId, userId: dataUser.uid, data: mergedData });
      });
      return newDataSet;
    },
    [dataUser.uid]
  );

  const loadEcorisMapFile = useCallback(
    async (uri: string) => {
      try {
        setIsLoading(true);
        const loaded = await unzipFromUri(uri);
        const jsonFile = Object.keys(loaded.files).find((f) => {
          if (getExt(f) !== 'json') return false;
          // ルートレベル または トップレベルフォルダ直下のJSONファイルを検索
          const parts = f.split('/').filter((p) => p !== '');
          return parts.length === 1 || (parts.length === 2 && !f.endsWith('/'));
        });

        if (jsonFile === undefined) return;
        const decompressed = await loaded.files[jsonFile].async('text');
        const data = JSON.parse(decompressed) as EcorisMapFileType;
        await loadDictionary(data.layers, loaded);
        const updatedPhotoDataSet = await updatePhotoField(data, loaded.files);
        const updatedUserDataSet = updateDataSetUser(updatedPhotoDataSet);
        const mergedDataSet = mergeSameLayer(updatedUserDataSet);
        // console.log('updatedUserDataSet', updatedUserDataSet);
        return { ...data, dataSet: mergedDataSet };
      } catch (e) {
        // 大きすぎるZIPは理由を利用者に伝える（それ以外は従来どおり「取得に失敗」で扱う）
        if (e instanceof ZipTooLargeError) throw e;
        console.log(e);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [loadDictionary, mergeSameLayer, updateDataSetUser, updatePhotoField]
  );

  const openEcorisMapFile = useCallback(
    async (uri: string) => {
      //console.log('######', loaded);
      let loaded: Awaited<ReturnType<typeof loadEcorisMapFile>>;
      try {
        loaded = await loadEcorisMapFile(uri);
      } catch (e) {
        if (e instanceof ZipTooLargeError) return { isOK: false, message: e.message };
        throw e;
      }
      // 失敗を isOK:true で返すと、設定画面が「読み込みました」と表示して地図へ移ってしまう
      if (loaded === undefined) {
        return { isOK: false, message: t('hooks.message.failGetData') };
      }
      //ファイル読み込み（この端末/Google Drive）による上書きで現在のデータが失われないよう、直前に自動バックアップ
      const state = store.getState();
      saveProjectBackup(
        {
          settings: state.settings,
          layers: state.layers,
          tileMaps: state.tileMaps,
          dataSet: state.dataSet,
          user: state.user,
          projects: state.projects,
          dataSync: state.dataSync,
        },
        'fileOpen'
      );
      //ToDo: データのサイズチェック。もともと書き出したものだからチェックいらない？
      dispatch(setDataSetAction(loaded.dataSet));
      dispatch(setLayersAction(loaded.layers));
      //記録中に開くと、直前に軌跡を止めて保存する（軌跡監査 T-M8）。保存で設定が変わることがある
      //（GNSS 軌跡の色分けの自動切替など）ので、描画時点の settings ではなく今の設定に重ねる
      dispatch(
        setSettingsAction({
          ...state.settings,
          mapRegion: loaded.settings.mapRegion,
          mapType: loaded.settings.mapType,
        })
      );
      //地図IDは保存先フォルダ名（TILE_FOLDER/{id}）になるため、フォルダの外を指すIDの地図は取り込まない
      dispatch(setTileMapsAction(dropUnsafeTileMaps(loaded.maps)));
      //写真なしで書き出したファイルを同じ端末で開くと、写真uriは書き出し時のコンテナを指したまま入る。iOSはアプリ更新で
      //コンテナUUIDが変わるので、次の起動を待たずにここで付け替える（冪等。iOS以外は何もしない。写真監査 P-L10）
      runPhotoUriRebase(store);

      return { isOK: true, message: '', region: loaded.settings.mapRegion };
    },
    [dispatch, loadEcorisMapFile, store]
  );

  const clearEcorisMap = useCallback(async () => {
    await deleteDatabase();
    //レイヤ、データ、地図情報、設定をリセット。設定のtutrial・利用規約同意状態・更新情報の既読は現在の状況を引き継ぐ
    dispatch(setLayersAction(layersInitialState));
    dispatch(setDataSetAction(dataSetInitialState));
    dispatch(setTileMapsAction(tileMapsInitialState));
    dispatch(
      setSettingsAction({
        ...settingsInitialState,
        tutrials: settings.tutrials,
        agreedTermsVersion: settings.agreedTermsVersion,
        //リセットすると次回起動で更新情報モーダルが再表示されてしまうため引き継ぐ
        lastSeenVersion: settings.lastSeenVersion,
        //地図の表示位置は戻さない。ファイルを開くときと違いクリアでは地図を動かさないので、
        //状態だけ初期位置にすると表示とずれ、描いたものが初期位置（緯度35/経度135）に保存される
        //（ネイティブは画面座標→緯度経度の変換にmapRegionを使うため）
        mapRegion: settings.mapRegion,
      })
    );
    // 動的辞書をクリア
    clearAllDynamicDictionaries();
    clearAllVisibilitySnapshots();
    //ログインしていない前提なので、プロジェクトで使うかもしれない写真、地図キャッシュは消さない
    // const { uri } = await FileSystem.getInfoAsync(TILE_FOLDER);
    // if (uri) {
    //   await FileSystem.deleteAsync(uri);
    // }

    return { isOK: true, message: '' };
  }, [dispatch, settings?.tutrials, settings?.agreedTermsVersion, settings?.lastSeenVersion, settings?.mapRegion]);

  return {
    isLoading,
    clearEcorisMap,
    generateEcorisMapData,
    openEcorisMapFile,
    createExportSettings,
  } as const;
};
