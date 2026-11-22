import { useCallback, useState } from 'react';
import {
  DataType,
  LayerType,
  PhotoType,
  ProjectSettingsType,
  ProjectType,
  RecordType,
  RegionType,
  TileMapType,
} from '../types';
import { TILE_FOLDER } from '../constants/AppConstants';
import * as projectStore from '../lib/firebase/firestore';
import type { UndecryptableGroupType, UnmarkedDekGroupType } from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import { RootState } from '../store';
import { saveProjectBackup } from '../utils/projectBackup';
import { markLayerUploaded } from '../utils/unsyncedChanges';
import { deleteDataAction, setDataSetAction, updateDataAction, updateRecordsAction } from '../modules/dataSet';
import { setDataSyncTimestampsAction, dataSyncKey } from '../modules/dataSync';
import { layersInitialState, setLayersAction } from '../modules/layers';
import { tileMapsInitialState, setTileMapsAction } from '../modules/tileMaps';
import { dropUnsafeTileMaps } from '../utils/tileMapId';
import { photoDownloadTarget } from '../utils/photoDownloadPath';
import { editSettingsAction } from '../modules/settings';
import { addProjectAction, deleteProjectAction, updateProjectAction } from '../modules/projects';
import { cloneDeep } from 'lodash';
import { getPhotoFields, getTargetLayers } from '../utils/Layer';
import { isLoggedIn } from '../utils/Account';
import { CommonAbsorption, getTargetRecordSet, mergeLayerData } from '../utils/Data';
import { Platform } from 'react-native';
import { t } from '../i18n/config';
import { AlertAsync, ConfirmAsync, DataConflictConfirmAsync } from '../components/molecules/AlertAsync';
import { exportDatabase, hasDictionaryTables, importDictionary } from '../utils/SQLite';
import { ulid } from 'ulid';
import { db } from '../utils/db';
import * as FileSystem from 'expo-file-system/legacy';

export type UploadDataOptions = {
  /**
   * 設定の保存で COMMON をまとめて送るための取り込み結果（utils/Data の buildCommonAbsorption）。
   * これがあるレイヤは、手元の全バケットと取り込んだ記録を自分の名義の1つにまとめて送り、成功したら
   * クラウドの他人名義の doc（内容を持っている人の分だけ）とテンプレートを片付け、手元も1つのバケットにそろえる
   */
  commonAbsorption?: CommonAbsorption;
};

/**
 * createMergedDataSet に渡す「今回クラウドから取り直した範囲」。この範囲のレイヤでは、取得結果に無い他人のバケットを
 * クラウドから消えたものとして手元から消し、テンプレートも取得結果にそろえる。範囲外（取得していない権限のレイヤ）は
 * クラウドの状態が分からないので手元をそのまま残す
 */
export type FetchedScope = {
  /** 他人の分まで取得した権限。PRIVATE は管理者として全員分を取得したときだけ含める */
  permissions: ('PUBLIC' | 'PRIVATE')[];
  /** テンプレートを取得したか */
  template: boolean;
  /**
   * 取得結果に無い他人のバケットを手元から消すか（省略時は消す）。管理者が PRIVATE を取得しなかったときは false にする
   * （PRIVATE から PUBLIC に変えた直後のレイヤでは、メンバーの記録が PUBLIC の取得に現れず、手元の写しだけが消えるため）
   */
  pruneOthers?: boolean;
};

/** 設定の保存で新しい版を書いた辞書。設定の書き込みに成功してから、旧形式のパスへ写し、古い版を消すために持つ */
type DictionaryUpload = {
  layerId: string;
  version: string;
  encdata: Blob;
  /** 保存前のクラウドの設定が指していた版（旧形式なら undefined） */
  previousVersion?: string;
};

export type UseRepositoryReturnType = {
  createProject: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  updateProject: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  deleteProject: (project_: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;

  downloadProjectSettings: (project_: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    region: RegionType | undefined;
  }>;
  fetchProjectSettings: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    data: ProjectSettingsType | undefined;
  }>;
  fetchAllData: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[] | undefined;
  }>;
  fetchAllPhotos: (
    layer: LayerType,
    records: RecordType[]
  ) => Promise<
    | {
        data: string;
        name: string;
      }
    | undefined
  >[];
  downloadPublicAndCommonData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  downloadCommonData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  downloadTemplateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
  }>;
  fetchPublicData: (
    project_: ProjectType,
    shouldPhotoDownload: boolean,
    mode: 'all' | 'others'
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
    unmarkedDekGroups?: UnmarkedDekGroupType[];
    undecryptableGroups?: UndecryptableGroupType[];
  }>;
  fetchPrivateData: (
    project: ProjectType,
    shouldPhotoDownload: boolean,
    mode: 'own' | 'all' | 'others'
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
    unmarkedDekGroups?: UnmarkedDekGroupType[];
    undecryptableGroups?: UndecryptableGroupType[];
  }>;
  fetchTemplateData: (
    project_: ProjectType,
    shouldPhotoDownload: boolean
  ) => Promise<{
    isOK: boolean;
    message: string;
    data: DataType[];
    undecryptableGroups?: UndecryptableGroupType[];
  }>;

  uploadDataToRepository: (
    project_: ProjectType,
    uploadType: 'All' | 'PublicAndPrivate' | 'Common' | 'Template',
    options?: UploadDataOptions
  ) => Promise<{
    isOK: boolean;
    message: string;
    /** データは保存できたが一部の写真をアップロードできなかったときの利用者向け警告 */
    warning?: string;
  }>;
  uploadProjectSettings: (project_: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  deleteCommonAndTemplateData: (project: ProjectType) => Promise<{
    isOK: boolean;
    message: string;
  }>;
  createMergedDataSet: ({
    privateData,
    publicData,
    templateData,
    fetchedScope,
    undecryptableGroups,
  }: {
    privateData: DataType[];
    publicData: DataType[];
    templateData: DataType[];
    fetchedScope?: FetchedScope;
    undecryptableGroups?: UndecryptableGroupType[];
  }) => Promise<{
    isOK: boolean;
    message: string;
    /** 取り込めたが、一部を復号できなかったときの利用者向け警告 */
    warning?: string;
  }>;
  handleSelect: (selected: any) => void;
  handleBulkSelect: (mode: 'self' | 'latest') => void;
};

// キューアイテムの型
export type ConflictQueueItem = {
  id: string;
  candidates: RecordType[];
  resolve: (result: RecordType) => void;
};

// state の型
export type ConflictState = {
  queue: { id: string; candidates: RecordType[]; resolve: (r: RecordType) => void }[];
  bulkMode: null | 'self' | 'latest';
  visible: boolean;
};

/**
 * クラウドの自分データに「ローカルへ反映されていない変更」があるか判定する。
 * （ローカルに無いレコード、またはローカルより updatedAt が新しいレコードがクラウドにあれば true）
 * true の場合、ローカルでそのまま上書きアップロードすると別端末の変更が失われる＝衝突。
 */
const hasCloudOnlyChanges = (cloudRecords: RecordType[], localRecords: RecordType[]): boolean => {
  const localById = new Map(localRecords.map((r) => [r.id, r.updatedAt ?? 0]));
  for (const cr of cloudRecords) {
    const lu = localById.get(cr.id);
    if (lu === undefined) return true; // クラウドにあるがローカルに無い
    if ((cr.updatedAt ?? 0) > lu) return true; // クラウドの方が新しい
  }
  return false;
};

export const useRepository = (): UseRepositoryReturnType & {
  conflictState: any;
  setConflictState: any;
  conflictsResolver: any;
} => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const user = useSelector((state: RootState) => state.user);
  const fullDataSet = useSelector((state: RootState) => state.dataSet);
  const layers = useSelector((state: RootState) => state.layers);
  const mapRegion = useSelector((state: RootState) => state.settings.mapRegion, shallowEqual);
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const mapType = useSelector((state: RootState) => state.settings.mapType, shallowEqual);
  const isSettingProject = useSelector((state: RootState) => state.settings.isSettingProject, shallowEqual);
  //const drawTools = useSelector((state: RootState) => state.settings.drawTools);
  const plugins = useSelector((state: RootState) => state.settings.plugins, shallowEqual);
  const updatedAt = useSelector((state: RootState) => state.settings.updatedAt, shallowEqual);
  const dataSyncBaselines = useSelector((state: RootState) => state.dataSync);

  /**
   * 一括解決（「残りは自分優先／最新優先」）の選び方。自分優先で自分の候補が無いときは最新を採る（先頭を採ると、
   * 誰の版でもない並び順で決まる）。更新日時の無い候補は最も古いとみなす（片方に無いと比較できず先頭が残っていた）
   */
  const chooseByBulkMode = useCallback(
    (mode: 'self' | 'latest', candidates: RecordType[]): RecordType => {
      const latest = candidates.reduce((a, b) => ((b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a));
      if (mode === 'self') return candidates.find((c) => c.userId === user.uid) ?? latest;
      return latest;
    },
    [user.uid]
  );

  const [conflictState, setConflictState] = useState<ConflictState>({
    queue: [],
    bulkMode: null,
    visible: false,
  });

  const conflictsResolver = useCallback(
    (candidates: RecordType[], id: string): Promise<RecordType> =>
      new Promise<RecordType>((resolve) => {
        setConflictState((prev) => {
          // bulkMode が設定済みなら即時解決
          if (prev.bulkMode) {
            resolve(chooseByBulkMode(prev.bulkMode, candidates));
            return prev;
          }
          // まだ bulkMode なし → モーダルキューに積む
          return {
            ...prev,
            queue: [...prev.queue, { id, candidates, resolve }],
            visible: true,
          };
        });
      }),
    [chooseByBulkMode]
  );

  // 競合解決: 選択された候補を resolve してキューから取り除く
  const handleSelect = useCallback(
    (selected: any) => {
      setConflictState((prev: ConflictState) => {
        const [current, ...rest] = prev.queue;
        if (current) {
          current.resolve(selected);
        }
        return {
          ...prev,
          queue: rest,
          visible: rest.length > 0,
        };
      });
    },
    [setConflictState]
  );

  // 一括選択（残りすべて self か latest）
  const handleBulkSelect = useCallback(
    (mode: 'self' | 'latest') => {
      setConflictState((prev) => {
        // 1) いまキューにある全件を一括解決
        prev.queue.forEach(({ candidates, resolve }) => resolve(chooseByBulkMode(mode, candidates)));
        // 2) この取得の残りはこのモードで自動解決（次の取得の前に createMergedDataSet が解除する）
        return { queue: [], bulkMode: mode, visible: false };
      });
    },
    [chooseByBulkMode]
  );

  const createMergedDataSet = useCallback(
    async ({
      privateData,
      publicData,
      templateData,
      fetchedScope,
      undecryptableGroups = [],
    }: {
      privateData: DataType[];
      publicData: DataType[];
      templateData: DataType[];
      fetchedScope?: FetchedScope;
      undecryptableGroups?: UndecryptableGroupType[];
    }) => {
      // 一括解決の指定は、押したときの取得の残りにだけ効かせる。持ち越すと、アプリを再起動するまで以後の取得の
      // 競合がすべて黙って自動で解決され、利用者は競合があったことにも、どちらかの版が捨てられたことにも気づけない
      const resetConflictState = () => setConflictState({ queue: [], bulkMode: null, visible: false });
      resetConflictState();
      try {
        // 取り直した範囲のレイヤ。設定は取得の直前に読み込み直されることがある（開く処理）ので、描画時点の layers ではなく
        // ストアの今の値を使う
        const scopePermissions = new Set<string>(fetchedScope?.permissions ?? []);
        // 他人の PRIVATE の写しを持ちうる人（管理者）が PRIVATE を取得しなかったときは、他人の分を消さない。
        // レイヤを PRIVATE から PUBLIC に変えた直後は、メンバーの記録がまだ PRIVATE の doc のままで PUBLIC の取得に
        // 現れないため、消すと手元の写しだけが消える（クラウドには残っている）
        const scopeLayerIds =
          fetchedScope?.pruneOthers === false
            ? new Set<string>()
            : new Set(
                store
                  .getState()
                  .layers.filter((l) => scopePermissions.has(l.permission))
                  .map((l) => l.id)
              );
        const localTemplateLayerIds = fetchedScope?.template
          ? store
              .getState()
              .dataSet.filter((d) => d.userId === 'template')
              .map((d) => d.layerId)
          : [];
        // 復号できなかったバケットは、クラウドに有るのに読めなかっただけなので、手元の写し（前回読めた版）を消さない。
        // 消すと、鍵の再共有を待つ間その人の記録が画面から消え、消えたのか読めないのか利用者に区別がつかない
        const isUndecryptable = (layerId: string, userId: string | undefined, template: boolean) =>
          undecryptableGroups.some(
            (g) => g.layerId === layerId && (template ? g.permission === 'TEMPLATE' : g.permission !== 'TEMPLATE' && g.userId === userId)
          );

        // すべてのlayerIdを抽出
        const allLayerIds = Array.from(
          new Set([
            ...privateData.map((d) => d.layerId),
            ...publicData.map((d) => d.layerId),
            ...templateData.map((d) => d.layerId),
            ...scopeLayerIds,
            ...localTemplateLayerIds,
          ])
        );

        for (const layerId of allLayerIds) {
          const templateItem = templateData.find((d) => d.layerId === layerId);
          // マージで残ったテンプレート。マージしたときだけ値を持つ（undefined は「すべて利用者の版に置き換わった」）
          let mergedTemplateResult: { merged: boolean; data: DataType | undefined } = { merged: false, data: undefined };
          // マージ結果に現れた利用者。範囲内のレイヤで、ここに無い他人のバケットはクラウドから消えたものとして片付ける
          const mergedUserIds = new Set<string | undefined>();
          const privateItems = privateData.filter((d) => d.layerId === layerId);
          if (privateItems.length > 0) {
            //privateItemsは基本的には一つだが、Admin用だと複数人の可能性がある。

            // プライベートとテンプレートのマージ
            const [mergedPrivate, mergedTemplate] = await mergeLayerData({
              layerData: privateItems,
              templateData: templateItem,
              ownUserId: user.uid,
              strategy: 'manual',
              conflictsResolver,
            });

            if (mergedPrivate.length > 0) {
              dispatch(updateDataAction(mergedPrivate));
            }
            mergedPrivate.forEach((d) => mergedUserIds.add(d.userId));
            mergedTemplateResult = { merged: true, data: mergedTemplate };
          }
          const publicItems = publicData.filter((d) => d.layerId === layerId);
          if (publicItems.length > 0) {
            // 複数人のパブリックとテンプレートのマージ
            const [mergedPublic, mergedTemplate] = await mergeLayerData({
              layerData: publicItems,
              templateData: templateItem,
              ownUserId: user.uid,
              strategy: 'manual',
              conflictsResolver,
            });

            dispatch(updateDataAction(mergedPublic));
            mergedPublic.forEach((d) => mergedUserIds.add(d.userId));

            // 2) マージ結果に自分(user.uid)が含まれなければ、空配列をセットしてローカルデータをクリア
            const hasSelf = mergedPublic.some((dt) => dt.userId === user.uid);
            if (!hasSelf) {
              dispatch(
                updateDataAction([
                  {
                    layerId,
                    userId: user.uid,
                    data: [], // 空にすることで既存の自分データを消去
                  },
                ])
              );
            }
            mergedTemplateResult = { merged: true, data: mergedTemplate };
          }

          // 取り直した範囲のレイヤで、マージ結果に無い他人のバケット（管理者が消した・その人のデータが無くなった）を消す。
          // 残すと、クラウドから消えた記録がいつまでも表示される。自分・未ログイン時のバケット・テンプレートは対象外
          if (scopeLayerIds.has(layerId)) {
            const staleBuckets = store
              .getState()
              .dataSet.filter(
                (d) =>
                  d.layerId === layerId &&
                  d.userId !== undefined &&
                  d.userId !== user.uid &&
                  d.userId !== 'template' &&
                  !mergedUserIds.has(d.userId) &&
                  !isUndecryptable(layerId, d.userId, false)
              );
            if (staleBuckets.length > 0) dispatch(deleteDataAction(staleBuckets));
          }

          if (templateItem) {
            if (mergedTemplateResult.merged) {
              // テンプレートの記録がすべて利用者の版に置き換わると undefined になる。そのとき何も送らないと、手元の古い
              // テンプレートが残り、同じ記録が利用者の版と二重に表示される。空のテンプレートで置き換える
              dispatch(updateDataAction([mergedTemplateResult.data ?? { layerId, userId: 'template', data: [] }]));
            } else {
              // private/publicがなくtemplateのみの場合
              dispatch(updateDataAction([templateItem]));
            }
          } else if (fetchedScope?.template && !isUndecryptable(layerId, undefined, true)) {
            // テンプレートを取得したのにこのレイヤの分が無い＝クラウドで消された。手元の古いテンプレートも消す
            // （復号できなかっただけのときは、上の判定で残す）
            const localTemplate = store
              .getState()
              .dataSet.find((d) => d.layerId === layerId && d.userId === 'template');
            if (localTemplate !== undefined && localTemplate.data.length > 0) {
              dispatch(updateDataAction([{ layerId, userId: 'template', data: [] }]));
            }
          }
        }
        if (undecryptableGroups.length > 0) {
          return {
            isOK: true,
            message: '',
            warning: t('hooks.message.someDataUndecryptable', { count: undecryptableGroups.length }),
          };
        }
        return { isOK: true, message: '' };
      } finally {
        resetConflictState();
      }
    },
    [dispatch, store, user.uid, conflictsResolver]
  );

  const fetchProjectSettings = useCallback(async (project: ProjectType) => {
    const { isOK, message, data: projectSettings } = await projectStore.downloadProjectSettings(project.id);
    if (!isOK || projectSettings === undefined) {
      return { isOK: false, message, data: undefined };
    }
    let trackLayer = projectSettings.layers.find((l) => l.id === 'track');
    if (!trackLayer) {
      // Trackレイヤーがなければ初期状態から作成。旧プロジェクトの互換性のため。
      trackLayer = layersInitialState.find((l) => l.id === 'track');
      if (trackLayer) {
        projectSettings.layers.push(trackLayer);
      }
    }
    return { isOK: true, message: '', data: projectSettings };
  }, []);

  const fetchAllData = useCallback(async (project: ProjectType) => {
    const { isOK, message, data } = await projectStore.downloadAllData(project.id);
    if (!isOK || data === undefined) {
      return { isOK: false, message, data: undefined };
    }
    return { isOK: true, message, data: data };
  }, []);

  const fetchAllPhotos = useCallback((layer: LayerType, records: RecordType[]) => {
    const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
    const imagePromises = records
      .map((record) => {
        return photoFields
          .map((photoField) => {
            return (record.field[photoField.name] as PhotoType[]).map(async ({ url, key, name }) => {
              if (url !== null && key !== null) {
                const { data } = await projectStorage.fetchPhoto(url, key);
                if (data === undefined) return undefined;
                return { data: data, name: name };
              }
            });
          })
          .flat();
      })
      .flat();
    return imagePromises;
  }, []);

  const updateStoragePhoto = useCallback(
    async (
      data: RecordType,
      project: ProjectType,
      layerId: string,
      photoField: LayerType['field'],
      onPhotoUploadFailed?: () => void,
      // Storage から消す写真の id はここに積むだけで、まだ消さない（消すのはマージ後のデータで要らないと分かり、
      // データの書き込みに成功してから。先に消すと、マージで採られた版が参照する写真まで消える）
      pendingPhotoDeletes?: Set<string>
    ) => {
      if (user.uid === undefined) return data;
      const uid = user.uid;
      const newData = cloneDeep(data);

      for (const { name } of photoField) {
        const photos = (data.field[name] as PhotoType[]).map(async (photo) => {
          if (data.deleted) {
            //データごと削除された写真をストレージから削除（書き込みの成功後）
            pendingPhotoDeletes?.add(photo.id);
          } else if (photo.uri !== null && photo.uri !== undefined && photo.url === null) {
            //アップロード
            const { isOK, url, key } = await projectStorage.uploadPhoto(project.id, layerId, uid, photo.id, photo.uri);
            if (!isOK || url === null || key === null) {
              // 失敗した写真は未アップロード（url:null）のまま残し、次回のアップロードで再試行させる。
              // Webはuriを消すと原画が失われるので、元の値をそのまま返す
              onPhotoUploadFailed?.();
              return photo;
            }
            if (Platform.OS === 'web') {
              //Webはuriに直接写真データが入ってしまい重いのでアップロードしたら消す。
              return { ...photo, url, key, uri: null };
            } else {
              //モバイルはアップロードしても自分のは見たいので消さない。
              return { ...photo, url, key };
            }
          } else if (photo.uri === undefined && photo.url !== null) {
            //写真削除したものは、クラウド削除して（書き込みの成功後）、photoのフィールドの値も消す(undefinedで返す)
            pendingPhotoDeletes?.add(photo.id);
            return undefined;
          } else {
            //すでにアップロードしてある場合はなにもしない
            return photo;
          }
        });

        newData.field[name] = (await Promise.all(photos)).filter((v): v is PhotoType => v !== undefined);
      }
      return newData;
    },
    [user]
  );

  const deleteCommonAndTemplateData = useCallback(
    async (project: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }

      // COMMON のデータはここでは消さない。以前は layerId だけの条件で全員分を先に消していたため、
      // PUBLIC/PRIVATE から COMMON へ変えるとメンバー全員の記録が消え、途中で失敗すると共通データが消えたままになった。
      // COMMON は Common のアップロード（commonAbsorption）で、全員分をまとめて書けたあとに他人名義の doc を片付ける
      const templateLayers = getTargetLayers(layers, 'Template');
      for (const layer of templateLayers) {
        //テンプレートレイヤを一旦すべて削除。データは残す。
        //ToDo: ただし構造が大きく変わる場合は、データも消さないとエラーになる可能性がある。
        await projectStore.deleteData(project.id, layer.id, 'TEMPLATE');
      }
      return { isOK: true, message: '' };
    },
    [layers, user]
  );

  const mergeTemplateRecords = useCallback(
    (layerId: string): RecordType[] => {
      const candidates = fullDataSet.filter(
        (d) => d.layerId === layerId && (d.userId === 'template' || d.userId === undefined || d.userId === user.uid)
      );
      if (candidates.length === 0) return [];

      // テンプレート編集は自分の UID で編集内容を持つが、Firestore へは userId:'template' の単一データとしてアップロードしたい。
      // getTargetRecordSet を共通ロジックのままにしつつテンプレート時のみマージするため、
      // 既存テンプレート → 未設定 → 自分の順に上書きして一つのレコード集合に統合する。
      const priority = (data: DataType) => {
        if (data.userId === user.uid) return 2;
        if (data.userId === undefined) return 1;
        return 0;
      };

      const merged = new Map<string, RecordType>();
      [...candidates]
        .sort((a, b) => priority(a) - priority(b))
        .forEach((data) => {
          data.data.forEach((record) => {
            merged.set(record.id, cloneDeep(record));
          });
        });

      return Array.from(merged.values()).map((record) => ({
        ...record,
        userId: 'template',
        displayName: t('common.admin'),
        uploaded: true,
      }));
    },
    [fullDataSet, user.uid]
  );

  const uploadDataToRepository = useCallback(
    async (
      project: ProjectType,
      uploadType: 'All' | 'PublicAndPrivate' | 'Common' | 'Template',
      options: UploadDataOptions = {}
    ) => {
      const extraCommonDataSet = options.commonAbsorption?.extraCommonDataSet ?? [];
      const consolidatedLayerIds = new Set(Object.keys(options.commonAbsorption?.representedUserIds ?? {}));
      //ToDo バッチアップロード?
      //firestore上の対象レイヤの自分のデータを一旦すべて削除

      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      // Web版の離脱確認（L14）の基準時刻。送る集合はこれより前の手元の記録なので、これより後の編集は未アップロードとして残す
      const uploadStartedAt = Date.now();
      // 開いた時点の設定がクラウドの現在の設定と同じかを確認する。
      // 旧 toDate() の不具合で書かれた updatedAt も同一とみなすため、判定は firestore 側に寄せてある。
      const isSettingsCurrent =
        uploadType === 'PublicAndPrivate' ? await projectStore.isSettingsUpdatedAtCurrent(project.id, updatedAt) : true;
      if (uploadType === 'PublicAndPrivate' && !isSettingsCurrent) {
        const confirmMessage = t('hooks.message.cannotUploadData');
        const shouldContinue = await ConfirmAsync(confirmMessage);
        if (!shouldContinue) {
          return { isOK: false, message: '' };
        }
      }

      const targetLayers = getTargetLayers(layers, uploadType);

      // --- 同一アカウント・複数端末での上書き消失防止（衝突検知→確認→対処） ---
      // アップロードは (userId, layerId, permission) 単位の「全削除→全置換」のため、別端末で更新された
      // 自分のデータを後勝ちで消してしまう。これを防ぐ。手順:
      //  1) getMyDataUpdatedAt でクラウドの自分データの最終更新(encryptedAt)を軽量取得し、基準値(前回アップ時)と比較。
      //     基準値==クラウド なら確実に衝突なし → 取得もマージもせず従来どおりアップロード（高速パス）。
      //  2) 基準値≠クラウド（基準値が無いがクラウドにデータがある場合＝2台目の初回アップロード等を含む）は
      //     「候補」とし、クラウドの自分データを取得して内容比較。ローカルに無い/ローカルより新しいレコードが
      //     クラウドにあれば衝突（そのまま上書きすると別端末の変更が失われる）。
      //  3) 衝突があれば 3択（マージ/上書き/キャンセル）で対処。
      // 対象は各端末で編集される PRIVATE / PUBLIC（Templateアップロードを除く）。COMMON/TEMPLATEは管理者専用。
      const isConflictTarget = (l: LayerType) =>
        uploadType !== 'Template' && (l.permission === 'PRIVATE' || l.permission === 'PUBLIC');
      const conflictTargetLayers = targetLayers.filter(isConflictTarget);

      const baselines = dataSyncBaselines[project.id] ?? {};
      const candidateLayers: LayerType[] = [];
      // 判定に使ったクラウドの版（encryptedAt。undefined はクラウドにデータが無い）。書く直前に変わっていないかを
      // uploadDataHelper で照合する。判定から書き込みまでの間に同じアカウントの別端末が同じレイヤを書いていたら、
      // その変更を確認なしに上書きしないため
      const judgedCloudVersions = new Map<string, number | undefined>();
      // 衝突を確かめる取得に失敗したときは「衝突なし」ではなく「判定できない」なので、上書きせずに中止する。
      // 素通りさせると、別端末の変更や、開く途中の失敗・復号失敗で手元に無いだけのクラウドのデータを全置換で消す
      const cannotVerify = { isOK: false, message: t('hooks.message.cannotVerifyCloudData') };
      if (conflictTargetLayers.length > 0) {
        const cloudRes = await projectStore.getMyDataUpdatedAt(project.id, user.uid);
        if (!cloudRes.isOK || cloudRes.data === undefined) return cannotVerify;
        for (const l of conflictTargetLayers) {
          const baseline = baselines[dataSyncKey(l.id, l.permission)];
          const cloudVer = cloudRes.data.get(dataSyncKey(l.id, l.permission));
          judgedCloudVersions.set(dataSyncKey(l.id, l.permission), cloudVer);
          // 基準値==クラウド → 衝突なし。それ以外でクラウドにデータがあれば内容比較の候補にする。
          if (baseline === cloudVer) continue;
          if (cloudVer !== undefined) candidateLayers.push(l);
        }
      }

      // 候補があればクラウドの自分データを取得（マージにも再利用）し、内容比較で本当の衝突を判定する
      let cloudOwnDataSet: DataType[] = [];
      const conflictedKeys = new Set<string>();
      // クラウドに自分のデータがあるのに読めない（復号できない）レイヤ。上書きすると読めないだけのデータを消すので
      // そのレイヤだけ送らずに残し、他のレイヤは送る（全体を止めると、問題のないレイヤの記録まで上げられなくなる）
      const unreadableLayers: LayerType[] = [];
      if (candidateLayers.length > 0) {
        if (candidateLayers.some((l) => l.permission === 'PRIVATE')) {
          const res = await projectStore.downloadPrivateData(project.id, { userId: user.uid });
          if (!res.isOK || !res.data) return cannotVerify;
          cloudOwnDataSet = cloudOwnDataSet.concat(res.data);
        }
        if (candidateLayers.some((l) => l.permission === 'PUBLIC')) {
          // PUBLICは自分限定取得APIが無いため全件取得し、自分のuserId分のみ抽出する。
          const res = await projectStore.downloadPublicData(project.id);
          if (!res.isOK || !res.data) return cannotVerify;
          cloudOwnDataSet = cloudOwnDataSet.concat(res.data.filter((d) => d.userId === user.uid));
        }
        for (const l of candidateLayers) {
          const cloudOwn = cloudOwnDataSet.find((d) => d.layerId === l.id && d.userId === user.uid);
          // クラウドに自分のデータがある（getMyDataUpdatedAt が更新時刻を返した）のに読めない＝復号できなかった。
          // 空とみなして比べると、読めないだけのデータを上書きで消してしまう
          if (cloudOwn === undefined) {
            unreadableLayers.push(l);
            continue;
          }
          const localOwn = getTargetRecordSet(fullDataSet, l, user);
          if (hasCloudOnlyChanges(cloudOwn?.data ?? [], localOwn)) {
            conflictedKeys.add(dataSyncKey(l.id, l.permission));
          }
        }
      }

      // 衝突があればユーザーに対処（マージ / 上書き / キャンセル）を確認
      let conflictChoice: 'merge' | 'overwrite' | 'none' = 'none';
      if (conflictedKeys.size > 0) {
        const choice = await DataConflictConfirmAsync();
        if (choice === 'cancel') {
          return { isOK: false, message: '' };
        }
        conflictChoice = choice;
      }

      const newBaselineEntries: { [key: string]: number | undefined } = {};
      // 書き込めたレイヤの基準値を保存する。途中のレイヤで失敗して中止するときも、先に書き込めたレイヤの分は保存する。
      // 保存しないと、クラウドは新しい版なのに基準値は古いままになり、次のアップロードで自分の書いた版との衝突として
      // 確認が出る（別端末の変更が無いのに利用者を迷わせる）
      const saveBaselines = () => {
        if (Object.keys(newBaselineEntries).length > 0) {
          dispatch(setDataSyncTimestampsAction({ projectId: project.id, entries: newBaselineEntries }));
        }
      };
      let failedPhotoCount = 0;
      const countFailedPhoto = () => {
        failedPhotoCount += 1;
      };

      const unreadableIds = new Set(unreadableLayers.map((l) => l.id));
      for (const layer of targetLayers) {
        if (unreadableIds.has(layer.id) && isConflictTarget(layer)) continue;
        const photoFields = layer.field.filter((f) => f.format === 'PHOTO');
        const isTemplate = uploadType === 'Template';
        const targetRecordSet = isTemplate
          ? mergeTemplateRecords(layer.id)
          : getTargetRecordSet(
              layer.permission === 'COMMON' && consolidatedLayerIds.has(layer.id)
                ? [...fullDataSet, ...extraCommonDataSet]
                : fullDataSet,
              layer,
              user
            );

        //写真の更新
        const pendingPhotoDeletes = new Set<string>();
        const updatedData = await Promise.all(
          targetRecordSet.map((d: RecordType) => {
            return updateStoragePhoto(d, project, layer.id, photoFields, countFailedPhoto, pendingPhotoDeletes);
          })
        );

        const key = dataSyncKey(layer.id, layer.permission);

        // 衝突レイヤを「マージ」する場合のみ、クラウドの自分のデータと updatedAt 最新優先でマージ
        // （両方の変更を保持。削除トムストーンも updatedAt で勝敗判定）。
        let dataToUpload = updatedData;
        if (conflictChoice === 'merge' && conflictedKeys.has(key)) {
          const cloudOwn = cloudOwnDataSet.find((d) => d.layerId === layer.id && d.userId === user.uid);
          if (cloudOwn) {
            const localOwn: DataType = { layerId: layer.id, userId: user.uid, data: updatedData };
            // 更新日時が同じときは、先に渡した方が採られる。旧版で作図した記録のように時刻が進んでいない
            // 手元の編集がクラウドの版に負けないよう、手元を先に渡す
            const [mergedUserData] = await mergeLayerData({
              layerData: [localOwn, cloudOwn],
              templateData: undefined,
              ownUserId: user.uid,
              strategy: 'latest',
            });
            const mergedOwn = mergedUserData.find((d) => d.userId === user.uid);
            if (mergedOwn) dataToUpload = mergedOwn.data;
          }
        }

        const { isOK, message, encryptedAt, staleExpectation } = await projectStore.uploadDataHelper(
          project.id,
          {
            layerId: layer.id,
            userId: user.uid,
            permission: uploadType === 'Template' ? 'TEMPLATE' : layer.permission,
            data: dataToUpload,
          },
          isConflictTarget(layer) && judgedCloudVersions.has(key)
            ? { expected: { encryptedAt: judgedCloudVersions.get(key) } }
            : {}
        );
        if (staleExpectation === true) {
          // 判定のあとに別の端末が同じレイヤを書いた。そのまま書くと確認なしに上書きするので中止し、やり直してもらう
          // （やり直すと、その版との衝突として改めて判定される）
          saveBaselines();
          return { isOK: false, message: `${t('hooks.message.cloudDataChangedByOtherDevice')} (${layer.name})` };
        }
        if (!isOK) {
          //ToDo 処理続けるかどうか？
          const guidance =
            layer.id === 'track' && message === t('hooks.message.dataSizeTooLarge')
              ? `\n${t('hooks.message.deleteOldTracks')}`
              : '';
          saveBaselines();
          return { isOK: false, message: `${message} (${layer.name})${guidance}` };
        }

        // 書き込めたので、要らなくなった写真を Storage から消す。マージで採られた版がまだ参照している写真は消さない
        if (pendingPhotoDeletes.size > 0) {
          const referenced = new Set(
            dataToUpload
              .filter((record) => record.deleted !== true)
              .flatMap((record) => photoFields.flatMap(({ name }) => (record.field[name] as PhotoType[] | undefined) ?? []))
              .map((photo) => photo.id)
          );
          await Promise.all(
            Array.from(pendingPhotoDeletes)
              .filter((photoId) => !referenced.has(photoId))
              .map((photoId) => projectStorage.deleteStoragePhoto(project.id, layer.id, user.uid, photoId))
          );
        }

        if (layer.permission === 'COMMON' && consolidatedLayerIds.has(layer.id) && !isTemplate) {
          // 自分の名義の doc に全員分をまとめて書けたので、クラウドに残る他人名義の doc（内容を持っている人の分）と
          // COMMON では使わないテンプレートを片付ける。残すと同じ記録が2人の名義に並び、取得のたびに競合になる。
          // 書き込みに失敗したときはここに来ないので、元の doc は残る（先に消す方式だと失敗で消えたままになる）。
          // 手元は先に自分の名義の1つにそろえる（片付けが失敗して保存し直したとき、取り込み済みの記録を手元にあるものとして
          // 扱い、二重に取り込まないため。他のバケットを残すと同じ記録が二重に表示される）
          const otherBuckets = fullDataSet.filter((d) => d.layerId === layer.id && d.userId !== user.uid);
          if (otherBuckets.length > 0) dispatch(deleteDataAction(otherBuckets));
          dispatch(updateDataAction([{ layerId: layer.id, userId: user.uid, data: dataToUpload }]));
          const representedUserIds = options.commonAbsorption?.representedUserIds[layer.id] ?? [];
          const cleanup = await projectStore.deleteOtherUsersData(
            project.id,
            layer.id,
            'COMMON',
            user.uid,
            representedUserIds
          );
          if (!cleanup.isOK) {
            saveBaselines();
            return { isOK: false, message: `${cleanup.message} (${layer.name})` };
          }
          const templateCleanup = await projectStore.deleteData(project.id, layer.id, 'TEMPLATE');
          if (!templateCleanup.isOK) {
            saveBaselines();
            return { isOK: false, message: `${templateCleanup.message} (${layer.name})` };
          }
        }

        // このレイヤはアップロード済み。Web版で、これより後に変えた自分の記録だけを離脱確認の対象にする（ネイティブでは何もしない）
        markLayerUploaded(project.id, layer.id, uploadStartedAt);

        // PRIVATE/PUBLIC は基準値を更新（次回以降の衝突検知に使用。空アップロード時は undefined＝未確立）
        if (isConflictTarget(layer)) {
          newBaselineEntries[key] = encryptedAt;
        }

        if (!isSettingProject) {
          dispatch(
            updateRecordsAction({
              layerId: layer.id,
              userId: user.uid,
              data: dataToUpload,
            })
          );
        }
      }

      // 基準値をまとめて保存
      saveBaselines();

      const warnings = [
        ...(unreadableLayers.length > 0
          ? [t('hooks.message.skippedUnreadableLayers', { names: unreadableLayers.map((l) => l.name).join('、') })]
          : []),
        ...(failedPhotoCount > 0 ? [t('hooks.message.failUploadSomePhotos', { count: failedPhotoCount })] : []),
      ];
      if (warnings.length > 0) {
        return { isOK: true, message: '', warning: warnings.join('\n') };
      }
      return { isOK: true, message: '' };
    },
    [
      dataSyncBaselines,
      dispatch,
      fullDataSet,
      isSettingProject,
      layers,
      mergeTemplateRecords,
      updateStoragePhoto,
      updatedAt,
      user,
    ]
  );

  const uploadTileMaps = useCallback(
    async (projectId: string) => {
      const uploadedTileMaps: TileMapType[] = [];
      for (const tileMap of tileMaps) {
        if (tileMap.url.startsWith('file://') && tileMap.url.endsWith('.pdf')) {
          const { isOK, message, url, key } = await projectStorage.uploadPDF(projectId, tileMap.id);
          if (!isOK || url === null) {
            await AlertAsync(message);
            uploadedTileMaps.push(tileMap);
          } else {
            uploadedTileMaps.push({ ...tileMap, url, encryptKey: key });
          }
        } else if (Platform.OS === 'web' && tileMap.styleURL?.startsWith('style://')) {
          const { isOK, message, url, key } = await projectStorage.uploadStyle(projectId, tileMap.id);
          if (!isOK || url === null) {
            await AlertAsync(message);
            uploadedTileMaps.push(tileMap);
          } else {
            uploadedTileMaps.push({ ...tileMap, styleURL: url, encryptKey: key });
          }
        } else if (tileMap.url.includes('blob:')) {
          //ローカルのPMTilesはアップロードしない
        } else {
          uploadedTileMaps.push(tileMap);
        }
      }

      return uploadedTileMaps;
    },
    [tileMaps]
  );

  const uploadDictionary = useCallback(
    async (projectId: string, cloudLayers: LayerType[]) => {
      //Dictionary
      const uploadedLayers: LayerType[] = [];
      // 新しい版を書けたレイヤ。設定の書き込みに成功してから、旧形式のパスへの写しと古い版の削除を行う
      const uploads: DictionaryUpload[] = [];
      for (const layer of layers) {
        const hasDictionaryFieald = layer.field.some((field) => field.format === 'STRING_DICTIONARY');
        if (!hasDictionaryFieald) {
          uploadedLayers.push(layer);
          continue;
        }
        const cloudLayer = cloudLayers.find((l) => l.id === layer.id);
        // 上げられないときは、クラウドにある今の辞書ファイルを指したままにする（手元の値より、いま保存されている
        // 設定の値の方が実在するファイルと合っている）。鍵や版を落とすと、メンバーの辞書候補が空になる
        const keepExisting = (): LayerType =>
          cloudLayer === undefined
            ? layer
            : { ...layer, dictionaryKey: cloudLayer.dictionaryKey, dictionaryVersion: cloudLayer.dictionaryVersion };
        // 手元に辞書表が無い（辞書を取得できなかった端末など）ときは上げない。書き出すと空の辞書を上げてしまう
        let hasLocalTables = false;
        try {
          hasLocalTables = await hasDictionaryTables(layer.id);
        } catch (e) {
          console.warn('hasDictionaryTables Error:', e);
        }
        if (!hasLocalTables) {
          uploadedLayers.push(keepExisting());
          continue;
        }
        let dictionaryData: string | undefined;
        try {
          dictionaryData = await exportDatabase(layer.id);
        } catch (e) {
          console.warn('exportDatabase Error:', e);
        }
        if (dictionaryData === undefined) {
          await AlertAsync(t('hooks.message.failUploadDictionary'));
          uploadedLayers.push(keepExisting());
          continue;
        }
        const version = ulid();
        const { isOK, message, key, encdata } = await projectStorage.uploadDictionary(
          projectId,
          layer.id,
          dictionaryData,
          version
        );
        if (!isOK || key === undefined || encdata === undefined) {
          await AlertAsync(message);
          uploadedLayers.push(keepExisting());
          continue;
        }
        uploadedLayers.push({ ...layer, dictionaryKey: key, dictionaryVersion: version });
        uploads.push({ layerId: layer.id, version, encdata, previousVersion: cloudLayer?.dictionaryVersion });
      }
      return { layers: uploadedLayers, uploads };
    },
    [layers]
  );

  /**
   * 設定の書き込みに成功したあとの辞書ファイルの片付け。失敗しても設定はすでに新しい版を指しているので、
   * 利用者には知らせずに続ける（古い版が残るか、更新前のアプリのメンバーが新しい辞書を読めないだけ）
   */
  const finalizeDictionaryUploads = useCallback(async (projectId: string, uploads: DictionaryUpload[]) => {
    for (const upload of uploads) {
      await projectStorage.uploadDictionaryLegacyCopy(projectId, upload.layerId, upload.encdata);
      if (upload.previousVersion !== undefined && upload.previousVersion !== upload.version) {
        await projectStorage.deleteDictionaryFile(projectId, upload.layerId, upload.previousVersion);
      }
    }
  }, []);

  /**
   * 設定から消えたレイヤのクラウドのデータ（全員の doc・写真・辞書）を片付ける。クラウドデータ管理のレイヤ削除と同じ。
   * 片付けに失敗しても設定はすでに保存できているので中止はしない（残りはクラウドデータ管理から消せる）
   */
  const deleteRemovedLayersData = useCallback(async (projectId: string, removedLayers: LayerType[]) => {
    for (const removed of removedLayers) {
      const dataResult = await projectStore.deleteData(projectId, removed.id);
      if (!dataResult.isOK) console.warn('deleteRemovedLayersData: data', removed.id, dataResult.message);
      const photoResult = await projectStorage.deleteLayerPhotos(projectId, removed.id);
      if (!photoResult.isOK) console.warn('deleteRemovedLayersData: photo', removed.id, photoResult.message);
      await projectStorage.deleteLayerDictionaries(projectId, removed.id);
    }
  }, []);

  const uploadProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      // 旧レイヤ設定を取得してpermissionの変更を検知
      const oldSettingsRes = await projectStore.downloadProjectSettings(project_.id);
      const oldLayers = oldSettingsRes.isOK && oldSettingsRes.data ? oldSettingsRes.data.layers : [];
      // 消えたレイヤのデータを片付けてよいのは、取得した旧設定が、この端末が開いた（または前回保存した）設定そのもの
      // のときだけ。開いた後に別の管理者が足したレイヤも「旧設定にあって新設定に無い」になるので、そのまま消すと
      // 利用者が削除していないレイヤのデータを消してしまう。確かめられないときも消さない
      let isOldSettingsOwn = false;
      if (oldSettingsRes.isOK) {
        try {
          isOldSettingsOwn = await projectStore.isSettingsUpdatedAtCurrent(project_.id, updatedAt);
        } catch (e) {
          isOldSettingsOwn = false;
        }
      }
      // 変更後のレイヤ設定をアップロード前に作成
      const excludeItems = tileMaps.map((tileMap) => tileMap.id);
      await projectStorage.deleteProjectPDF(project_.id, excludeItems);
      await projectStorage.deleteProjectStyle(project_.id, excludeItems);
      const updatedTileMaps = await uploadTileMaps(project_.id);
      const { layers: updatedLayers, uploads: dictionaryUploads } = await uploadDictionary(project_.id, oldLayers);
      // permission変更があればサーバーデータも一括更新
      for (const newLayer of updatedLayers) {
        const oldLayer = oldLayers.find((l) => l.id === newLayer.id);
        if (oldLayer && oldLayer.permission !== newLayer.permission) {
          const permissionResult = await projectStore.updateLayerDataPermission(
            project_.id,
            newLayer.id,
            oldLayer.permission,
            newLayer.permission
          );
          // 付け替えに失敗したまま続けると、COMMON の保存でメンバーの記録を取り込めない
          if (!permissionResult.isOK) return { isOK: false, message: `${permissionResult.message} (${newLayer.name})` };
        }
      }
      const { isOK, message, timestamp } = await projectStore.uploadProjectSettings(project_.id, user.uid, {
        layers: updatedLayers,
        tileMaps: updatedTileMaps,
        mapType,
        mapRegion,
        plugins,
        updatedAt,
      });
      if (!isOK) {
        // 新しく書いた辞書の版は消さない。書き込みが実は届いていた（応答だけ失われた）場合に、設定が指すファイルを
        // 消すことになるため。古い版はそのまま残っているので、メンバーは今までの辞書を読める
        return { isOK: false, message };
      }
      dispatch(editSettingsAction({ updatedAt: timestamp?.toISOString() }));
      if (timestamp !== undefined) {
        // プロジェクト一覧の「更新日時」を再取得なしで反映する
        dispatch(updateProjectAction({ ...project_, settingsEncryptedAt: timestamp }));
      }
      await finalizeDictionaryUploads(project_.id, dictionaryUploads);
      if (isOldSettingsOwn) {
        // 旧設定にあって新設定に無いレイヤ＝この端末で削除したレイヤ。グループは入れ物でデータを持たない。
        // 軌跡（track）は開くときに初期状態から補われる特別なレイヤで、設定に無くても記録が使われるので消さない
        const removedLayers = oldLayers.filter(
          (l) => l.type !== 'LAYERGROUP' && l.id !== 'track' && !updatedLayers.some((n) => n.id === l.id)
        );
        await deleteRemovedLayersData(project_.id, removedLayers);
      }
      return { isOK: true, message: '' };
    },
    [
      deleteRemovedLayersData,
      dispatch,
      finalizeDictionaryUploads,
      mapRegion,
      mapType,
      plugins,
      tileMaps,
      updatedAt,
      uploadDictionary,
      uploadTileMaps,
      user,
    ]
  );

  const uploadDefaultProjectSettings = useCallback(
    async (project_: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message } = await projectStore.uploadProjectSettings(project_.id, user.uid, {
        layers: layersInitialState,
        tileMaps: tileMapsInitialState,
        mapType: 'none',
        mapRegion: {
          latitude: 35,
          longitude: 135,
          latitudeDelta: 0.00922,
          longitudeDelta: 0.00922,
          zoom: 15,
        },
        plugins: {},
        updatedAt,
      });
      if (!isOK) {
        return { isOK: false, message };
      }
      return { isOK: true, message: '' };
    },
    [updatedAt, user]
  );

  const createProject = useCallback(
    async (project: ProjectType) => {
      const { isOK, message } = await projectStore.addProject(project);
      if (!isOK) return { isOK: false, message };
      dispatch(addProjectAction(project));
      const result = await uploadDefaultProjectSettings(project);
      return { isOK: result.isOK, message: result.message };
    },
    [dispatch, uploadDefaultProjectSettings]
  );

  const updateProject = useCallback(
    async (project: ProjectType) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin') };
      }
      const { isOK, message } = await projectStore.updateProject(project);
      if (!isOK) {
        return { isOK, message };
      }
      dispatch(updateProjectAction(project));
      return { isOK: true, message: '' };
    },
    [dispatch, user]
  );

  const deleteProject = useCallback(
    async (project_: ProjectType) => {
      const { isOK: photoOK, message: photoMessage } = await projectStorage.deleteProjectStorageData(project_.id);
      if (!photoOK) {
        return { isOK: false, message: photoMessage };
      }
      const { isOK: projectOK, message: projectMessage } = await projectStore.deleteProject(project_.id);
      if (!projectOK) {
        return { isOK: false, message: projectMessage };
      }
      dispatch(deleteProjectAction(project_));
      return { isOK: true, message: '' };
    },
    [dispatch]
  );

  const downloadDictionaries = useCallback(async (projectId: string, layers_: LayerType[]) => {
    // 取得できなかったレイヤ。黙って続けると、入力候補が空のまま利用者が気づけない
    const failedLayerNames: string[] = [];
    for (const layer of layers_) {
      if (layer.dictionaryKey === undefined) continue;
      const { isOK, data } = await projectStorage.downloadDictionary(
        projectId,
        layer.id,
        layer.dictionaryKey,
        layer.dictionaryVersion
      );
      if (!isOK || data === undefined) {
        failedLayerNames.push(layer.name);
        continue;
      }
      try {
        await importDictionary(data);
      } catch (e) {
        console.warn('importDictionary Error:', e);
        failedLayerNames.push(layer.name);
      }
    }
    if (failedLayerNames.length > 0) {
      await AlertAsync(t('hooks.message.failDownloadDictionaries', { names: failedLayerNames.join(', ') }));
    }
  }, []);

  const downloadStyle = useCallback(async (projectId: string, tileMaps_: TileMapType[]) => {
    for (const tileMap of tileMaps_) {
      if (tileMap.styleURL === undefined || tileMap.encryptKey === undefined) continue;
      const url = tileMap.styleURL.startsWith('style://') ? tileMap.styleURL.replace('style://', '') : tileMap.styleURL;
      const { isOK, styleJson } = await projectStorage.downloadStyle(url, tileMap.encryptKey);
      if (!isOK || !styleJson) {
        //メッセージは出ないようにする
        //await AlertAsync(message);
        continue;
      }
      try {
        // console.log('importStyleFile', uri, name, id);
        if (Platform.OS === 'web') {
          db.pmtiles.put({ mapId: tileMap.id, blob: undefined, boundary: '', style: styleJson });
        } else {
          const styleUri = `${TILE_FOLDER}/${tileMap.id}/style.json`;
          await FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/${tileMap.id}`, { intermediates: true });
          await FileSystem.copyAsync({ from: styleJson, to: styleUri });
        }

        return { isOK: true, message: '' };
      } catch (e: any) {
        console.log(e);
        return { isOK: false, message: e.message + '\n' + t('hooks.message.failReceiveFile') };
      }
    }
  }, []);

  const downloadProjectSettings = useCallback(
    async (project: ProjectType) => {
      //プロジェクトを開く際の上書きで記録中データが失われないよう、破棄直前に自動バックアップ
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
        'projectOpen'
      );
      //データを最初に削除
      dispatch(setDataSetAction([]));
      const { isOK, message, data: projectSettings } = await projectStore.downloadProjectSettings(project.id);
      if (!isOK || projectSettings === undefined) {
        return { isOK: false, message, region: undefined };
      }
      //console.log(Object.keys(settings));
      const { layers: layersFromSettings, tileMaps: rawTileMapsFromSettings, ...settings } = projectSettings;
      //地図IDは保存先フォルダ名（TILE_FOLDER/{id}）になる。管理者が書き込める設定から来るため、
      //フォルダの外を指すIDの地図はスタイル保存・地図一覧への反映より前に取り除く
      const tileMapsFromSettings = dropUnsafeTileMaps(rawTileMapsFromSettings);
      await downloadDictionaries(project.id, layersFromSettings);
      await downloadStyle(project.id, tileMapsFromSettings);
      //COMMONのactivateをfalseにする。
      const updatedLayers = layersFromSettings.map((l) => {
        if (l.permission === 'COMMON') {
          return { ...l, activate: false };
        } else {
          return l;
        }
      });
      const projectRegion = cloneDeep(settings.mapRegion);
      const mergedLayers = [...updatedLayers];
      const trackLayer = mergedLayers.find((l) => l.id === 'track');
      if (!trackLayer) {
        // Trackレイヤーがなければ初期状態から作成。旧プロジェクトの互換性のため。
        const initialTrackLayer = layersInitialState.find((l) => l.id === 'track');
        if (initialTrackLayer) mergedLayers.push(initialTrackLayer);
      }
      // 可視領域レイヤはここでは補完しない。可視領域データを受信したときに
      // createMergedDataSetがオンデマンドで補完する（お試し利用で構成を汚さないため）
      dispatch(setLayersAction(mergedLayers));
      dispatch(setTileMapsAction(tileMapsFromSettings));
      dispatch(editSettingsAction({ ...settings, projectRegion }));
      return { isOK: true, message: '', region: projectRegion };
    },
    [dispatch, downloadDictionaries, downloadStyle, store]
  );

  const downloadPhoto = useCallback(
    async (data: RecordType, project_: ProjectType, layerId: string, photoFields: LayerType['field']) => {
      if (user.uid === undefined) return data;
      const uid = user.uid;
      const newData = cloneDeep(data);

      for (const { name } of photoFields) {
        const photos = (data.field[name] as PhotoType[]).map(async (photo) => {
          if (photo.url !== null && photo.key !== null) {
            // 写真名・IDは他メンバーのレコードやクラウド設定由来。パス区切りや`..`を含むものは保存しない。
            // 他人の写真は持ち主のフォルダに id 付きの名前で置く（同じ秒に撮った別人の写真とすり替わらないように）
            const target = photoDownloadTarget({
              projectId: project_.id,
              layerId,
              ownUid: uid,
              recordUserId: data.userId,
              photoId: photo.id,
              photoName: photo.name,
              photoUrl: photo.url,
            });
            if (target === undefined) return photo;
            const { isOK, uri } = await projectStorage.downloadPhoto(photo.url, photo.key, target.filename, target.folder);
            if (!isOK || uri === null) {
              //console.log(message);
              return photo;
            } else {
              return { ...photo, uri };
            }
          } else {
            //写真がアップロードされていない
            return photo;
          }
        });

        //@ts-ignore
        newData.field[name] = await Promise.all(photos);
      }

      return newData;
    },
    [user.uid]
  );

  const downloadPhotos = useCallback(
    //ToDo awaitされていない
    async (layers_: LayerType[], dataSet_: DataType[], project: ProjectType) => {
      const updatedDataSet: DataType[] = [];
      for (const d of dataSet_) {
        const layer = layers_.find((l) => l.id === d.layerId);
        const photoFields = layer ? getPhotoFields(layer) : [];
        const updatedRecordSet = d.data.map((record) => {
          return downloadPhoto(record, project, d.layerId, photoFields);
        });
        updatedDataSet.push({ ...d, data: await Promise.all(updatedRecordSet) });
      }
      return updatedDataSet;
    },
    [downloadPhoto]
  );

  const downloadPublicAndCommonData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      const { isOK, message, data } = await projectStore.downloadPublicAndCommonData(project_.id);
      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPhotos, layers]
  );

  const downloadCommonData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      const { isOK, message, data } = await projectStore.downloadCommonData(project_.id);
      if (!isOK || data === undefined) {
        return { isOK: false, message };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      dispatch(updateDataAction(updatedData));
      return { isOK: true, message: '' };
    },
    [dispatch, downloadPhotos, layers]
  );

  const fetchPublicData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean, mode: 'all' | 'others' = 'all') => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin'), data: [] };
      }
      const options: { excludeUserId?: string } = {};
      if (mode === 'others') {
        options.excludeUserId = user.uid;
      }
      const { isOK, message, data, unmarkedDekGroups, undecryptableGroups } = await projectStore.downloadPublicData(
        project_.id,
        options
      );

      if (!isOK || data === undefined) {
        return { isOK: false, message, data: [] };
      }
      const updatedData = shouldPhotoDownload ? await downloadPhotos(layers, data, project_) : data;

      // unmarkedDekGroupsは自己DEK移行(Phase iii)用。ダウンロード済みdocから算出済みのため追加通信なしで返せる
      // undecryptableGroupsは、復号できずに結果から除いたもの（createMergedDataSet が手元の写しを消さないために使う）
      return { isOK: true, message: '', data: updatedData, unmarkedDekGroups, undecryptableGroups };
    },
    [downloadPhotos, layers, user]
  );

  const fetchPrivateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean, mode: 'own' | 'all' | 'others' = 'own') => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin'), data: [] };
      }

      const options: { userId?: string; excludeUserId?: string } = {};
      if (mode === 'own') {
        options.userId = user.uid;
      } else if (mode === 'others') {
        options.excludeUserId = user.uid;
      }
      const res = await projectStore.downloadPrivateData(project_.id, options);
      const { isOK, message, data, unmarkedDekGroups, undecryptableGroups } = res;

      if (!isOK || data === undefined) {
        return { isOK: false, message, data: [] };
      }
      const updatedData = shouldPhotoDownload ? await downloadPhotos(layers, data, project_) : data;
      // unmarkedDekGroupsは自己DEK移行(Phase iii)用。ダウンロード済みdocから算出済みのため追加通信なしで返せる
      return { isOK: true, message: '', data: updatedData, unmarkedDekGroups, undecryptableGroups };
    },
    [downloadPhotos, layers, user]
  );

  const fetchTemplateData = useCallback(
    async (project_: ProjectType, shouldPhotoDownload: boolean) => {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('hooks.message.pleaseLogin'), data: [] };
      }
      const { isOK, message, data, undecryptableGroups } = await projectStore.downloadTemplateData(project_.id);

      if (!isOK || data === undefined) {
        return { isOK: false, message, data: [] };
      }
      let updatedData: DataType[];
      if (shouldPhotoDownload) {
        updatedData = await downloadPhotos(layers, data, project_);
      } else {
        updatedData = data;
      }
      return {
        isOK: true,
        message: '',
        data: updatedData.map((d) => ({ ...d, userId: 'template' })),
        undecryptableGroups,
      };
    },
    [downloadPhotos, layers, user]
  );

  const downloadTemplateData = useCallback(
    async (project: ProjectType, shouldPhotoDownload: boolean) => {
      const res = await fetchTemplateData(project, shouldPhotoDownload);
      if (res.isOK && res.data) {
        dispatch(updateDataAction(res.data));
      }
      return res;
    },
    [dispatch, fetchTemplateData]
  );

  return {
    createProject,
    updateProject,
    deleteProject,
    fetchProjectSettings,
    fetchAllData,
    fetchAllPhotos,
    downloadProjectSettings,
    downloadPublicAndCommonData,
    downloadCommonData,
    fetchPublicData,
    fetchPrivateData,
    fetchTemplateData,
    uploadDataToRepository,
    uploadProjectSettings,
    deleteCommonAndTemplateData,
    conflictState,
    setConflictState,
    conflictsResolver,
    createMergedDataSet,
    downloadTemplateData,
    handleBulkSelect,
    handleSelect,
  } as const;
};
