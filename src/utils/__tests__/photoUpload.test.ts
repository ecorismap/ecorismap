const mockGetInfoAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: (uri: string) => mockGetInfoAsync(uri) }));
import { canReadPhotoForUpload, isOwnUploadablePhotoUri } from '../photoUpload';
import { PHOTO_FOLDER } from '../../constants/AppConstants';

// 写真監査 P-M13・P-M12: 自分の写真フォルダ（Web は blob:）の外の uri は上げない
describe('isOwnUploadablePhotoUri', () => {
  const folder = 'file:///data/app/Documents/projects';
  const native = { platform: 'ios', photoFolder: folder };

  test('自分の名義のこのプロジェクト・レイヤの写真フォルダの配下は上げてよい', () => {
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l1/me/a.jpg`, 'proj1', 'l1', 'me', native)).toBe(true);
  });

  test('ログイン前（LOCAL）のこのレイヤの写真フォルダの配下は上げてよい', () => {
    expect(isOwnUploadablePhotoUri(`${folder}/LOCAL/l1/OWNER/a.jpg`, 'proj1', 'l1', 'me', native)).toBe(true);
  });

  test('他のメンバーの名義のフォルダ・別のプロジェクト・別のレイヤの写真は上げない', () => {
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l1/other/a.jpg`, 'proj1', 'l1', 'me', native)).toBe(false);
    expect(isOwnUploadablePhotoUri(`${folder}/proj2/l1/me/a.jpg`, 'proj1', 'l1', 'me', native)).toBe(false);
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l2/me/a.jpg`, 'proj1', 'l1', 'me', native)).toBe(false);
    expect(isOwnUploadablePhotoUri(`${folder}/LOCAL/l2/OWNER/a.jpg`, 'proj1', 'l1', 'me', native)).toBe(false);
  });

  test('写真フォルダの外（他人の端末のパス・`..` で抜けるパス）は上げない', () => {
    expect(isOwnUploadablePhotoUri('file:///var/mobile/other/Documents/a.jpg', 'proj1', 'l1', 'me', native)).toBe(false);
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l1/me/../../../proj2/l1/me/a.jpg`, 'proj1', 'l1', 'me', native)).toBe(
      false
    );
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l1/me`, 'proj1', 'l1', 'me', native)).toBe(false);
  });

  test('id が安全なフォルダ名でなければ上げない', () => {
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l1/me/a.jpg`, '..', 'l1', 'me', native)).toBe(false);
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l1/me/a.jpg`, 'proj1', 'l1', '../x', native)).toBe(false);
  });

  test('空・null・undefined は上げない', () => {
    expect(isOwnUploadablePhotoUri(null, 'proj1', 'l1', 'me', native)).toBe(false);
    expect(isOwnUploadablePhotoUri(undefined, 'proj1', 'l1', 'me', native)).toBe(false);
    expect(isOwnUploadablePhotoUri('', 'proj1', 'l1', 'me', native)).toBe(false);
  });

  test('Web は blob: だけを上げる', () => {
    const web = { platform: 'web' };
    expect(isOwnUploadablePhotoUri('blob:https://ecorismap.web.app/abc', 'proj1', 'l1', 'me', web)).toBe(true);
    expect(isOwnUploadablePhotoUri(`${folder}/proj1/l1/me/a.jpg`, 'proj1', 'l1', 'me', web)).toBe(false);
    expect(isOwnUploadablePhotoUri('data:image/jpeg;base64,xxx', 'proj1', 'l1', 'me', web)).toBe(false);
  });

  test('既定では端末の写真フォルダ（PHOTO_FOLDER）を使う', () => {
    expect(isOwnUploadablePhotoUri(`${PHOTO_FOLDER}/proj1/l1/me/a.jpg`, 'proj1', 'l1', 'me', { platform: 'ios' })).toBe(
      true
    );
  });
});

// 写真監査 P-M12・P-M13: LOCAL と blob: はパスに uid を含まないので、記録の名義も見る
describe('isOwnUploadablePhotoUri（記録の名義）', () => {
  const folder = 'file:///data/user/0/app/files/projects';
  const android = { platform: 'android', photoFolder: folder };
  const local = `${folder}/LOCAL/l1/OWNER/a.jpg`;

  test('自分・テンプレートの記録の LOCAL の写真は上げてよい', () => {
    expect(isOwnUploadablePhotoUri(local, 'proj1', 'l1', 'me', { ...android, record: { userId: 'me' } })).toBe(true);
    expect(isOwnUploadablePhotoUri(local, 'proj1', 'l1', 'me', { ...android, record: { userId: 'template' } })).toBe(
      true
    );
  });

  test('他人の名義の記録・他人から引き継いだ記録の LOCAL の写真は上げない', () => {
    expect(isOwnUploadablePhotoUri(local, 'proj1', 'l1', 'me', { ...android, record: { userId: 'other' } })).toBe(false);
    expect(
      isOwnUploadablePhotoUri(local, 'proj1', 'l1', 'me', {
        ...android,
        record: { userId: 'me', takenOverFrom: ['other'] },
      })
    ).toBe(false);
  });

  test('引き継いだ記録でも、自分の名義の写真フォルダの写真は上げてよい', () => {
    expect(
      isOwnUploadablePhotoUri(`${folder}/proj1/l1/me/a.jpg`, 'proj1', 'l1', 'me', {
        ...android,
        record: { userId: 'me', takenOverFrom: ['other'] },
      })
    ).toBe(true);
  });

  test('Web では他人の名義の記録の blob: は上げない。引き継いだ記録の blob:（自分が足した写真）は上げてよい', () => {
    const blob = 'blob:https://ecorismap.web.app/abc';
    expect(isOwnUploadablePhotoUri(blob, 'proj1', 'l1', 'me', { platform: 'web', record: { userId: 'other' } })).toBe(
      false
    );
    expect(
      isOwnUploadablePhotoUri(blob, 'proj1', 'l1', 'me', {
        platform: 'web',
        record: { userId: 'me', takenOverFrom: ['other'] },
      })
    ).toBe(true);
  });
});

describe('canReadPhotoForUpload', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('ネイティブは原画のファイルがあるときだけ true', async () => {
    mockGetInfoAsync.mockResolvedValueOnce({ exists: true }).mockResolvedValueOnce({ exists: false });
    expect(await canReadPhotoForUpload('file:///a.jpg', 'android')).toBe(true);
    expect(await canReadPhotoForUpload('file:///b.jpg', 'android')).toBe(false);
    mockGetInfoAsync.mockRejectedValueOnce(new Error('x'));
    expect(await canReadPhotoForUpload('file:///c.jpg', 'android')).toBe(false);
  });

  test('Web は blob: を読めるときだけ true（他のタブの blob や再読み込みで無効になった blob は false）', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await canReadPhotoForUpload('blob:https://x/1', 'web')).toBe(true);
    expect(await canReadPhotoForUpload('blob:https://x/2', 'web')).toBe(false);
  });
});
