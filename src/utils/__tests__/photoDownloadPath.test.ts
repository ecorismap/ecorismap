jest.mock('../../constants/AppConstants', () => ({ PHOTO_FOLDER: 'file:///doc/PHOTO' }));
import { photoDownloadTarget, photoUploaderUid } from '../photoDownloadPath';

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
