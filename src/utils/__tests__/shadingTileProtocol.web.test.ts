import { clearShadingTileCache, loadElevationTile, ShadingTileConfig } from '../shadingTileProtocol.web';

jest.mock('fast-png', () => ({ encode: jest.fn() }));

type FetchCall = { url: string; signal: AbortSignal; resolve: (r: Response) => void; reject: (e: Error) => void };

const calls: FetchCall[] = [];
const config: ShadingTileConfig = { u: 'https://dem.example.com/{z}/{x}/{y}.png', t: 1 };

const okResponse = () => ({ ok: true, status: 200, blob: async () => new Blob([]) } as unknown as Response);
const statusResponse = (status: number) => ({ ok: false, status, blob: async () => new Blob([]) } as unknown as Response);

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.fetch = jest.fn(
    (url: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((resolve, reject) => {
        calls.push({ url, signal: init.signal, resolve, reject });
        init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
      })
  );
  g.createImageBitmap = jest.fn(async () => ({ width: 2, height: 2, close: () => undefined }));
  g.OffscreenCanvas = class {
    getContext() {
      return { drawImage: () => undefined, getImageData: () => ({ data: new Uint8ClampedArray(2 * 2 * 4) }) };
    }
  };
});

beforeEach(() => {
  calls.length = 0;
  clearShadingTileCache();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('loadElevationTile の取得共有', () => {
  it('最初の要求者が中止しても、待っている兄弟は結果を受け取る', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const pa = loadElevationTile(config, 10, 1, 2, a.signal);
    const pb = loadElevationTile(config, 10, 1, 2, b.signal);
    await flush();
    expect(calls).toHaveLength(1);
    a.abort();
    expect(await pa).toBeNull();
    expect(calls[0].signal.aborted).toBe(false);
    calls[0].resolve(okResponse());
    expect(await pb).toBeInstanceOf(Float32Array);
  });

  it('全員が中止したら取得を中止し、次の要求は取り直す', async () => {
    const a = new AbortController();
    const b = new AbortController();
    const pa = loadElevationTile(config, 10, 3, 4, a.signal);
    const pb = loadElevationTile(config, 10, 3, 4, b.signal);
    await flush();
    a.abort();
    b.abort();
    expect(await pa).toBeNull();
    expect(await pb).toBeNull();
    expect(calls[0].signal.aborted).toBe(true);

    const c = new AbortController();
    const pc = loadElevationTile(config, 10, 3, 4, c.signal);
    await flush();
    expect(calls).toHaveLength(2);
    calls[1].resolve(okResponse());
    expect(await pc).toBeInstanceOf(Float32Array);
  });

  it('404 は覚え、5xx・429・通信エラーは覚えずに取り直す', async () => {
    const signal = new AbortController().signal;
    const p404 = loadElevationTile(config, 9, 0, 0, signal);
    await flush();
    calls[0].resolve(statusResponse(404));
    expect(await p404).toBeNull();
    expect(await loadElevationTile(config, 9, 0, 0, signal)).toBeNull();
    expect(calls).toHaveLength(1);

    for (const fail of [
      (c: FetchCall) => c.resolve(statusResponse(503)),
      (c: FetchCall) => c.resolve(statusResponse(429)),
      (c: FetchCall) => c.reject(new TypeError('Failed to fetch')),
    ]) {
      const before = calls.length;
      const p = loadElevationTile(config, 9, 1, 1, signal);
      await flush();
      expect(calls).toHaveLength(before + 1);
      fail(calls[before]);
      expect(await p).toBeNull();
    }
    const last = loadElevationTile(config, 9, 1, 1, signal);
    await flush();
    calls[calls.length - 1].resolve(okResponse());
    expect(await last).toBeInstanceOf(Float32Array);
    //成功は覚える
    expect(await loadElevationTile(config, 9, 1, 1, signal)).toBeInstanceOf(Float32Array);
    expect(calls).toHaveLength(5);
  });

  it('中止済みの signal では取得しない', async () => {
    const a = new AbortController();
    a.abort();
    expect(await loadElevationTile(config, 8, 0, 0, a.signal)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
