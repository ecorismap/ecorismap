import { UnknownAction } from '@reduxjs/toolkit';
import { isEqual } from 'lodash';
import { DataType, LayerType, PhotoType, RecordType, RoleType, UserType } from '../types';
import {
  deleteRecordsAction,
  moveRecordsToUserAction,
  takeOverRecordsAction,
  TransferRecordsPayload,
  updateRecordsAction,
} from './dataSet';
import { getRecordModifyBlock, RecordModifyAction } from '../utils/recordTakeover';

/**
 * 他のメンバー・テンプレートの記録の変更と削除を、ストアに入る手前でそろえる（同期監査 M8・L1）。
 *
 * 記録を変える経路はデータ編集・データ一覧・作図・ポイントの移動・写真の撮影の回収などに散らばっていて、どれも
 * 記録のある集合（名義）へ直接 dispatch する。画面側でも止めているが、取りこぼした経路から他人の記録が手元だけで
 * 変わると、削除は取得で戻り、編集は同じ id が2人の名義に並ぶ。そこで実行中のプロジェクトでは、他人の名義への
 * 変更・削除を次のように置き換える（自分の名義・ログイン前の記録・設定モード・閉じたプロジェクトは従来どおり）。
 * - 変更・削除してよい（管理者・公開レイヤ）→ 自分の名義への引き継ぎ（takeOverRecordsAction）
 * - テンプレートの記録の編集 → 従来どおり自分の記録として持ち替える（moveRecordsToUserAction）
 * - それ以外 → 何もしない（画面側で理由を案内する）
 * 表示の切り替え（visible）や、写真の取得で手元のパス（uri）だけが変わる更新は、中身が変わらないので通す
 */

type OwnershipState = {
  dataSet: DataType[];
  layers: LayerType[];
  user: UserType;
  settings: { projectId: string | undefined; isSettingProject: boolean; role: RoleType | undefined };
};

type Actor = { uid: string; displayName: string | null; isOwnerAdmin: boolean };

const getActor = (state: OwnershipState): Actor | undefined => {
  const { projectId, isSettingProject, role } = state.settings;
  if (projectId === undefined || isSettingProject) return undefined;
  const uid = state.user.uid;
  if (uid === undefined) return undefined;
  return { uid, displayName: state.user.displayName ?? null, isOwnerAdmin: role === 'OWNER' || role === 'ADMIN' };
};

/** 同期される中身（属性・形・削除）。表示の切り替えや、手元の写真のパスだけの違いは中身の変更とみなさない */
const contentOf = (record: RecordType) => ({
  field: Object.fromEntries(
    Object.entries(record.field).map(([key, value]) => [
      key,
      Array.isArray(value) ? (value as PhotoType[]).map(({ uri: _uri, ...rest }) => rest) : value,
    ])
  ),
  coords: record.coords ?? null,
  holes: record.holes ?? null,
  deleted: record.deleted === true,
});

const isSameContent = (a: RecordType, b: RecordType) => isEqual(contentOf(a), contentOf(b));

type Decision = 'takeOver' | 'copy' | 'block';

const decide = (layer: LayerType, fromUserId: string, action: RecordModifyAction, actor: Actor): Decision => {
  const block = getRecordModifyBlock({
    layer,
    recordUserId: fromUserId,
    action,
    ownUserId: actor.uid,
    isOwnerAdmin: actor.isOwnerAdmin,
    isRunningProject: true,
  });
  if (block !== undefined) return 'block';
  return fromUserId === 'template' && action === 'edit' ? 'copy' : 'takeOver';
};

const warnBlocked = (count: number) => {
  if (count > 0 && process.env.NODE_ENV !== 'test') {
    console.warn(`[recordOwnership] 他のメンバー・テンプレートの記録の変更 ${count} 件を受け付けませんでした`);
  }
};

/**
 * 1つの action を、所有権の規則に沿った action の並びに置き換える。対象外の action はそのまま返す。
 * 空の配列は「何もしない」
 */
export const resolveRecordOwnershipActions = (state: OwnershipState, action: UnknownAction): UnknownAction[] => {
  const isUpdate = updateRecordsAction.match(action);
  const isDelete = deleteRecordsAction.match(action);
  const isMove = moveRecordsToUserAction.match(action);
  if (!isUpdate && !isDelete && !isMove) return [action];
  const actor = getActor(state);
  if (actor === undefined) return [action];

  const { layerId } = action.payload;
  const fromUserId = isMove ? action.payload.fromUserId : action.payload.userId;
  if (fromUserId === undefined || fromUserId === actor.uid) return [action];
  const layer = state.layers.find((l) => l.id === layerId);
  if (layer === undefined) return [action];
  const bucket = state.dataSet.find((d) => d.layerId === layerId && d.userId === fromUserId)?.data ?? [];
  const bucketById = new Map(bucket.map((record) => [record.id, record]));
  const transfer = (data: RecordType[]): TransferRecordsPayload => ({
    layerId,
    fromUserId,
    toUserId: actor.uid,
    toDisplayName: actor.displayName,
    data,
  });

  if (isMove) {
    if (action.payload.toUserId !== actor.uid) return [action];
    const decision = decide(layer, fromUserId, 'edit', actor);
    if (decision === 'copy') return [action];
    if (decision === 'block') {
      warnBlocked(action.payload.data.length);
      return [];
    }
    return [takeOverRecordsAction({ ...transfer(action.payload.data), deleted: false })];
  }

  if (isDelete) {
    // 渡された記録のうち、この集合にあるものだけが対象（集合に無い記録は reducer でも無視される）
    const targets = action.payload.data.flatMap((record) => {
      const existing = bucketById.get(record.id);
      return existing === undefined ? [] : [existing];
    });
    if (targets.length === 0) return [action];
    const decision = decide(layer, fromUserId, 'delete', actor);
    if (decision === 'block') {
      warnBlocked(targets.length);
      return [];
    }
    return [takeOverRecordsAction({ ...transfer(targets), deleted: true })];
  }

  // 更新: 中身が変わらないもの（表示の切り替えなど）はそのまま通し、中身が変わるものだけを規則に沿って置き換える
  const passthrough: RecordType[] = [];
  const changed: RecordType[] = [];
  action.payload.data.forEach((record) => {
    const existing = bucketById.get(record.id);
    if (existing !== undefined && isSameContent(existing, record)) passthrough.push(record);
    else changed.push(record);
  });
  if (changed.length === 0) return [action];
  const decision = decide(layer, fromUserId, 'edit', actor);
  const actions: UnknownAction[] = [];
  if (passthrough.length > 0) actions.push(updateRecordsAction({ layerId, userId: fromUserId, data: passthrough }));
  if (decision === 'block') {
    warnBlocked(changed.length);
  } else if (decision === 'copy') {
    actions.push(moveRecordsToUserAction(transfer(changed)));
  } else {
    actions.push(takeOverRecordsAction({ ...transfer(changed), deleted: false }));
  }
  return actions;
};
