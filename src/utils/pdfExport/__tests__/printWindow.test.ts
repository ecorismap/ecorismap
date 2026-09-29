import { printAndCloseWindow } from '../printWindow';

const createWindow = () => {
  let afterprint: (() => void) | undefined;
  const calls: string[] = [];
  return {
    calls,
    fireAfterprint: () => afterprint?.(),
    addEventListener: (_type: 'afterprint', listener: () => void) => {
      afterprint = listener;
    },
    focus: () => {
      calls.push('focus');
    },
    print: () => {
      calls.push('print');
    },
    close: () => {
      calls.push('close');
    },
  };
};

describe('printAndCloseWindow', () => {
  it('print()がすぐ戻っても（Chrome）、印刷が終わるまで閉じない', async () => {
    const w = createWindow();
    let done = false;
    const promise = printAndCloseWindow(w).then(() => (done = true));
    await Promise.resolve();
    expect(w.calls).toEqual(['focus', 'print']);
    expect(done).toBe(false);
    w.fireAfterprint();
    await promise;
    expect(w.calls).toEqual(['focus', 'print', 'close']);
  });

  it('print()の中でafterprintが発火するブラウザでも閉じる', async () => {
    const w = createWindow();
    w.print = () => {
      w.calls.push('print');
      w.fireAfterprint();
    };
    await printAndCloseWindow(w);
    expect(w.calls).toEqual(['focus', 'print', 'close']);
  });
});
