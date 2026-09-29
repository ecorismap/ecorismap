import { PdfCancelledError, runTasks } from '../runTasks';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('runTasks', () => {
  it('入力と同じ順で結果を返す（完了順に関係なく）', async () => {
    const results = await runTasks([30, 10, 20], 3, (ms) => new Promise<number>((r) => setTimeout(() => r(ms), ms)));
    expect(results).toEqual([30, 10, 20]);
  });

  it('同時実行数を超えない', async () => {
    let running = 0;
    let max = 0;
    await runTasks(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running++;
      max = Math.max(max, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
    });
    expect(max).toBe(4);
  });

  it('1件終わるごとに進捗を知らせる', async () => {
    const progress: string[] = [];
    await runTasks([1, 2, 3], 2, async (x) => x, { onProgress: (d, n) => progress.push(`${d}/${n}`) });
    expect(progress).toEqual(['1/3', '2/3', '3/3']);
  });

  it('中止されたら新しい処理を始めず、実行中の処理を待ってからPdfCancelledErrorで抜ける', async () => {
    const cancel = { cancelled: false };
    const gate = deferred();
    const started: number[] = [];
    let settled = false;
    const p = runTasks(
      [0, 1, 2, 3, 4],
      2,
      async (i) => {
        started.push(i);
        if (i === 1) {
          cancel.cancelled = true;
          await gate.promise;
        }
      },
      { cancel }
    ).finally(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    //実行中（i=1）が終わるまでは抜けない
    expect(settled).toBe(false);
    gate.resolve();
    await expect(p).rejects.toBeInstanceOf(PdfCancelledError);
    expect(started).toEqual([0, 1]);
  });

  it('中止した後は進捗を知らせない（終わった進捗が画面に戻らない）', async () => {
    const cancel = { cancelled: false };
    const progress: number[] = [];
    const p = runTasks(
      [0, 1, 2],
      3,
      async (i) => {
        if (i === 0) cancel.cancelled = true;
        await new Promise((r) => setTimeout(r, 1));
      },
      { cancel, onProgress: (d) => progress.push(d) }
    );
    await expect(p).rejects.toBeInstanceOf(PdfCancelledError);
    expect(progress).toEqual([]);
  });

  it('空なら何もしない', async () => {
    expect(await runTasks([], 4, async () => 1)).toEqual([]);
  });
});
