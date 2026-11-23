import { AppState, AppStateStatus } from 'react-native';

type Flushable = { flush: () => Promise<unknown> };

/**
 * アプリがバックグラウンドへ移るときに、redux-persistの書き込み待ちを即座に書き出す。
 *
 * redux-persistはthrottle指定時、変更されたトップレベルキーを1周期に1つずつ処理し、
 * キューが空になって初めてストレージへ書く。設定・レイヤなど複数キーが変わると書き込みまで
 * 数秒かかり、その間にアプリをkillすると変更が失われる（更新情報のOKが保存されず毎回出る等）。
 * killは必ずバックグラウンド移行を経るため、そこでflushすれば失われない。
 */
export const attachPersistFlushOnBackground = (persistor: Flushable): (() => void) => {
  try {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        persistor.flush().catch((e) => console.log('[persistFlush] flush error:', e));
      }
    });
    return () => subscription.remove();
  } catch (e) {
    // テスト環境等でAppStateが利用できない場合はスロットル書き込みのみで動作する
    console.log('[persistFlush] AppState unavailable:', e);
    return () => {};
  }
};

/**
 * 永続化の書き込み待ち（redux-persist の persist:root と、分離した persist:dataSet）を、登録元を知らずに一度に書き出す。
 * 複数のスライスを置き換える処理（プロジェクトを閉じる・バックアップの復元・ファイルを開く・データの消去）の直後に呼ぶ。
 * 何もしないと persist:root はキー数×約1秒、dataSet は約1秒遅れて書かれ、その間に落ちると
 * 「同期の基準値は閉じる前のまま、記録は空」のような食い違った状態で起動する（設定監査 S-L3）。
 * 登録は store 側（store.ts・store.web.ts・dataSetStorage.ts）が行うので、フックは store を import せずに呼べる
 */
type PersistFlusher = () => Promise<unknown> | void;

const persistFlushers = new Set<PersistFlusher>();

export const registerPersistFlusher = (flusher: PersistFlusher): (() => void) => {
  persistFlushers.add(flusher);
  return () => {
    persistFlushers.delete(flusher);
  };
};

/** 登録された書き出しをすべて行う。失敗しても投げない（書き込みのタイミングを早めるだけで、本来の操作は止めない） */
export const flushPersistence = async (): Promise<void> => {
  await Promise.all(
    [...persistFlushers].map(async (flusher) => {
      try {
        await flusher();
      } catch (e) {
        console.log('[persistFlush] flush error:', e);
      }
    })
  );
};
