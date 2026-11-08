import JSZip from 'jszip';
import { ExportCancelledError, generateZipCancellable, throwIfExportCancelled } from '../zipProgress';

// 圧縮が効かない（写真相当の）データ。zipの書き出しが複数チャンクに分かれる大きさにする
const randomBase64 = (bytes: number) => {
  const buf = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  return buf.toString('base64');
};

const makeZip = () => {
  const zip = new JSZip();
  zip.file('a.txt', 'hello');
  zip.file('photo.jpg', randomBase64(512 * 1024), { base64: true, compression: 'STORE' });
  return zip;
};

describe('generateZipCancellable', () => {
  it('generateAsyncと同じく読み戻せるzipを作り、進捗を100まで通知する', async () => {
    const percents: number[] = [];
    const base64 = await generateZipCancellable(
      makeZip(),
      { type: 'base64', compression: 'DEFLATE' },
      { onProgress: (p) => percents.push(p) }
    );
    const loaded = await JSZip.loadAsync(base64, { base64: true });
    expect(await loaded.file('a.txt')?.async('string')).toBe('hello');
    expect(percents.length).toBeGreaterThan(0);
    expect(percents[percents.length - 1]).toBe(100);
  });

  it('書き出しの途中で中止するとExportCancelledErrorで終わる', async () => {
    const cancel = { cancelled: false };
    const promise = generateZipCancellable(
      makeZip(),
      { type: 'base64' },
      // 最初の進捗が届いた時点で中止を押したことにする
      { cancel, onProgress: () => (cancel.cancelled = true) }
    );
    await expect(promise).rejects.toBeInstanceOf(ExportCancelledError);
  });

  it('始める前に中止済みなら書き出さない', async () => {
    await expect(
      generateZipCancellable(makeZip(), { type: 'base64' }, { cancel: { cancelled: true } })
    ).rejects.toBeInstanceOf(ExportCancelledError);
  });
});

describe('throwIfExportCancelled', () => {
  it('中止されていなければ何もしない', () => {
    expect(() => throwIfExportCancelled()).not.toThrow();
    expect(() => throwIfExportCancelled({ cancel: { cancelled: false } })).not.toThrow();
    expect(() => throwIfExportCancelled({ cancel: { cancelled: true } })).toThrow(ExportCancelledError);
  });
});
