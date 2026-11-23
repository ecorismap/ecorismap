/**
 * Storage の写真を消す前の参照確認と、消すパスの uid（写真監査 P-M9・P-M10）
 */
import {
  collectPhotoReferences,
  isPhotoReferenced,
  photoStorageOwnerUid,
  recordsOutsideUpload,
} from '../photoReferences';
import { DataType, LayerType, PhotoType, RecordType } from '../../types';

const fields = [{ id: 'f', name: '写真', format: 'PHOTO' }] as unknown as LayerType['field'];
const photo = (id: string, extra: Partial<PhotoType> = {}): PhotoType => ({
  id,
  name: 'a.jpg',
  uri: 'file:///a.jpg',
  url: `https://x/${id}`,
  key: 'k',
  width: 1,
  height: 1,
  thumbnail: null,
  ...extra,
});
const record = (id: string, photos: PhotoType[], extra: Partial<RecordType> = {}) =>
  ({ id, userId: 'me', field: { 写真: photos }, ...extra } as unknown as RecordType);

describe('collectPhotoReferences', () => {
  it('送る集合では、消した記録と外した写真を数えない', () => {
    const refs = collectPhotoReferences(
      [record('a', [photo('p1')]), record('b', [photo('p2')], { deleted: true }), record('c', [photo('p3', { uri: undefined })])],
      fields
    );
    expect([...refs.ids]).toEqual(['p1']);
    expect([...refs.urls]).toEqual(['https://x/p1']);
  });

  it('送らない集合（conservative）は、墓標や外した印の写真も数える', () => {
    const refs = collectPhotoReferences(
      [record('b', [photo('p2')], { deleted: true }), record('c', [photo('p3', { uri: undefined })])],
      fields,
      undefined,
      { conservative: true }
    );
    expect(isPhotoReferenced({ id: 'p2', url: null }, refs)).toBe(true);
    expect(isPhotoReferenced({ id: 'other', url: 'https://x/p3' }, refs)).toBe(true);
    expect(isPhotoReferenced({ id: 'other', url: null }, refs)).toBe(false);
  });
});

describe('recordsOutsideUpload', () => {
  const dataSet = (['template', 'me', 'other', undefined] as (string | undefined)[]).map(
    (userId) => ({ layerId: 'L', userId, data: [record(String(userId), [])] } as DataType)
  );
  const ids = (records: RecordType[]) => records.map((r) => r.id).sort();
  const layerOf = (permission: string) => ({ id: 'L', permission } as unknown as LayerType);

  it('通常のアップロードでは、テンプレートと他人の集合が送らない側', () => {
    expect(ids(recordsOutsideUpload(dataSet, layerOf('PUBLIC'), 'me', false))).toEqual(['other', 'template']);
  });
  it('テンプレートのアップロードでは、他人の集合だけが送らない側', () => {
    expect(ids(recordsOutsideUpload(dataSet, layerOf('PUBLIC'), 'me', true))).toEqual(['other']);
  });
  it('COMMON は全員分を送るので、テンプレートだけが送らない側', () => {
    expect(ids(recordsOutsideUpload(dataSet, layerOf('COMMON'), 'me', false))).toEqual(['template']);
  });
});

describe('photoStorageOwnerUid', () => {
  const url = (project: string, layer: string, uid: string, photoId: string) =>
    `https://firebasestorage.googleapis.com/v0/b/b/o/projects%2F${project}%2FPHOTO%2F${layer}%2F${uid}%2F${photoId}?alt=media&token=t`;

  it('url のパスから写真を上げた人の uid を読む', () => {
    expect(photoStorageOwnerUid({ id: 'p1', url: url('proj', 'L', 'other', 'p1') }, 'proj', 'L', 'me')).toBe('other');
  });
  it('プロジェクト・レイヤ・写真 id が一致しない url や、url が無いときは自分の uid', () => {
    expect(photoStorageOwnerUid({ id: 'p1', url: url('proj2', 'L', 'other', 'p1') }, 'proj', 'L', 'me')).toBe('me');
    expect(photoStorageOwnerUid({ id: 'p1', url: url('proj', 'L2', 'other', 'p1') }, 'proj', 'L', 'me')).toBe('me');
    expect(photoStorageOwnerUid({ id: 'p1', url: url('proj', 'L', 'other', 'p2') }, 'proj', 'L', 'me')).toBe('me');
    expect(photoStorageOwnerUid({ id: 'p1', url: null }, 'proj', 'L', 'me')).toBe('me');
    expect(photoStorageOwnerUid({ id: 'p1', url: '%E0%A4%A' }, 'proj', 'L', 'me')).toBe('me');
  });
});
