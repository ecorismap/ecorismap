/**
 * 非同期関数を「前の呼び出しが終わってから次を始める」形に包む。
 * 前の呼び出しが失敗しても次は走る（失敗は呼び出し元にだけ返す）。
 */
export const serializeAsync = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args: A): Promise<R> => {
    const run = tail.then(() => fn(...args));
    tail = run.catch(() => undefined);
    return run;
  };
};
