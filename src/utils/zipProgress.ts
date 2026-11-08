import JSZip from 'jszip';

/** エクスポートが中止されたことを表す。呼び出し側で失敗と区別して扱う */
export class ExportCancelledError extends Error {
  constructor() {
    super('export cancelled');
    this.name = 'ExportCancelledError';
  }
}

export type ExportZipOptions = {
  // trueにすると次の区切り（ファイル1つ・zipの書き出し途中）で中止する
  cancel?: { cancelled: boolean };
  // zipの書き出しの進み具合（0〜100）
  onProgress?: (percent: number) => void;
};

export const throwIfExportCancelled = (options?: ExportZipOptions) => {
  if (options?.cancel?.cancelled === true) throw new ExportCancelledError();
};

/**
 * generateAsyncと同じ結果を返しつつ、進捗の通知と途中での中止をできるようにする。
 * generateAsyncは一度始めると止められないため、内部ストリームを直接動かして中止時はpauseする
 */
export const generateZipCancellable = (
  zip: JSZip,
  generateOptions: JSZip.JSZipGeneratorOptions<'base64'>,
  options?: ExportZipOptions
): Promise<string> => {
  if (options?.cancel?.cancelled === true) return Promise.reject(new ExportCancelledError());
  const stream = zip.generateInternalStream(generateOptions);
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    stream
      .accumulate((meta) => {
        if (settled) return;
        if (options?.cancel?.cancelled === true) {
          settled = true;
          stream.pause();
          reject(new ExportCancelledError());
          return;
        }
        options?.onProgress?.(meta.percent);
      })
      .then((result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        reject(e);
      });
  });
};
