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
