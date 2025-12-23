import { useCallback, useMemo, useState } from 'react';
import { CloudDataGroup, LayerType, PermissionType, ProjectType } from '../types';
import * as projectStore from '../lib/firebase/firestore';
import * as projectStorage from '../lib/firebase/storage';
import { t } from '../i18n/config';

interface CloudDataSummaryRaw {
  layerId: string;
  userId: string;
  permission: PermissionType | 'TEMPLATE';
  chunkCount: number;
  lastUpdatedAt: Date;
}

export interface UseCloudDataManagementReturnType {
  isLoading: boolean;
  dataGroups: CloudDataGroup[];
  checkList: { id: number; checked: boolean }[];
  isChecked: boolean;
  fetchCloudData: () => Promise<void>;
  deleteCloudData: (targets: CloudDataGroup[]) => Promise<{ isOK: boolean; message: string }>;
  changeChecked: (index: number, checked: boolean) => void;
  changeCheckedAll: (checked: boolean) => void;
}

const groupDataByManagementUnit = (
  summaryItems: CloudDataSummaryRaw[],
  layers: LayerType[],
  members: ProjectType['members']
): CloudDataGroup[] => {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const memberMap = new Map(members.map((m) => [m.uid, m]));
  const groups: CloudDataGroup[] = [];

  // layerId + permission でグループ化
  const groupedByLayerPermission = new Map<string, CloudDataSummaryRaw[]>();
  summaryItems.forEach((item) => {
    const key = `${item.layerId}_${item.permission}`;
    const existing = groupedByLayerPermission.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groupedByLayerPermission.set(key, [item]);
    }
  });

  groupedByLayerPermission.forEach((items, key) => {
    const [layerId, permission] = key.split('_');
    const layer = layerMap.get(layerId);
    const isOrphan = !layer;
    const layerName = layer?.name ?? `[${t('CloudDataManagement.label.orphan')}] ${layerId.substring(0, 8)}...`;

    if (permission === 'COMMON' || permission === 'TEMPLATE') {
      // COMMON/TEMPLATE: レイヤ全体で1グループ
      const lastUpdatedAt = new Date(Math.max(...items.map((i) => i.lastUpdatedAt.getTime())));

      groups.push({
        type: isOrphan ? 'orphan' : 'layer',
        layerId,
        layerName,
        permission: permission as PermissionType | 'TEMPLATE',
        lastUpdatedAt,
      });
    } else {
      // PUBLIC/PRIVATE: ユーザーごとにグループ
      const userGroups = new Map<string, CloudDataSummaryRaw[]>();
      items.forEach((item) => {
        const existing = userGroups.get(item.userId);
        if (existing) {
          existing.push(item);
        } else {
          userGroups.set(item.userId, [item]);
        }
      });

      userGroups.forEach((userItems, userId) => {
        const member = memberMap.get(userId);
        const lastUpdatedAt = new Date(Math.max(...userItems.map((i) => i.lastUpdatedAt.getTime())));

        groups.push({
          type: isOrphan ? 'orphan' : 'user',
          layerId,
          layerName,
          permission: permission as PermissionType,
          userId,
          userName: member?.email,
          userEmail: member?.email,
          lastUpdatedAt,
        });
      });
    }
  });

  // ソート順:
  // 1. COMMON（名前順）
  // 2. TEMPLATE, PUBLIC, PRIVATE（名前順、同名内はTEMPLATE→PUBLIC→PRIVATE）
  // 3. 孤児データ（名前順）
  const permissionOrder = (permission: string): number => {
    switch (permission) {
      case 'TEMPLATE':
        return 0;
      case 'PUBLIC':
        return 1;
      case 'PRIVATE':
        return 2;
      default:
        return 3;
    }
  };

  const getSortGroup = (group: CloudDataGroup): number => {
    if (group.type === 'orphan') return 2; // 孤児は最後
    if (group.permission === 'COMMON') return 0; // COMMONは最初
    return 1; // TEMPLATE, PUBLIC, PRIVATEは中間
  };

  return groups.sort((a, b) => {
    const groupA = getSortGroup(a);
    const groupB = getSortGroup(b);

    // まずソートグループで比較
    if (groupA !== groupB) return groupA - groupB;

    // 同じグループ内では名前順
    const nameCompare = a.layerName.localeCompare(b.layerName);
    if (nameCompare !== 0) return nameCompare;

    // 同名の場合はパーミッション順（TEMPLATE→PUBLIC→PRIVATE）
    return permissionOrder(a.permission) - permissionOrder(b.permission);
  });
};

export const useCloudDataManagement = (project: ProjectType): UseCloudDataManagementReturnType => {
  const [isLoading, setIsLoading] = useState(false);
  const [dataGroups, setDataGroups] = useState<CloudDataGroup[]>([]);
  const [checkList, setCheckList] = useState<{ id: number; checked: boolean }[]>([]);

  const isChecked = useMemo(() => checkList.some((item) => item.checked), [checkList]);

  const fetchCloudData = useCallback(async () => {
    setIsLoading(true);
    try {
      // プロジェクト設定を取得（レイヤ情報）
      const settingsResult = await projectStore.downloadProjectSettings(project.id);
      if (!settingsResult.isOK || !settingsResult.data) {
        console.error('Failed to download project settings');
        setDataGroups([]);
        setCheckList([]);
        return;
      }

      // クラウドデータのサマリーを取得
      const summaryResult = await projectStore.getCloudDataSummary(project.id);
      if (!summaryResult.isOK || !summaryResult.data) {
        console.error('Failed to get cloud data summary');
        setDataGroups([]);
        setCheckList([]);
        return;
      }

      // グループ化
      const groups = groupDataByManagementUnit(summaryResult.data, settingsResult.data.layers, project.members);

      setDataGroups(groups);
      setCheckList(groups.map((_, index) => ({ id: index, checked: false })));
    } catch (error) {
      console.error('fetchCloudData Error:', error);
      setDataGroups([]);
      setCheckList([]);
    } finally {
      setIsLoading(false);
    }
  }, [project.id, project.members]);

  const deleteCloudData = useCallback(
    async (targets: CloudDataGroup[]): Promise<{ isOK: boolean; message: string }> => {
      try {
        for (const target of targets) {
          // Firestoreからデータを削除
          const deleteResult = await projectStore.deleteData(
            project.id,
            target.layerId,
            target.permission,
            target.userId
          );
          if (!deleteResult.isOK) {
            return { isOK: false, message: deleteResult.message };
          }

          // Storageから写真を削除
          const photoResult = await projectStorage.deleteLayerPhotos(project.id, target.layerId, target.userId);
          if (!photoResult.isOK) {
            console.warn('Failed to delete photos:', photoResult.message);
            // 写真削除の失敗は警告のみで続行
          }
        }

        return { isOK: true, message: '' };
      } catch (error) {
        console.error('deleteCloudData Error:', error);
        return { isOK: false, message: t('CloudDataManagement.message.failDeleteData') };
      }
    },
    [project.id]
  );

  const changeChecked = useCallback((index: number, checked: boolean) => {
    setCheckList((prev) => prev.map((item, i) => (i === index ? { ...item, checked } : item)));
  }, []);

  const changeCheckedAll = useCallback((checked: boolean) => {
    setCheckList((prev) => prev.map((item) => ({ ...item, checked })));
  }, []);

  return {
    isLoading,
    dataGroups,
    checkList,
    isChecked,
    fetchCloudData,
    deleteCloudData,
    changeChecked,
    changeCheckedAll,
  };
};
