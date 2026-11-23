import { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CloudDataItem, CloudLayerGroup, LayerType, PermissionType, ProjectType, UserType } from '../types';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { t } from '../i18n/config';
import { isLoggedIn } from '../utils/Account';
import { updateProjectAction } from '../modules/projects';
import { RootState } from '../store';
import { collectPhotoPaths, photoStoragePathFromUrl, selectPhotoPathsToDelete } from '../utils/cloudPhotoCleanup';

type DeleteTarget = { layerId: string; permission: PermissionType | 'TEMPLATE'; userId?: string };

/** deleteData が消す範囲に入る組か（TEMPLATE は持ち主を問わずレイヤのテンプレートを全部消す） */
const isDeletedBy = (targets: DeleteTarget[], permission: PermissionType | 'TEMPLATE', userId: string) =>
  targets.some(
    (target) =>
      target.permission === permission &&
      (permission === 'TEMPLATE' || target.userId === undefined || target.userId === userId)
  );

/**
 * 1つのレイヤで、消すデータの写真を Storage から消す（写真監査 P-H2）。
 * 持ち主のフォルダを丸ごと消すと、同じ人の残すデータ（テンプレートと PUBLIC など）や、管理者が引き継いだ・
 * 写した記録の写真まで消えるので、残すデータが参照している写真は消さない。
 * 照合できないとき（取得・復号に失敗した、一覧にある残すデータを読めていない）は、そのレイヤの写真を消さない
 * （孤児になるが消失はしない）。
 * - folderPaths: 照合データを読む前に取った、消すデータの持ち主のフォルダの一覧（後から上がった写真を候補にしない）
 * - before/after: doc を消す前と後に読んだレイヤのデータ。後者は消している間に上がった doc の参照を拾うため
 */
//大きいデータは複数回に分けて書くので、写真を上げてからデータを書き終えるまで時間がかかる
const RECENT_UPLOAD_MARGIN_MS = 10 * 60 * 1000;

export const deletePhotosOfDeletedData = async (
  projectId: string,
  layerId: string,
  targets: DeleteTarget[],
  allItems: { permission: PermissionType | 'TEMPLATE'; userId?: string }[],
  folderPaths: string[],
  before: Awaited<ReturnType<typeof projectStore.downloadLayerDataGroups>>,
  after: Awaited<ReturnType<typeof projectStore.downloadLayerDataGroups>>,
  startedAt?: number
): Promise<void> => {
  const loadedAll = [before, after].every((l) => l.isOK && l.complete);
  const readKeys = new Set(before.groups.map((g) => `${g.permission}_${g.userId}`));
  const unreadKept = allItems.some(
    (i) => !isDeletedBy(targets, i.permission, i.userId ?? '') && !readKeys.has(`${i.permission}_${i.userId}`)
  );
  if (!loadedAll || unreadKept) {
    console.warn('写真を照合できないため、Storage の写真は消さずに残します:', layerId);
    return;
  }
  const deletedRefs = new Set<string>();
  const keptRefs = new Set<string>();
  before.groups.forEach((g) => {
    const into = isDeletedBy(targets, g.permission, g.userId) ? deletedRefs : keptRefs;
    collectPhotoPaths(g.records).forEach((path) => into.add(path));
  });
  //消している間に誰かが上げ直した doc も残す側
  after.groups.forEach((g) => collectPhotoPaths(g.records).forEach((path) => keptRefs.add(path)));
  const candidates = selectPhotoPathsToDelete(folderPaths, deletedRefs, keptRefs).filter(
    (path) => photoStoragePathFromUrl(path) === path && path.split('/')[3] === layerId
  );
  //照合の少し前から後に上がった写真は、書き込み途中のデータ（照合に入らない）が参照しているかもしれないので残す
  const createdBefore = startedAt === undefined ? undefined : startedAt - RECENT_UPLOAD_MARGIN_MS;
  const failed = await projectStorage.deletePhotoPaths(projectId, candidates, createdBefore);
  if (failed > 0) console.warn(`写真 ${failed} 件を Storage から消せませんでした:`, layerId);
};

interface CloudDataSummaryRaw {
  layerId: string;
  userId: string;
  permission: PermissionType | 'TEMPLATE';
  chunkCount: number;
  lastUpdatedAt: Date;
}

// チェック状態の型
export interface LayerCheckState {
  layerId: string;
  checked: boolean;
  dataChecks: { index: number; checked: boolean }[];
}

export interface UseCloudDataManagementReturnType {
  isLoading: boolean;
  layerGroups: CloudLayerGroup[];
  checkStates: LayerCheckState[];
  isChecked: boolean;
  fetchCloudData: () => Promise<void>;
  deleteCloudData: () => Promise<{ isOK: boolean; message: string }>;
  deleteLayerDefinition: () => Promise<{ isOK: boolean; message: string }>;
  changeLayerChecked: (layerIndex: number, checked: boolean) => void;
  changeDataChecked: (layerIndex: number, dataIndex: number, checked: boolean) => void;
  changeCheckedAll: (checked: boolean) => void;
}

const groupDataByLayer = (
  summaryItems: CloudDataSummaryRaw[],
  layers: LayerType[],
  members: ProjectType['members']
): CloudLayerGroup[] => {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const memberMap = new Map(members.map((m) => [m.uid, m]));

  // layerId でグループ化
  const groupedByLayer = new Map<string, CloudDataSummaryRaw[]>();
  summaryItems.forEach((item) => {
    const existing = groupedByLayer.get(item.layerId);
    if (existing) {
      existing.push(item);
    } else {
      groupedByLayer.set(item.layerId, [item]);
    }
  });

  const layerGroups: CloudLayerGroup[] = [];

  groupedByLayer.forEach((items, layerId) => {
    const layer = layerMap.get(layerId);
    const isOrphan = !layer;
    const layerName = layer?.name ?? `[${t('CloudDataManagement.label.orphan')}] ${layerId.substring(0, 8)}...`;

    // permission + userId でさらにグループ化してデータアイテムを作成
    const dataItemMap = new Map<string, CloudDataSummaryRaw[]>();
    items.forEach((item) => {
      const key = `${item.permission}_${item.userId}`;
      const existing = dataItemMap.get(key);
      if (existing) {
        existing.push(item);
      } else {
        dataItemMap.set(key, [item]);
      }
    });

    const dataItems: CloudDataItem[] = [];
    dataItemMap.forEach((dataRaws) => {
      const first = dataRaws[0];
      const member = memberMap.get(first.userId);
      const lastUpdatedAt = new Date(Math.max(...dataRaws.map((d) => d.lastUpdatedAt.getTime())));

      dataItems.push({
        permission: first.permission,
        userId: first.userId,
        userEmail: member?.email,
        lastUpdatedAt,
      });
    });

    // データアイテムをソート (COMMON -> TEMPLATE -> PUBLIC -> PRIVATE、同じ権限内は更新日時順)
    const permissionOrder = (permission: string): number => {
      switch (permission) {
        case 'COMMON':
          return 0;
        case 'TEMPLATE':
          return 1;
        case 'PUBLIC':
          return 2;
        case 'PRIVATE':
          return 3;
        default:
          return 4;
      }
    };

    dataItems.sort((a, b) => {
      const permCompare = permissionOrder(a.permission) - permissionOrder(b.permission);
      if (permCompare !== 0) return permCompare;
      return b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime();
    });

    const layerLastUpdatedAt = new Date(Math.max(...items.map((i) => i.lastUpdatedAt.getTime())));

    layerGroups.push({
      layerId,
      layerName,
      isOrphan,
      dataItems,
      lastUpdatedAt: layerLastUpdatedAt,
    });
  });

  // レイヤグループをソート (通常レイヤ -> 孤児、名前順)
  return layerGroups.sort((a, b) => {
    if (a.isOrphan !== b.isOrphan) {
      return a.isOrphan ? 1 : -1;
    }
    return a.layerName.localeCompare(b.layerName);
  });
};

export const useCloudDataManagement = (project: ProjectType, user: UserType): UseCloudDataManagementReturnType => {
  const dispatch = useDispatch();
  const projects = useSelector((state: RootState) => state.projects);
  const [isLoading, setIsLoading] = useState(false);
  const [layerGroups, setLayerGroups] = useState<CloudLayerGroup[]>([]);
  const [checkStates, setCheckStates] = useState<LayerCheckState[]>([]);

  const isChecked = useMemo(() => {
    return checkStates.some((layer) => layer.checked || layer.dataChecks.some((d) => d.checked));
  }, [checkStates]);

  const fetchCloudData = useCallback(async () => {
    setIsLoading(true);
    try {
      // プロジェクト設定を取得（レイヤ情報）
      const settingsResult = await projectStore.downloadProjectSettings(project.id);
      if (!settingsResult.isOK || !settingsResult.data) {
        console.error('Failed to download project settings');
        setLayerGroups([]);
        setCheckStates([]);
        return;
      }

      // クラウドデータのサマリーを取得
      const summaryResult = await projectStore.getCloudDataSummary(project.id);
      if (!summaryResult.isOK || !summaryResult.data) {
        console.error('Failed to get cloud data summary');
        setLayerGroups([]);
        setCheckStates([]);
        return;
      }

      // グループ化
      const groups = groupDataByLayer(summaryResult.data, settingsResult.data.layers, project.members);

      // データがないレイヤ定義も追加
      const existingLayerIds = new Set(groups.map((g) => g.layerId));
      const emptyLayers: CloudLayerGroup[] = settingsResult.data.layers
        .filter((layer) => !existingLayerIds.has(layer.id))
        .map((layer) => ({
          layerId: layer.id,
          layerName: layer.name,
          isOrphan: false,
          dataItems: [],
          lastUpdatedAt: new Date(0), // データがないので最古の日時
        }));

      // 全グループをマージしてソート
      const allGroups = [...groups, ...emptyLayers].sort((a, b) => {
        if (a.isOrphan !== b.isOrphan) {
          return a.isOrphan ? 1 : -1;
        }
        // データがないレイヤは最後に
        if (a.dataItems.length === 0 && b.dataItems.length > 0) return 1;
        if (a.dataItems.length > 0 && b.dataItems.length === 0) return -1;
        return a.layerName.localeCompare(b.layerName);
      });

      setLayerGroups(allGroups);
      setCheckStates(
        allGroups.map((group) => ({
          layerId: group.layerId,
          checked: false,
          dataChecks: group.dataItems.map((_, index) => ({ index, checked: false })),
        }))
      );
    } catch (error) {
      console.error('fetchCloudData Error:', error);
      setLayerGroups([]);
      setCheckStates([]);
    } finally {
      setIsLoading(false);
    }
  }, [project.id, project.members]);

  // 選択されたデータを取得するヘルパー
  const getSelectedTargets = useCallback(() => {
    const targets: { layerId: string; permission: PermissionType | 'TEMPLATE'; userId?: string }[] = [];

    checkStates.forEach((layerCheck, layerIndex) => {
      const layer = layerGroups[layerIndex];
      if (!layer) return;

      if (layerCheck.checked) {
        // レイヤ全体が選択されている場合、全データを対象に
        layer.dataItems.forEach((item) => {
          targets.push({
            layerId: layer.layerId,
            permission: item.permission,
            userId: item.userId,
          });
        });
      } else {
        // 個別のデータが選択されている場合
        layerCheck.dataChecks.forEach((dataCheck) => {
          if (dataCheck.checked) {
            const item = layer.dataItems[dataCheck.index];
            if (item) {
              targets.push({
                layerId: layer.layerId,
                permission: item.permission,
                userId: item.userId,
              });
            }
          }
        });
      }
    });

    return targets;
  }, [checkStates, layerGroups]);

  // 選択されたレイヤIDを取得するヘルパー
  const getSelectedLayerIds = useCallback(() => {
    const layerIds = new Set<string>();

    checkStates.forEach((layerCheck, layerIndex) => {
      const layer = layerGroups[layerIndex];
      if (!layer) return;

      if (layerCheck.checked || layerCheck.dataChecks.some((d) => d.checked)) {
        layerIds.add(layer.layerId);
      }
    });

    return Array.from(layerIds);
  }, [checkStates, layerGroups]);

  const deleteCloudData = useCallback(async (): Promise<{ isOK: boolean; message: string }> => {
    try {
      const targets = getSelectedTargets();
      if (targets.length === 0) {
        return { isOK: false, message: '' };
      }

      const startedAt = Date.now();
      const layerIds = Array.from(new Set(targets.map((target) => target.layerId)));
      // 写真の候補（消すデータの持ち主のフォルダ）を先に取り、そのあとで照合データを読む。
      // 逆だと、読んだ後に上がった写真が候補に入るのに、それを参照する doc は照合に入らない
      const foldersByLayer = new Map<string, Map<string, string[]>>();
      const beforeByLayer = new Map<string, Awaited<ReturnType<typeof projectStore.downloadLayerDataGroups>>>();
      for (const layerId of layerIds) {
        const owners = Array.from(
          new Set(
            targets.filter((t2) => t2.layerId === layerId && t2.userId).map((t2) => t2.userId as string)
          )
        );
        const lists = await Promise.all(
          owners.map((u) => projectStorage.listLayerPhotoPaths(project.id, layerId, u).catch(() => [] as string[]))
        );
        foldersByLayer.set(layerId, new Map(owners.map((u, i) => [u, lists[i]])));
        beforeByLayer.set(layerId, await projectStore.downloadLayerDataGroups(project.id, layerId));
      }

      // 消し終えた分の写真を Storage から消す（途中で失敗しても、消せた doc の写真は片付ける）
      const deletePhotosFor = async (done: DeleteTarget[]) => {
        for (const layerId of layerIds) {
          const doneInLayer = done.filter((target) => target.layerId === layerId);
          if (doneInLayer.length === 0) continue;
          try {
            const after = await projectStore.downloadLayerDataGroups(project.id, layerId);
            await deletePhotosOfDeletedData(
              project.id,
              layerId,
              doneInLayer,
              layerGroups.find((g) => g.layerId === layerId)?.dataItems ?? [],
              //消せたデータの持ち主のフォルダだけを候補にする（消せなかった人の写真は残す）
              Array.from(new Set(doneInLayer.map((target) => target.userId).filter((u): u is string => !!u))).flatMap(
                (u) => foldersByLayer.get(layerId)?.get(u) ?? []
              ),
              beforeByLayer.get(layerId)!,
              after,
              startedAt
            );
          } catch (e) {
            console.warn('Failed to delete photos:', e);
          }
        }
      };

      const done: DeleteTarget[] = [];
      for (const target of targets) {
        // Firestoreからデータを削除
        const deleteResult = await projectStore.deleteData(project.id, target.layerId, target.permission, target.userId);
        if (!deleteResult.isOK) {
          await deletePhotosFor(done);
          return { isOK: false, message: deleteResult.message };
        }
        done.push(target);
      }
      await deletePhotosFor(done);

      return { isOK: true, message: '' };
    } catch (error) {
      console.error('deleteCloudData Error:', error);
      return { isOK: false, message: t('CloudDataManagement.message.failDeleteData') };
    }
  }, [project.id, getSelectedTargets, layerGroups]);

  const deleteLayerDefinition = useCallback(async (): Promise<{ isOK: boolean; message: string }> => {
    try {
      if (!isLoggedIn(user)) {
        return { isOK: false, message: t('CloudDataManagement.message.failDeleteLayer') };
      }

      const layerIds = getSelectedLayerIds();
      if (layerIds.length === 0) {
        return { isOK: false, message: '' };
      }

      // 孤児でないレイヤIDを抽出（レイヤ定義削除用）
      const nonOrphanLayerIds = layerIds.filter((layerId) => {
        const layer = layerGroups.find((l) => l.layerId === layerId);
        return layer && !layer.isOrphan;
      });

      // 1. レイヤ定義を削除（孤児でない場合のみ）
      if (nonOrphanLayerIds.length > 0) {
        const settingsResult = await projectStore.deleteLayerFromSettings(project.id, user.uid, nonOrphanLayerIds);
        if (!settingsResult.isOK) {
          return { isOK: false, message: settingsResult.message };
        }
        // プロジェクト一覧の「更新日時」を再取得なしで反映する
        const currentProject = projects.find((p) => p.id === project.id);
        if (settingsResult.timestamp !== undefined && currentProject !== undefined) {
          dispatch(updateProjectAction({ ...currentProject, settingsEncryptedAt: settingsResult.timestamp }));
        }
      }

      // 2. 選択されたレイヤの全データを削除
      for (const layerId of layerIds) {
        const layer = layerGroups.find((l) => l.layerId === layerId);
        if (!layer) continue;

        // 画面を開いた後に上がったデータも含めて、レイヤのデータを全部消す
        const deleteResult = await projectStore.deleteData(project.id, layerId);
        if (!deleteResult.isOK) {
          //データが残るので、その写真は消さない
          return { isOK: false, message: deleteResult.message };
        }
        // レイヤの全データを消したので、写真もレイヤのフォルダごと消す（データ管理で残した写真も含めて片付ける）
        await projectStorage.deleteLayerPhotos(project.id, layerId);
      }

      return { isOK: true, message: '' };
    } catch (error) {
      console.error('deleteLayerDefinition Error:', error);
      return { isOK: false, message: t('CloudDataManagement.message.failDeleteLayer') };
    }
  }, [user, getSelectedLayerIds, layerGroups, project.id, projects, dispatch]);

  // レイヤのチェック状態を変更（子のデータも連動）
  const changeLayerChecked = useCallback((layerIndex: number, checked: boolean) => {
    setCheckStates((prev) =>
      prev.map((state, i) => {
        if (i === layerIndex) {
          return {
            ...state,
            checked,
            dataChecks: state.dataChecks.map((d) => ({ ...d, checked })),
          };
        }
        return state;
      })
    );
  }, []);

  // データのチェック状態を変更（親のレイヤも連動）
  const changeDataChecked = useCallback((layerIndex: number, dataIndex: number, checked: boolean) => {
    setCheckStates((prev) =>
      prev.map((state, i) => {
        if (i === layerIndex) {
          const newDataChecks = state.dataChecks.map((d, di) => (di === dataIndex ? { ...d, checked } : d));
          const allChecked = newDataChecks.every((d) => d.checked);
          return {
            ...state,
            checked: allChecked,
            dataChecks: newDataChecks,
          };
        }
        return state;
      })
    );
  }, []);

  // 全選択/全解除
  const changeCheckedAll = useCallback((checked: boolean) => {
    setCheckStates((prev) =>
      prev.map((state) => ({
        ...state,
        checked,
        dataChecks: state.dataChecks.map((d) => ({ ...d, checked })),
      }))
    );
  }, []);

  return {
    isLoading,
    layerGroups,
    checkStates,
    isChecked,
    fetchCloudData,
    deleteCloudData,
    deleteLayerDefinition,
    changeLayerChecked,
    changeDataChecked,
    changeCheckedAll,
  };
};
