import reducer, { applyUploadedPhotosAction } from '../dataSet';
import { DataType, PhotoType, RecordType } from '../../types';

// 写真監査 P-M16: 上げ終えた写真の url/key だけを手元に書き込む（uri は残す）
const photo = (id: string, extra: Partial<PhotoType> = {}): PhotoType => ({
  id,
  name: `${id}.jpg`,
  uri: `file:///photos/${id}.jpg`,
  url: null,
  key: null,
  width: 1,
  height: 1,
  thumbnail: null,
  ...extra,
});
const rec = (id: string, userId: string, photos: PhotoType[]): RecordType => ({
  id,
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 135 },
  field: { 写真: photos, name: 'x' },
  updatedAt: 100,
});

describe('applyUploadedPhotosAction', () => {
  test('対象の記録の写真に url/key を入れ、uri・updatedAt は変えない', () => {
    const state: DataType[] = [{ layerId: 'l1', userId: 'me', data: [rec('r1', 'me', [photo('p1'), photo('p2')])] }];
    const next = reducer(
      state,
      applyUploadedPhotosAction({ layerId: 'l1', records: { r1: { p1: { url: 'https://x/p1', key: 'k1' } } } })
    );
    const photos = next[0].data[0].field['写真'] as PhotoType[];
    expect(photos[0]).toEqual({ ...photo('p1'), url: 'https://x/p1', key: 'k1' });
    expect(photos[1]).toEqual(photo('p2'));
    expect(next[0].data[0].updatedAt).toBe(100);
  });

  test('他の名義の集合にある記録（COMMON の統合）も更新する。別のレイヤ・別の記録は変えない', () => {
    const state: DataType[] = [
      { layerId: 'l1', userId: 'other', data: [rec('r1', 'other', [photo('p1')]), rec('r2', 'other', [photo('p1')])] },
      { layerId: 'l2', userId: 'me', data: [rec('r1', 'me', [photo('p1')])] },
    ];
    const next = reducer(
      state,
      applyUploadedPhotosAction({ layerId: 'l1', records: { r1: { p1: { url: 'https://x/p1', key: 'k1' } } } })
    );
    expect((next[0].data[0].field['写真'] as PhotoType[])[0].url).toBe('https://x/p1');
    expect((next[0].data[1].field['写真'] as PhotoType[])[0].url).toBeNull();
    expect((next[1].data[0].field['写真'] as PhotoType[])[0].url).toBeNull();
  });

  test('既に url が入っている写真は書き換えない', () => {
    const state: DataType[] = [
      { layerId: 'l1', userId: 'me', data: [rec('r1', 'me', [photo('p1', { url: 'https://old', key: 'old' })])] },
    ];
    const next = reducer(
      state,
      applyUploadedPhotosAction({ layerId: 'l1', records: { r1: { p1: { url: 'https://x/p1', key: 'k1' } } } })
    );
    expect((next[0].data[0].field['写真'] as PhotoType[])[0]).toMatchObject({ url: 'https://old', key: 'old' });
  });
});
