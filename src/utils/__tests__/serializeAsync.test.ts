import { serializeAsync } from '../serializeAsync';

describe('serializeAsync', () => {
  it('前の呼び出しが終わるまで次を始めない', async () => {
    const log: string[] = [];
    let release: () => void = () => undefined;
    const fn = serializeAsync(async (name: string) => {
      log.push(`start ${name}`);
      if (name === 'a') await new Promise<void>((resolve) => (release = resolve));
      log.push(`end ${name}`);
      return name;
    });
    const a = fn('a');
    const b = fn('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(['start a']);
    release();
    await expect(a).resolves.toBe('a');
    await expect(b).resolves.toBe('b');
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('前の呼び出しが失敗しても次は走り、失敗はその呼び出し元にだけ返る', async () => {
    const fn = serializeAsync(async (fail: boolean) => {
      if (fail) throw new Error('x');
      return 'ok';
    });
    const a = fn(true);
    const b = fn(false);
    await expect(a).rejects.toThrow('x');
    await expect(b).resolves.toBe('ok');
  });
});
