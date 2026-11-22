import type { FetchedScope, OwnCloudData } from '../hooks/useRepository';
import type { UndecryptableGroupType } from '../lib/firebase/firestore';
import { DataType, LayerType } from '../types';

/**
 * ホームの「データ取得」の組み立て（同期監査 L4・L2・M8）。取得の振り分けと createMergedDataSet への入力を、画面から
 * 切り離して確かめられるようにする。
 */

/** 何を取得するか。PUBLIC は全員分、PRIVATE は管理者が全員分を取るとき以外は自分の分だけ */
export const getHomeDownloadFetchModes = (isAdmin: boolean): { public: 'all'; private: 'all' | 'own' } => ({
  public: 'all',
  private: isAdmin ? 'all' : 'own',
});

type FetchedData = { data: DataType[]; undecryptableGroups?: UndecryptableGroupType[] };

export type HomeDownloadMergeInput = {
  privateData: DataType[];
  publicData: DataType[];
  templateData: DataType[];
  fetchedScope: FetchedScope;
  undecryptableGroups: UndecryptableGroupType[];
  ownCloud: OwnCloudData;
};

/**
 * 取得結果から createMergedDataSet の入力を作る。
 * - 自分の PRIVATE・PUBLIC は手元の版を渡す（未アップロードの変更があるため）。クラウドの自分の分は ownCloud として
 *   渡し、手元と既存の競合解決で合わせる（L4）。クラウドの自分の分を privateData/publicData にも入れると、自分の記録が
 *   手元とクラウドで二重になる
 * - 他人の PRIVATE は管理者が全員分を取ったときだけ渡す
 * - 管理者が全員分を取ったときは、他人の PUBLIC・PRIVATE とテンプレートを取り直したので、そこに無い他人の分は手元からも
 *   消す。取らなかったときは PRIVATE を範囲に含めない。管理者は以前に取得した他人の PRIVATE の写しを持ちうるので、
 *   他人の分を消さない（pruneOthers:false。消すと、取得しない選択をしただけで手元の写しを失う）
 */
export const buildHomeDownloadMergeInput = ({
  projectId,
  fetchedAt,
  ownVersions,
  publicRes,
  privateRes,
  templateRes,
  localDataSet,
  layers,
  ownUserId,
  isAdmin,
  isOwnerAdmin,
}: {
  projectId: string;
  fetchedAt: number;
  ownVersions: Map<string, number>;
  publicRes: FetchedData;
  privateRes: FetchedData;
  templateRes: FetchedData;
  localDataSet: DataType[];
  layers: LayerType[];
  ownUserId: string | undefined;
  isAdmin: boolean;
  isOwnerAdmin: boolean;
}): HomeDownloadMergeInput => {
  const isOwn = (d: DataType) => d.userId === ownUserId;
  const layerIdsOf = (permission: LayerType['permission']) =>
    new Set(layers.filter((layer) => layer.permission === permission).map((layer) => layer.id));
  const privateLayerIds = layerIdsOf('PRIVATE');
  const publicLayerIds = layerIdsOf('PUBLIC');
  const ownPrivateData = localDataSet.filter((d) => privateLayerIds.has(d.layerId) && isOwn(d));
  const ownPublicData = localDataSet.filter((d) => publicLayerIds.has(d.layerId) && isOwn(d));
  return {
    privateData: [...(isAdmin ? privateRes.data.filter((d) => !isOwn(d)) : []), ...ownPrivateData],
    publicData: [...publicRes.data.filter((d) => !isOwn(d)), ...ownPublicData],
    templateData: templateRes.data,
    fetchedScope: isAdmin
      ? { permissions: ['PUBLIC', 'PRIVATE'], template: true }
      : { permissions: ['PUBLIC'], template: true, pruneOthers: !isOwnerAdmin },
    undecryptableGroups: [
      ...(publicRes.undecryptableGroups ?? []),
      ...(privateRes.undecryptableGroups ?? []),
      ...(templateRes.undecryptableGroups ?? []),
    ],
    ownCloud: {
      projectId,
      fetchedAt,
      versions: ownVersions,
      privateData: privateRes.data.filter(isOwn),
      publicData: publicRes.data.filter(isOwn),
    },
  };
};
