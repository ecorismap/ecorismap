/**
 * 3D地形のJS側の重い同期処理（段彩テクスチャの生成など）を1本のレーンへ通す。
 *
 * 1枚で数十msかかる同期処理を並列に投げるとJSスレッドが連続して塞がり、ジェスチャや描画が止まる。
 * 取得（I/O）は並列のまま、計算だけをレーンへ通し、1件ごとにイベントループへ制御を返して操作を割り込ませる。
 * （標高のデコード自体はネイティブで行うのでここを通らない）
 */
let laneTail: Promise<void> = Promise.resolve();

/**
 * 「いまは着手しないでほしい」を伝える述語（3D側がジェスチャ中に立てる）。
 * 1件の処理は途中で中断できない同期処理なので、操作中は着手そのものを見送る。
 */
let shouldDefer: (() => boolean) | null = null;

/** 処理を保留する条件を差し込む（3Dのジェスチャ中など）。nullで解除 */
export const setDemDecodeDeferPredicate = (predicate: (() => boolean) | null): void => {
  shouldDefer = predicate;
};

const DEFER_POLL_MS = 100;
/** 保留の上限（100ms×50=5秒）。操作しっぱなしでもいずれタイルが出るようにする */
const DEFER_MAX_WAITS = 50;

/** 保留条件が解けるまで待つ（上限つき） */
const waitWhileDeferred = async (): Promise<void> => {
  for (let i = 0; i < DEFER_MAX_WAITS && shouldDefer?.() === true; i++) {
    await new Promise((resolve) => setTimeout(resolve, DEFER_POLL_MS));
  }
};

export const runInDecodeLane = <T>(job: () => T): Promise<T> => {
  const result = laneTail.then(async () => {
    // 操作中は着手を見送る（始めてしまうと途中で止められない）
    await waitWhileDeferred();
    return new Promise<T>((resolve, reject) => {
      // setTimeout(0)を挟むことで、前の処理との間にジェスチャ等の保留タスクが処理される
      setTimeout(() => {
        try {
          resolve(job());
        } catch (e) {
          reject(e);
        }
      }, 0);
    });
  });
  // 失敗してもレーンを止めない
  laneTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};
