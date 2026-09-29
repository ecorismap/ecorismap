//テストでDOMを使わずに済むよう、必要な部分だけの型にする
type ImageLike = {
  complete: boolean;
  naturalWidth: number;
  addEventListener: (type: 'load' | 'error', listener: () => void, options?: { once: boolean }) => void;
  remove: () => void;
};

/**
 * 印刷用ウィンドウの画像（地図タイル）がすべて読み込み終わるか失敗するまで待ち、失敗した画像を取り除く。
 * 固定時間待ってから印刷すると、回線が遅いときにタイルが欠け、速いときは無駄に待つため。
 * 取り除くのは、壊れた画像のアイコンを印刷しないため（タイルが無い範囲の404など）。
 * timeoutMsを過ぎたら読み込み中のものは待たずに進める（読み込み中の画像は取り除かず、間に合えば印刷される）。
 * 戻り値は読み込めた枚数と、取り除いた枚数
 */
export const waitForImages = async (images: ArrayLike<ImageLike>, timeoutMs = 60000) => {
  const list = Array.from(images);
  const pending = list.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) return resolve();
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([Promise.all(pending), timeout]);
  if (timer !== undefined) clearTimeout(timer);

  const failed = list.filter((img) => img.complete && img.naturalWidth === 0);
  failed.forEach((img) => img.remove());
  return { loaded: list.filter((img) => img.complete && img.naturalWidth > 0).length, removed: failed.length };
};
