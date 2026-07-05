import { AppState } from 'react-native';
import autoMergeLevel1 from 'redux-persist/lib/stateReconciler/autoMergeLevel1';
import { storage } from './mmkvStorage';
import { DataType } from '../types';

// ============================================================================
// dataSetのpersist分離（モバイル）
//
// dataSetはアプリ最大のデータのため、redux-persistのpersist:rootから分離し、
// 専用キーへカスタム購読で書き込む。これにより地図パン等のdataSetと無関係な
// 更新でdataSet全体（数MB〜）が再書き込みされるのを防ぐ。
// dataSetのstateは配列のためnested persistReducerは不適（autoMergeLevel1の
// マージ問題）で、trackLogStorage（mmkvStorage.ts）と同様のカスタム方式を採る。
// ============================================================================

const DATASET_KEY = 'persist:dataSet';
const ROOT_KEY = 'persist:root';
const WRITE_THROTTLE_MS = 1000;

/**
 * 旧形式（persist:root内のdataSetキー）から専用キーへの一回限りの移行。
 * store生成前に同期で呼ぶこと。
 * - persist:dataSetキーの存在＝移行済み（冪等）。
 * - 移行元が無い場合はキーを作らない（空マーカーを作ると、後からpersist:rootが
 *   生じた場合の移行機会を塞ぐため）。
 * - persist:rootは変更しない（非破壊。blacklist化後の最初の完全書き込みで
 *   dataSetキーは自然に消える）。
 */
export const migrateDataSetFromPersistRoot = (): void => {
  try {
    if (storage.contains(DATASET_KEY)) return;
    const rootString = storage.getString(ROOT_KEY);
    if (rootString === undefined) return;
    const parsed = JSON.parse(rootString);
    // persist:rootはトップレベルキーごとに個別にJSON.stringifyされたレコード形式。
    // dataSetの値（JSON文字列）をそのままコピーする（再シリアライズ不要）。
    if (typeof parsed?.dataSet !== 'string') return;
    storage.set(DATASET_KEY, parsed.dataSet);
  } catch (e) {
    console.log('[dataSetStorage] migrate error:', e);
  }
};

/** 専用キーからdataSetを同期ロードする。壊れている場合はundefined（初期値フォールバック）。 */
export const loadPersistedDataSet = (): DataType[] | undefined => {
  try {
    const dataSetString = storage.getString(DATASET_KEY);
    if (dataSetString === undefined) return undefined;
    const parsed = JSON.parse(dataSetString);
    return Array.isArray(parsed) ? (parsed as DataType[]) : undefined;
  } catch (e) {
    console.log('[dataSetStorage] load error:', e);
    return undefined;
  }
};

/**
 * REHYDRATE流入からdataSetを除去するstateReconciler。
 * redux-persistのblacklistは「書き込み時」のみ有効でREHYDRATEには効かないため、
 * これが無いと旧形式のpersist:rootにdataSetが残っている移行初回起動で、
 * REHYDRATEが移行済みのdataSet（preloadedState）をstale値で上書きしてしまう。
 */
export const dataSetExcludingReconciler = (
  inboundState: any,
  originalState: any,
  reducedState: any,
  config: any
): any => {
  if (inboundState && typeof inboundState === 'object' && 'dataSet' in inboundState) {
    const { dataSet: _ignored, ...rest } = inboundState;
    return autoMergeLevel1(rest as any, originalState, reducedState, config);
  }
  return autoMergeLevel1(inboundState, originalState, reducedState, config);
};

type DataSetStore = {
  getState: () => { dataSet: DataType[] };
  subscribe: (listener: () => void) => () => void;
};

/**
 * dataSetの変更を監視し、専用キーへ書き込む購読を登録する。
 * - 参照比較で変更検知（reducerは変更時に必ず新しい配列を返す）。
 * - trailing-edgeスロットル: 最初の変更から1000ms後に最新stateを書く。
 *   （デバウンスだと連続編集中に書き込みが起きず、kill時の損失窓が伸びるため）
 * - バックグラウンド移行時は保留分を即フラッシュしてkill時の損失を防ぐ。
 */
export const attachDataSetPersistSubscriber = (store: DataSetStore): (() => void) => {
  let lastPersisted = store.getState().dataSet;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const current = store.getState().dataSet;
    if (current === lastPersisted) return;
    try {
      storage.set(DATASET_KEY, JSON.stringify(current));
      lastPersisted = current;
    } catch (e) {
      console.log('[dataSetStorage] write error:', e);
    }
  };

  const unsubscribe = store.subscribe(() => {
    if (store.getState().dataSet === lastPersisted) return;
    if (timer === null) {
      timer = setTimeout(flush, WRITE_THROTTLE_MS);
    }
  });

  try {
    AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (timer !== null) {
          clearTimeout(timer);
          flush();
        }
      }
    });
  } catch (e) {
    // テスト環境等でAppStateが利用できない場合はスロットル書き込みのみで動作する
    console.log('[dataSetStorage] AppState unavailable:', e);
  }

  return unsubscribe;
};
