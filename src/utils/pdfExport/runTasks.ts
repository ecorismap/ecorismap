//PDF作成の中止。ユーザーが中止ボタンを押したらcancelledをtrueにする
export type CancelToken = { cancelled: boolean };

export class PdfCancelledError extends Error {
  constructor() {
    super('PDF export cancelled');
    this.name = 'PdfCancelledError';
  }
}

/**
 * itemsを同時にconcurrency件までの並列で処理し、入力と同じ順の結果を返す。
 * 1件終わるごとにonProgress(完了数, 全件数)を呼ぶ。
 * 中止されたら新しい処理を始めず、実行中の処理が終わるのを待ってからPdfCancelledErrorを投げる。
 * 待つのは、抜けた後に実行中の処理から進捗が届いて表示が戻るのを防ぐため
 * （中止直後の画面に、終わったはずの進捗が残らないように）
 */
export const runTasks = async <T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
  options: { cancel?: CancelToken; onProgress?: (done: number, total: number) => void } = {}
): Promise<R[]> => {
  const { cancel, onProgress } = options;
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length && !cancel?.cancelled) {
      const index = next++;
      results[index] = await task(items[index], index);
      done++;
      if (!cancel?.cancelled) onProgress?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (cancel?.cancelled) throw new PdfCancelledError();
  return results;
};
