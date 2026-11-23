import { MutableRefObject, useCallback, useRef, useState } from 'react';

/**
 * 非同期の処理を、実行中は重ねて走らせない。実行中の呼び出しは何もせずに戻る。
 * 連打で同じ処理が二重に走ると、待っている間ストアが変わらないために同じ仕事（写真のコピーなど）を
 * 二重にしてしまう。ref で再入を防ぎ（state は次の描画まで変わらない）、isRunning でボタンを無効にする
 */
export const useSingleFlight = <A extends unknown[]>(
  fn: (...args: A) => Promise<unknown>
): { run: (...args: A) => Promise<void>; isRunning: boolean; isRunningRef: MutableRefObject<boolean> } => {
  const isRunningRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const run = useCallback(
    async (...args: A) => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      setIsRunning(true);
      try {
        await fn(...args);
      } finally {
        isRunningRef.current = false;
        setIsRunning(false);
      }
    },
    [fn]
  );
  return { run, isRunning, isRunningRef };
};
