import { useCallback, useMemo, useState } from 'react';
import { CloudDataItem, CloudLayerGroup, LayerType, PermissionType, ProjectType, UserType } from '../types';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { t } from '../i18n/config';
import { isLoggedIn } from '../utils/Account';

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

      for (const target of targets) {
        // Firestoreからデータを削除
        const deleteResult = await projectStore.deleteData(project.id, target.layerId, target.permission, target.userId);
        if (!deleteResult.isOK) {
          return { isOK: false, message: deleteResult.message };
        }

        // Storageから写真を削除
        const photoResult = await projectStorage.deleteLayerPhotos(project.id, target.layerId, target.userId);
        if (!photoResult.isOK) {
          console.warn('Failed to delete photos:', photoResult.message);
        }
      }

      return { isOK: true, message: '' };
    } catch (error) {
      console.error('deleteCloudData Error:', error);
      return { isOK: false, message: t('CloudDataManagement.message.failDeleteData') };
    }
  }, [project.id, getSelectedTargets]);

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
      }

      // 2. 選択されたレイヤの全データを削除
      for (const layerId of layerIds) {
        const layer = layerGroups.find((l) => l.layerId === layerId);
        if (!layer) continue;

        for (const item of layer.dataItems) {
          await projectStore.deleteData(project.id, layerId, item.permission, item.userId);
          await projectStorage.deleteLayerPhotos(project.id, layerId, item.userId);
        }
      }

      return { isOK: true, message: '' };
    } catch (error) {
      console.error('deleteLayerDefinition Error:', error);
      return { isOK: false, message: t('CloudDataManagement.message.failDeleteLayer') };
    }
  }, [project.id, user, layerGroups, getSelectedLayerIds]);

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
