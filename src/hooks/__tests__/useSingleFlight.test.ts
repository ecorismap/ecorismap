/**
 * 保存の連打で同じ処理（テンプレートの写しの写真のコピー）が二重に走らない
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { useSingleFlight } from '../useSingleFlight';

describe('useSingleFlight', () => {
  it('実行中の呼び出しは走らせず、終わったらまた呼べる', async () => {
    let resolve: () => void = () => undefined;
    const fn = jest.fn(() => new Promise<void>((r) => (resolve = r)));
    const { result } = renderHook(() => useSingleFlight(fn));

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.run();
    });
    expect(result.current.isRunning).toBe(true);
    await act(async () => {
      await result.current.run();
      await result.current.run();
    });
    expect(fn).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve();
      await first;
    });
    expect(result.current.isRunning).toBe(false);
    await act(async () => {
      const second = result.current.run();
      resolve();
      await second;
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('失敗しても実行中の印を戻す', async () => {
    const fn = jest.fn(async () => {
      throw new Error('x');
    });
    const { result } = renderHook(() => useSingleFlight(fn));
    await act(async () => {
      await expect(result.current.run()).rejects.toThrow('x');
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isRunningRef.current).toBe(false);
  });
});
