import { createSlice, PayloadAction, createAction } from '@reduxjs/toolkit';
import { ulid } from 'ulid';
import { DataType, RecordType } from '../types';
import { produce } from 'immer'; // Immerをインポート
import { addTakenOverFrom } from '../utils/recordTakeover';

export const DEFAULT_DATA: RecordType = {
  id: '',
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {},
};

export const dataSetInitialState: DataType[] = [
  { layerId: ulid(), userId: undefined, data: [] },
  { layerId: ulid(), userId: undefined, data: [] },
  { layerId: ulid(), userId: undefined, data: [] },
];

// 新しいAction Payloadの型定義
interface SetAllRecordsVisibilityPayload {
  layerId: string;
  visible: boolean;
}

// 新しいActionの定義
export const setAllRecordsVisibilityAction = createAction<SetAllRecordsVisibilityPayload>('dataSet/setAllVisibility');

/** 記録を別の名義へ移す（moveRecordsToUserAction・takeOverRecordsAction）の payload */
export interface TransferRecordsPayload {
  layerId: string;
  /** 記録が今ある集合の userId（'template' を含む） */
  fromUserId: string | undefined;
  toUserId: string | undefined;
  toDisplayName: string | null;
  data: RecordType[];
}

export interface TakeOverRecordsPayload extends TransferRecordsPayload {
  /** true なら削除（引き継いだ墓標を持つ）、false なら編集 */
  deleted: boolean;
}

/** 名義ごとの集合を取り出す（無ければ作る） */
const findOrCreateBucket = (state: DataType[], layerId: string, userId: string | undefined): DataType => {
  const found = state.find((d) => d.layerId === layerId && d.userId === userId);
  if (found !== undefined) return found;
  state.push({ layerId, userId, data: [] });
  return state[state.length - 1];
};

/** 集合に記録を入れる（同じ id があれば置き換え、無ければ末尾に足す） */
const upsertRecords = (bucket: DataType, records: RecordType[]) => {
  const updateMap = new Map(records.map((v) => [v.id, v]));
  const existingIds = new Set(bucket.data.map((d) => d.id));
  bucket.data = [
    ...bucket.data.map((d) => updateMap.get(d.id) ?? d),
    ...records.filter((v) => !existingIds.has(v.id)),
  ];
};

const updateRecords = (state: DataType[], action: PayloadAction<DataType>) => {
  const { layerId, userId, data } = action.payload;
  const dataIndex = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
  //console.assert(dataIndex !== -1, { dataIndex, error: 'UPDATE_RECORDS' });
  if (dataIndex === -1) {
    // レイヤーが存在しない場合は新規追加
    state.push(action.payload);
  } else {
    // 既存レコードは更新、存在しないレコードは追加
    const existingData = state[dataIndex].data;
    const updateMap = new Map(data.map((v) => [v.id, v]));
    const existingIds = new Set(existingData.map((d) => d.id));
    // 引き継ぎ元（takenOverFrom）は、渡された版に無くても引き継ぐ。落とすと、引き継いだ記録を直したときに
    // 元の持ち主の名義に残る古い版を打ち消せなくなり、同じ id が2人の名義に並ぶ（同期監査 L1）
    const updatedData = existingData.map((d) => {
      const next = updateMap.get(d.id);
      if (next === undefined) return d;
      if (d.takenOverFrom !== undefined && next.takenOverFrom === undefined) {
        return { ...next, takenOverFrom: d.takenOverFrom };
      }
      return next;
    });
    const newRecords = data.filter((v) => !existingIds.has(v.id));
    state[dataIndex].data = [...updatedData, ...newRecords];
  }
};

const reducers = {
  setDataSetAction: (_state: DataType[], action: PayloadAction<DataType[]>) => {
    return action.payload;
  },
  addDataAction: (state: DataType[], action: PayloadAction<DataType[]>) => {
    state.push(...action.payload);
  },
  updateDataAction: (state: DataType[], action: PayloadAction<DataType[]>) => {
    if (state.length === 0) return action.payload;
    const newData = action.payload.filter((v) => !state.find((d) => v.layerId === d.layerId && v.userId === d.userId));
    const updatedData = state.map((d) => {
      return action.payload.find((v) => v.layerId === d.layerId && v.userId === d.userId) || d;
    });
    return [...updatedData, ...newData];
  },
  deleteDataAction: (state: DataType[], action: PayloadAction<DataType[]>) => {
    return state.filter((d) => !action.payload.find((v: DataType) => v.layerId === d.layerId && v.userId === d.userId));
  },
  setRecordSetAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data } = action.payload;
    const dataIndex = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    // console.assert(dataIndex !== -1, { dataIndex, error: 'SET_RECORDSET' });
    if (dataIndex !== -1) {
      state[dataIndex].data = data;
    }
  },
  addRecordsAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data } = action.payload;
    const dataIndex = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    if (dataIndex !== -1) {
      state[dataIndex].data.push(...data);
    } else {
      state.push(action.payload);
    }
  },
  updateRecordsAction: updateRecords,
  /**
   * updateRecordsAction と同じ更新だが、所有権の規則（modules/recordOwnership）を通さない。手元の表示のためだけに
   * 他のメンバーの記録の写しを書き換える（アップロードされず、次の取得でクラウドの版に戻る）ときに使う
   */
  updateRecordsLocallyAction: updateRecords,
  /**
   * 記録を別の名義へ持ち替える（テンプレートやログイン前の記録を編集して自分の記録にする）。元の集合では削除と同じく
   * アップロード済みなら墓標、未同期なら物理削除にし、移した先では userId・displayName を付け替える。
   * 実行中のプロジェクトで他のメンバーの記録を移すときは、ストアの所有権の規則（modules/recordOwnership）が
   * 管理者なら引き継ぎ（takeOverRecordsAction）に、一般メンバーなら何もしないように置き換える
   */
  moveRecordsToUserAction: (state: DataType[], action: PayloadAction<TransferRecordsPayload>) => {
    const { layerId, fromUserId, toUserId, toDisplayName, data } = action.payload;
    if (fromUserId !== toUserId) {
      const from = state.find((d) => d.layerId === layerId && d.userId === fromUserId);
      if (from !== undefined) {
        const ids = new Set(data.map((d) => d.id));
        const now = Date.now();
        from.data = (from.data as RecordType[]).flatMap((record) => {
          if (!ids.has(record.id)) return [record];
          return record.uploaded ? [{ ...record, userId: fromUserId, deleted: true, updatedAt: now }] : [];
        });
      }
    }
    upsertRecords(
      findOrCreateBucket(state, layerId, toUserId),
      data.map((record) => ({ ...record, userId: toUserId, displayName: toDisplayName }))
    );
  },
  /**
   * 管理者が他のメンバー（またはテンプレート）の記録を引き継ぐ（同期監査 M8・L1）。元の集合からは消し、自分の名義へ
   * 引き継ぎ元（takenOverFrom）付きで移す。削除なら墓標として移す（自分の doc で送り、取得した人の手元で元の持ち主の
   * 版を打ち消す）。updatedAt は元の版より必ず新しくする（引き継いだ版が打ち消し合いで勝つように）
   */
  takeOverRecordsAction: (state: DataType[], action: PayloadAction<TakeOverRecordsPayload>) => {
    const { layerId, fromUserId, toUserId, toDisplayName, data, deleted } = action.payload;
    const from = state.find((d) => d.layerId === layerId && d.userId === fromUserId);
    const fromById = new Map((from?.data ?? []).map((record) => [record.id, record]));
    const to = findOrCreateBucket(state, layerId, toUserId);
    const toById = new Map(to.data.map((record) => [record.id, record]));
    const now = Date.now();
    const records = data.map((record) => {
      const original = fromById.get(record.id);
      const existing = toById.get(record.id);
      const floor = Math.max(original?.updatedAt ?? 0, existing?.updatedAt ?? 0) + 1;
      const taken: RecordType = {
        ...record,
        userId: toUserId,
        displayName: toDisplayName,
        takenOverFrom: addTakenOverFrom(existing?.takenOverFrom, ...(record.takenOverFrom ?? []), fromUserId),
        updatedAt: Math.max(deleted ? now : record.updatedAt ?? 0, floor),
        uploaded: record.uploaded ?? original?.uploaded,
      };
      return deleted ? { ...taken, deleted: true } : taken;
    });
    if (from !== undefined && fromUserId !== toUserId) {
      const ids = new Set(data.map((d) => d.id));
      from.data = from.data.filter((record) => !ids.has(record.id));
    }
    upsertRecords(to, records);
  },
  /**
   * 集合の中身を丸ごと置き換える（ファイルの置き換えインポート）。置き換えで消える記録のうちアップロード済みのものは
   * 墓標として残す。墓標が無いと、別端末に残る古い版や、レイヤの共有範囲の付け替えでクラウドの古い版が戻ってくる
   */
  replaceRecordsKeepingTombstonesAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data } = action.payload;
    const idx = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    if (idx === -1) {
      state.push(action.payload);
      return;
    }
    const newIds = new Set(data.map((record) => record.id));
    const now = Date.now();
    const tombstones = (state[idx].data as RecordType[]).flatMap((record) => {
      if (newIds.has(record.id)) return [];
      if (record.deleted === true) return [record];
      return record.uploaded ? [{ ...record, deleted: true, updatedAt: now }] : [];
    });
    state[idx].data = [...data, ...tombstones];
  },
  deleteRecordsAction: (state: DataType[], action: PayloadAction<DataType>) => {
    const { layerId, userId, data: toDelete } = action.payload;
    const idx = state.findIndex((d) => d.layerId === layerId && d.userId === userId);
    if (idx === -1) return;

    const existing = state[idx].data as RecordType[];
    const deleteIds = new Set(toDelete.map((d) => d.id));

    // flatMap で「残すもの」「置き換えるもの」「除外するもの」を一度に処理
    state[idx].data = existing.flatMap((record) => {
      const isTarget = deleteIds.has(record.id);
      if (!isTarget) {
        return record;
      }

      // 引き継いだ記録（takenOverFrom）は未同期でも墓標にする。物理的に消すと、元の持ち主の名義に残る版を
      // 打ち消すものが無くなり、消したはずの記録が取得で戻る
      if (record.uploaded || (record.takenOverFrom?.length ?? 0) > 0) {
        // すでにサーバー同期済み → 論理削除フラグを立てて、coords を undefined にする。サイズを小さくするため。
        return {
          ...record,
          //field: {},
          //coords: undefined,
          userId: userId,
          deleted: true,
          updatedAt: Date.now(),
        };
      } else {
        // 未同期 → 物理削除
        return [];
      }
    });
  },
};

const dataSetSlice = createSlice({
  name: 'dataSet',
  initialState: dataSetInitialState,
  reducers,
  extraReducers: (builder) => {
    // setAllRecordsVisibilityActionのハンドラを追加
    builder.addCase(setAllRecordsVisibilityAction, (state, action) => {
      // Immerを使って状態を効率的に更新
      return produce(state, (draft) => {
        const { layerId, visible } = action.payload;
        draft.forEach((dataSetEntry) => {
          if (dataSetEntry.layerId === layerId) {
            dataSetEntry.data.forEach((record) => {
              // visibleが異なる場合のみ更新（不要な更新を避ける）
              if (record.visible !== visible) {
                record.visible = visible;
              }
            });
          }
        });
      });
    });
  },
});

export const {
  setDataSetAction,
  addDataAction,
  updateDataAction,
  deleteDataAction,
  setRecordSetAction,
  addRecordsAction,
  updateRecordsAction,
  updateRecordsLocallyAction,
  deleteRecordsAction,
  replaceRecordsKeepingTombstonesAction,
  moveRecordsToUserAction,
  takeOverRecordsAction,
} = dataSetSlice.actions;

export default dataSetSlice.reducer;
