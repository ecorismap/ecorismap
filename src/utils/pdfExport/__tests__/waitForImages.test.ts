import { waitForImages } from '../waitForImages';

//読み込み状態を後から変えられる画像の代わり
const fakeImage = (complete = false, naturalWidth = 0) => {
  const listeners: Record<string, (() => void)[]> = { load: [], error: [] };
  const img = {
    complete,
    naturalWidth,
    removed: false,
    addEventListener: (type: 'load' | 'error', l: () => void) => listeners[type].push(l),
    remove: () => {
      img.removed = true;
    },
    load: () => {
      img.complete = true;
      img.naturalWidth = 256;
      listeners.load.forEach((l) => l());
    },
    fail: () => {
      img.complete = true;
      listeners.error.forEach((l) => l());
    },
  };
  return img;
};

describe('waitForImages', () => {
  it('すべての画像の読み込みが終わるまで待つ', async () => {
    const a = fakeImage();
    const b = fakeImage();
    let done = false;
    const p = waitForImages([a, b]).then((r) => {
      done = true;
      return r;
    });
    a.load();
    await Promise.resolve();
    expect(done).toBe(false);
    b.load();
    expect(await p).toEqual({ loaded: 2, removed: 0 });
  });

  it('読み込めなかった画像を取り除く（壊れた画像を印刷しない）', async () => {
    const ok = fakeImage();
    const ng = fakeImage();
    const p = waitForImages([ok, ng]);
    ok.load();
    ng.fail();
    expect(await p).toEqual({ loaded: 1, removed: 1 });
    expect(ng.removed).toBe(true);
    expect(ok.removed).toBe(false);
  });

  it('読み込み済みの画像は待たない', async () => {
    expect(await waitForImages([fakeImage(true, 256)])).toEqual({ loaded: 1, removed: 0 });
  });

  it('画像が無ければすぐ終わる（データ一覧）', async () => {
    expect(await waitForImages([])).toEqual({ loaded: 0, removed: 0 });
  });

  it('時間切れなら読み込み中の画像を待たずに進み、取り除かない', async () => {
    jest.useFakeTimers();
    const slow = fakeImage();
    const p = waitForImages([slow], 1000);
    jest.advanceTimersByTime(1000);
    expect(await p).toEqual({ loaded: 0, removed: 0 });
    expect(slow.removed).toBe(false);
    jest.useRealTimers();
  });
});
