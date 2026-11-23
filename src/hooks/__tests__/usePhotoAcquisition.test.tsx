/**
 * 写真の取り込み中の操作止めと、付け先が変わったときの後始末（写真監査 P-L3）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { AcquiredPhoto, PhotoAcquisitionResult, usePhotoAcquisition } from '../usePhotoAcquisition';

const mockDeleteLocalPhoto = jest.fn(async (_uri: string) => undefined);
jest.mock('../../utils/Photo', () => ({
  deleteLocalPhoto: (uri: string) => mockDeleteLocalPhoto(uri),
}));

const captured: AcquiredPhoto = {
  uri: 'file:///docs/projects/p1/L/me/EMAP_1.jpg',
  thumbnail: null,
  width: 1,
  height: 1,
  name: 'EMAP_1.jpg',
};

//取り込み（撮影・保存）が終わる時機をテストで決められるようにする
const deferred = () => {
  let resolve: (v: AcquiredPhoto | undefined) => void = () => undefined;
  const promise = new Promise<AcquiredPhoto | undefined>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

type Props = { recordKey: string; addPhoto: (fieldName: string, photo: AcquiredPhoto) => void };

describe('usePhotoAcquisition', () => {
  beforeEach(() => mockDeleteLocalPhoto.mockClear());

  it('取り込みの間は isPhotoProcessing が立ち、終われば最新の addPhoto で付ける', async () => {
    const firstAdd = jest.fn();
    const latestAdd = jest.fn();
    const { result, rerender } = renderHook((props: Props) => usePhotoAcquisition(props), {
      initialProps: { recordKey: 'L/r1', addPhoto: firstAdd },
    });
    const d = deferred();
    let pending: Promise<PhotoAcquisitionResult> = Promise.resolve('none');
    act(() => {
      pending = result.current.acquirePhoto('写真', () => d.promise);
    });
    expect(result.current.isPhotoProcessing).toBe(true);
    expect(result.current.isPhotoProcessingRef.current).toBe(true);

    //取り込み中に入力して addPhoto が作り直された（同じ記録）
    rerender({ recordKey: 'L/r1', addPhoto: latestAdd });
    let res: PhotoAcquisitionResult = 'none';
    await act(async () => {
      d.resolve(captured);
      res = await pending;
    });

    expect(res).toBe('added');
    expect(firstAdd).not.toHaveBeenCalled();
    expect(latestAdd).toHaveBeenCalledWith('写真', captured);
    expect(result.current.isPhotoProcessing).toBe(false);
    expect(mockDeleteLocalPhoto).not.toHaveBeenCalled();
  });

  it('取り込み中に重ねて呼ぶと busy を返し、取り込みは始めない', async () => {
    const { result } = renderHook((props: Props) => usePhotoAcquisition(props), {
      initialProps: { recordKey: 'L/r1', addPhoto: jest.fn() },
    });
    const d = deferred();
    let pending: Promise<PhotoAcquisitionResult> = Promise.resolve('none');
    act(() => {
      pending = result.current.acquirePhoto('写真', () => d.promise);
    });
    const second = jest.fn(async () => captured);
    let res: PhotoAcquisitionResult = 'none';
    await act(async () => {
      res = await result.current.acquirePhoto('写真', second);
    });
    expect(res).toBe('busy');
    expect(second).not.toHaveBeenCalled();

    await act(async () => {
      d.resolve(undefined);
      await pending;
    });
  });

  it('取り込み中に記録が切り替わったら、写真を付けずにファイルを消す', async () => {
    const addPhoto = jest.fn();
    const { result, rerender } = renderHook((props: Props) => usePhotoAcquisition(props), {
      initialProps: { recordKey: 'L/r1', addPhoto },
    });
    const d = deferred();
    let pending: Promise<PhotoAcquisitionResult> = Promise.resolve('none');
    act(() => {
      pending = result.current.acquirePhoto('写真', () => d.promise);
    });
    rerender({ recordKey: 'L/r2', addPhoto });
    let res: PhotoAcquisitionResult = 'none';
    await act(async () => {
      d.resolve(captured);
      res = await pending;
    });

    expect(res).toBe('stale');
    expect(addPhoto).not.toHaveBeenCalled();
    expect(mockDeleteLocalPhoto).toHaveBeenCalledWith(captured.uri);
  });

  it('取り込み中に画面が閉じたら、写真を付けずにファイルを消す', async () => {
    const addPhoto = jest.fn();
    const { result, unmount } = renderHook((props: Props) => usePhotoAcquisition(props), {
      initialProps: { recordKey: 'L/r1', addPhoto },
    });
    const d = deferred();
    let pending: Promise<PhotoAcquisitionResult> = Promise.resolve('none');
    act(() => {
      pending = result.current.acquirePhoto('写真', () => d.promise);
    });
    unmount();
    d.resolve(captured);
    const res = await pending;

    expect(res).toBe('stale');
    expect(addPhoto).not.toHaveBeenCalled();
    expect(mockDeleteLocalPhoto).toHaveBeenCalledWith(captured.uri);
  });

  it('取り込みが例外で終わっても実行中の印を下ろす', async () => {
    const { result } = renderHook((props: Props) => usePhotoAcquisition(props), {
      initialProps: { recordKey: 'L/r1', addPhoto: jest.fn() },
    });
    await act(async () => {
      await expect(
        result.current.acquirePhoto('写真', async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
    });
    expect(result.current.isPhotoProcessing).toBe(false);
    expect(result.current.isPhotoProcessingRef.current).toBe(false);
  });

  it('写真がなければ（キャンセル） none を返し、何も消さない', async () => {
    const addPhoto = jest.fn();
    const { result } = renderHook((props: Props) => usePhotoAcquisition(props), {
      initialProps: { recordKey: 'L/r1', addPhoto },
    });
    let res: PhotoAcquisitionResult = 'added';
    await act(async () => {
      res = await result.current.acquirePhoto('写真', async () => undefined);
    });
    expect(res).toBe('none');
    expect(addPhoto).not.toHaveBeenCalled();
    expect(mockDeleteLocalPhoto).not.toHaveBeenCalled();
  });
  describe('表示と押下の判定を同じ印から決める（PHOTO-10）', () => {
    it('印を下ろしても「処理中...」が描画から消えるまでは押下の判定も処理中のまま', async () => {
      const { result } = renderHook((props: Props) => usePhotoAcquisition(props), {
        initialProps: { recordKey: 'L/r1', addPhoto: jest.fn() },
      });
      const d = deferred();
      let pending: Promise<PhotoAcquisitionResult> = Promise.resolve('none');
      act(() => {
        pending = result.current.acquirePhoto('写真', () => d.promise);
      });
      const guard = result.current.isPhotoProcessingRef;
      //描画前の取り込み完了（act の外で待つので、state の反映は次の描画まで遅れる）
      d.resolve(undefined);
      await pending;
      expect(result.current.isPhotoProcessing).toBe(true);
      expect(guard.current).toBe(true);
      //描画が確定すると表示と判定が同時に下りる
      await act(async () => undefined);
      expect(result.current.isPhotoProcessing).toBe(false);
      expect(result.current.isPhotoProcessingRef.current).toBe(false);
    });

    it('写真は印を下ろす前に付ける（写真の表示と「処理中...」の消去が同じ描画）', async () => {
      let processingWhenAdded: boolean | undefined;
      const holder: { ref?: { readonly current: boolean } } = {};
      const addPhoto = jest.fn(() => {
        processingWhenAdded = holder.ref?.current;
      });
      const { result } = renderHook((props: Props) => usePhotoAcquisition(props), {
        initialProps: { recordKey: 'L/r1', addPhoto },
      });
      holder.ref = result.current.isPhotoProcessingRef;
      await act(async () => {
        await result.current.acquirePhoto('写真', async () => captured);
      });
      expect(addPhoto).toHaveBeenCalledWith('写真', captured);
      expect(processingWhenAdded).toBe(true);
      expect(result.current.isPhotoProcessing).toBe(false);
    });

    it('付け先が変わって捨てるときも、ファイルを消し終えるまで処理中のまま', async () => {
      let processingWhenDeleted: boolean | undefined;
      const holder: { ref?: { readonly current: boolean } } = {};
      mockDeleteLocalPhoto.mockImplementationOnce(async () => {
        processingWhenDeleted = holder.ref?.current;
        return undefined;
      });
      const { result, rerender } = renderHook((props: Props) => usePhotoAcquisition(props), {
        initialProps: { recordKey: 'L/r1', addPhoto: jest.fn() },
      });
      holder.ref = result.current.isPhotoProcessingRef;
      const d = deferred();
      let pending: Promise<PhotoAcquisitionResult> = Promise.resolve('none');
      act(() => {
        pending = result.current.acquirePhoto('写真', () => d.promise);
      });
      rerender({ recordKey: 'L/r2', addPhoto: jest.fn() });
      await act(async () => {
        d.resolve(captured);
        await pending;
      });
      expect(processingWhenDeleted).toBe(true);
      expect(result.current.isPhotoProcessing).toBe(false);
    });
  });

  describe('Web（取り込み中も操作を止めない）', () => {
    type WebProps = Props & { blockWhileAcquiring: boolean };

    it('ピッカーのキャンセルが返らなくても、処理中にならず次の取り込みもできる', async () => {
      const addPhoto = jest.fn();
      const { result } = renderHook((props: WebProps) => usePhotoAcquisition(props), {
        initialProps: { recordKey: 'L/r1', addPhoto, blockWhileAcquiring: false },
      });
      //キャンセルしても resolve も reject もしないピッカー（'cancel' イベントの無いブラウザ）
      act(() => {
        result.current.acquirePhoto('写真', () => new Promise<AcquiredPhoto | undefined>(() => undefined));
      });
      expect(result.current.isPhotoProcessing).toBe(false);
      expect(result.current.isPhotoProcessingRef.current).toBe(false);

      let res: PhotoAcquisitionResult = 'none';
      await act(async () => {
        res = await result.current.acquirePhoto('写真', async () => captured);
      });
      expect(res).toBe('added');
      expect(addPhoto).toHaveBeenCalledWith('写真', captured);
    });

    it('止めなくても、付け先が変わっていれば写真を付けずに消す', async () => {
      const addPhoto = jest.fn();
      const { result, rerender } = renderHook((props: WebProps) => usePhotoAcquisition(props), {
        initialProps: { recordKey: 'L/r1', addPhoto, blockWhileAcquiring: false },
      });
      const d = deferred();
      let pending: Promise<PhotoAcquisitionResult> = Promise.resolve('none');
      act(() => {
        pending = result.current.acquirePhoto('写真', () => d.promise);
      });
      rerender({ recordKey: 'L/r2', addPhoto, blockWhileAcquiring: false });
      let res: PhotoAcquisitionResult = 'none';
      await act(async () => {
        d.resolve(captured);
        res = await pending;
      });
      expect(res).toBe('stale');
      expect(addPhoto).not.toHaveBeenCalled();
      expect(mockDeleteLocalPhoto).toHaveBeenCalledWith(captured.uri);
    });
  });
});
