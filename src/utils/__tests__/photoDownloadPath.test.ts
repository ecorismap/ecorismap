jest.mock('../../constants/AppConstants', () => ({ PHOTO_FOLDER: 'file:///doc/PHOTO' }));
import {
  findLocalPhotoUri,
  isCollisionFreePhotoFilename,
  isUniquePhotoName,
  photoDownloadTarget,
  photoIdFromUrl,
  photoUploaderUid,
} from '../photoDownloadPath';

const base = { projectId: 'P', layerId: 'L', ownUid: 'me', photoId: 'ph1', photoName: 'EMAP_1.jpg' };

describe('photoDownloadTarget（同期監査 M4）', () => {
  test('自分の記録は従来どおり自分のフォルダに写真名で置く', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'me' })).toEqual({ folder: 'file:///doc/PHOTO/P/L/me', filename: 'EMAP_1.jpg' });
    expect(photoDownloadTarget({ ...base, recordUserId: undefined })).toEqual({ folder: 'file:///doc/PHOTO/P/L/me', filename: 'EMAP_1.jpg' });
  });

  test('他人の記録は持ち主のフォルダに id 付きの名前で置く', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'other' })).toEqual({
      folder: 'file:///doc/PHOTO/P/L/other',
      filename: 'ph1_EMAP_1.jpg',
    });
  });

  test('テンプレートの写真は自分のフォルダに id 付きで置く', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'template' })).toEqual({
      folder: 'file:///doc/PHOTO/P/L/me',
      filename: 'ph1_EMAP_1.jpg',
    });
  });

  test('パスに使えない名前・持ち主のときは保存しない', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'other', photoName: '../x.jpg' })).toBeUndefined();
    expect(photoDownloadTarget({ ...base, recordUserId: '../evil' })).toEqual({
      folder: 'file:///doc/PHOTO/P/L/me',
      filename: 'ph1_EMAP_1.jpg',
    });
    expect(photoDownloadTarget({ ...base, recordUserId: '../evil', photoId: '../id' })).toBeUndefined();
  });
});

describe('アップロードした人で保存先を決める（再レビュー）', () => {
  const url = (uid: string) =>
    `https://firebasestorage.googleapis.com/v0/b/bkt/o/projects%2FP%2FPHOTO%2FL%2F${uid}%2Fph1?alt=media&token=t`;

  test('URL から写真をアップロードした人を読む', () => {
    expect(photoUploaderUid(url('other'))).toBe('other');
    expect(photoUploaderUid('http://localhost:9199/v0/b/bkt/o/projects%2FP%2FPHOTO%2FL%2Fme%2Fph1?alt=media')).toBe('me');
    expect(photoUploaderUid('https://example.com/a.jpg')).toBeUndefined();
    expect(photoUploaderUid(null)).toBeUndefined();
  });

  test('他人が撮った写真は、記録が編集で自分のものに替わっていても、撮った人のフォルダに id 付きで置く', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'me', photoUrl: url('other') })).toEqual({
      folder: 'file:///doc/PHOTO/P/L/other',
      filename: 'ph1_EMAP_1.jpg',
    });
  });

  test('自分が撮った写真は、記録が他人のものに替わっていても、自分の原画をそのまま使う', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'other', photoUrl: url('me') })).toEqual({
      folder: 'file:///doc/PHOTO/P/L/me',
      filename: 'EMAP_1.jpg',
    });
  });
});

describe('同じアカウントの2台で同じ秒に撮った写真（写真監査 P-L15）', () => {
  const url = 'https://firebasestorage.googleapis.com/v0/b/bkt/o/projects%2FP%2FPHOTO%2FL%2Fme%2F01JABCDEFGHJKMNPQRSTVWXYZ0?alt=media';

  test('URL から写真 id を読む', () => {
    expect(photoIdFromUrl(url)).toBe('01JABCDEFGHJKMNPQRSTVWXYZ0');
    expect(photoIdFromUrl('https://example.com/a.jpg')).toBeUndefined();
    expect(photoIdFromUrl(undefined)).toBeUndefined();
  });

  test('一意な文字を付けた名前と id 付きの名前だけを、重ならない名前とみなす', () => {
    expect(isUniquePhotoName('EMAP_20261123_100000_7K3QZ9.jpg')).toBe(true);
    expect(isUniquePhotoName('EMAP_20261123_100000.jpg')).toBe(false);
    expect(isUniquePhotoName('EMAP_20261123_100000_7k3qz9.jpg')).toBe(false);
    expect(isCollisionFreePhotoFilename('EMAP_20261123_100000_7K3QZ9.jpg')).toBe(true);
    expect(isCollisionFreePhotoFilename('01JABCDEFGHJKMNPQRSTVWXYZ0_EMAP_1.jpg')).toBe(true);
    expect(isCollisionFreePhotoFilename('ph1_EMAP_1.jpg', 'ph1')).toBe(true);
    expect(isCollisionFreePhotoFilename('EMAP_1.jpg', 'ph1')).toBe(false);
  });

  test('以前の名前の自分の写真は、この端末で同じ id の写真がそのファイルを指していれば使い回してよい', () => {
    expect(
      photoDownloadTarget({ ...base, recordUserId: 'me', localPhotoUri: 'file:///doc/PHOTO/P/L/me/EMAP_1.jpg' })
    ).toEqual({ folder: 'file:///doc/PHOTO/P/L/me', filename: 'EMAP_1.jpg', reuseExisting: true });
  });

  test('確かめられないとき（同期で届いた記録・別のファイルを指す）は使い回しの許可を出さない', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'me' })?.reuseExisting).toBeUndefined();
    expect(
      photoDownloadTarget({ ...base, recordUserId: 'me', localPhotoUri: 'file:///doc/PHOTO/P/L/me/other.jpg' })
        ?.reuseExisting
    ).toBeUndefined();
  });

  test('新しい名前の自分の写真は、そのまま写真名で置く', () => {
    expect(photoDownloadTarget({ ...base, recordUserId: 'me', photoName: 'EMAP_20261123_100000_7K3QZ9.jpg' })).toEqual({
      folder: 'file:///doc/PHOTO/P/L/me',
      filename: 'EMAP_20261123_100000_7K3QZ9.jpg',
    });
  });
});

describe('findLocalPhotoUri（写真監査 P-L15）', () => {
  const photo = (id: string, uri: string | null | undefined) => ({ id, name: 'EMAP_1.jpg', uri, url: null, key: null });
  const ds = (layerId: string, ...photos: ReturnType<typeof photo>[][]) => ({
    layerId,
    data: photos.map((p) => ({ field: { 写真: p, 名前: 'x' } as Record<string, unknown> })),
  });
  const F = 'file:///doc/PHOTO/P/L/me/EMAP_1.jpg';

  test('同じ写真 id がこの端末で指す uri を返す', () => {
    expect(findLocalPhotoUri([ds('L', [photo('ph1', F)])], 'L', 'ph1')).toBe(F);
    //同じ写真が複数の記録（テンプレートとその写しなど）から同じ uri で指されていてもよい
    expect(findLocalPhotoUri([ds('L', [photo('ph1', F)], [photo('ph1', F)])], 'L', 'ph1')).toBe(F);
  });

  test('手元にない・別のレイヤ・uri がない写真は返さない', () => {
    expect(findLocalPhotoUri([], 'L', 'ph1')).toBeUndefined();
    expect(findLocalPhotoUri([ds('L2', [photo('ph1', F)])], 'L', 'ph1')).toBeUndefined();
    expect(findLocalPhotoUri([ds('L', [photo('ph1', null)])], 'L', 'ph1')).toBeUndefined();
    expect(findLocalPhotoUri([ds('L', [photo('ph1', undefined)])], 'L', 'ph1')).toBeUndefined();
  });

  test('同じ uri を別の id の写真も指している、または同じ id が別々の uri を指しているときは確かめられない', () => {
    expect(findLocalPhotoUri([ds('L', [photo('ph1', F)], [photo('ph2', F)])], 'L', 'ph1')).toBeUndefined();
    expect(findLocalPhotoUri([ds('L', [photo('ph1', F)], [photo('ph1', `${F}x`)])], 'L', 'ph1')).toBeUndefined();
  });
});
