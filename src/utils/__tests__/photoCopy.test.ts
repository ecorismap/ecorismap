/**
 * 記録の写し（複製・テンプレートの写し）の写真を元の記録と切り離す（写真監査 P-M8・P-M10）
 */
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
const mockHasLocal = jest.fn();
jest.mock('../Photo', () => ({ hasLocalPhotoFile: (uri: string) => mockHasLocal(uri) }));

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { detachCopiedRecordPhotos, PhotoCopyContext } from '../photoCopy';
import { LayerType, PhotoType, RecordType } from '../../types';

const layer = {
  id: 'L',
  field: [
    { id: 'f1', name: 'name', format: 'STRING' },
    { id: 'f2', name: '写真', format: 'PHOTO' },
  ],
} as unknown as LayerType;
const root = 'file:///docs/projects';
const folder = `${root}/p1/L/me`;
//自分の記録として写す（複製の元が自分の記録）
const own: PhotoCopyContext = { source: { userId: 'me' }, projectId: 'p1', uid: 'me' };
const photo = (id: string, extra: Partial<PhotoType> = {}): PhotoType => ({
  id,
  name: 'EMAP_1.jpg',
  uri: `${folder}/${id}.jpg`,
  url: `https://x/${id}`,
  key: 'k',
  width: 1,
  height: 1,
  thumbnail: 'data:t',
  ...extra,
});
const record = (photos: PhotoType[]): RecordType =>
  ({ id: 'r1', userId: 'owner', field: { name: 'n', 写真: photos } }) as unknown as RecordType;

describe('detachCopiedRecordPhotos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
    mockHasLocal.mockResolvedValue(true);
    (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('写真ごとに新しい id を振り、原画を別名でコピーして url/key を空にする', async () => {
    const { record: result, droppedPhotoCount } = await detachCopiedRecordPhotos(
      layer,
      record([photo('a')]),
      folder,
      new Set(),
      own
    );
    const [copied] = result.field['写真'] as PhotoType[];
    expect(droppedPhotoCount).toBe(0);
    expect(copied.id).not.toBe('a');
    expect(copied.url).toBeNull();
    expect(copied.key).toBeNull();
    expect(copied.uri).toBe(`${folder}/${copied.id}_EMAP_1.jpg`);
    expect(copied.name).toBe('EMAP_1.jpg');
    expect(copied.thumbnail).toBe('data:t');
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: photo('a').uri, to: copied.uri });
    expect(result.field.name).toBe('n');
  });

  it('原画が手元にないがクラウドにある写真は、新しい id で元の url/key を指したまま残す', async () => {
    mockHasLocal.mockImplementation(async (uri: string) => !uri.includes('missing'));
    const { record: result, droppedPhotoCount } = await detachCopiedRecordPhotos(
      layer,
      record([photo('missing'), photo('notDownloaded', { uri: null }), photo('ok')]),
      folder,
      new Set(),
      own
    );
    const photos = result.field['写真'] as PhotoType[];
    expect(droppedPhotoCount).toBe(0);
    expect(photos).toHaveLength(3);
    expect(photos[0]).toMatchObject({ url: 'https://x/missing', key: 'k', uri: null, name: 'EMAP_1.jpg' });
    expect(photos[0].id).not.toBe('missing');
    expect(photos[1]).toMatchObject({ url: 'https://x/notDownloaded', key: 'k', uri: null });
    expect(photos[1].id).not.toBe('notDownloaded');
    expect(photos[2]).toMatchObject({ url: null, key: null });
    expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
  });

  it('Web で上げ終えた写真（uri が null）も、複製に url/key を指したまま残す', async () => {
    (Platform as { OS: string }).OS = 'web';
    const { record: result } = await detachCopiedRecordPhotos(
      layer,
      record([photo('a', { uri: null })]),
      folder,
      new Set(),
      own
    );
    const [copied] = result.field['写真'] as PhotoType[];
    expect(copied).toMatchObject({ url: 'https://x/a', key: 'k', uri: null });
    expect(copied.id).not.toBe('a');
  });

  it('原画もクラウドの実体もない写真だけを外し、その枚数を返す。外した印（uri が undefined）は数えない', async () => {
    mockHasLocal.mockImplementation(async (uri: string) => !uri.includes('missing'));
    const { record: result, droppedPhotoCount } = await detachCopiedRecordPhotos(
      layer,
      record([
        photo('missing', { url: null, key: null }),
        photo('nothing', { uri: null, url: null, key: null }),
        photo('removed', { uri: undefined }),
        photo('ok'),
      ]),
      folder,
      new Set(),
      own
    );
    expect(result.field['写真']).toHaveLength(1);
    expect(droppedPhotoCount).toBe(2);
  });

  it('コピーに失敗した写真は、クラウドにあれば参照で残し、なければ外す（元のファイルは共有させない）', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    (FileSystem.copyAsync as jest.Mock).mockRejectedValue(new Error('disk full'));
    const { record: result, droppedPhotoCount } = await detachCopiedRecordPhotos(
      layer,
      record([photo('a'), photo('b', { url: null, key: null })]),
      folder,
      new Set(),
      own
    );
    const photos = result.field['写真'] as PhotoType[];
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ url: 'https://x/a', uri: null });
    expect(photos[0].uri).not.toBe(photo('a').uri);
    expect(droppedPhotoCount).toBe(1);
  });

  it('編集中に足した写真（keepPhotoIds）はそのまま残す', async () => {
    const added = photo('added', { url: null, key: null });
    const { record: result } = await detachCopiedRecordPhotos(layer, record([added]), folder, new Set(['added']), own);
    expect(result.field['写真']).toEqual([added]);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  it('Web は blob をそのまま指し、id と url/key だけを切り離す', async () => {
    (Platform as { OS: string }).OS = 'web';
    const { record: result } = await detachCopiedRecordPhotos(
      layer,
      record([photo('a', { uri: 'blob:http://x/1' })]),
      folder,
      new Set(),
      own
    );
    const [copied] = result.field['写真'] as PhotoType[];
    expect(copied).toMatchObject({ uri: 'blob:http://x/1', url: null, key: null });
    expect(copied.id).not.toBe('a');
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });

  describe('写してよい原画（P-M13 のすり抜け）', () => {
    const other: PhotoCopyContext = { source: { userId: 'other' }, projectId: 'p1', uid: 'me' };
    const otherRecord = (photos: PhotoType[]) =>
      ({ id: 'r1', userId: 'other', field: { name: 'n', 写真: photos } }) as unknown as RecordType;

    it('他人の記録の LOCAL のパスは、自分の端末に同じパスのファイルがあっても写さず、クラウドから取得する', async () => {
      const download = jest.fn(async (_photo: PhotoType, filename: string) => `${folder}/${filename}`);
      const victim = photo('a', { uri: `${root}/LOCAL/L/OWNER/a.jpg` });
      const { record: result, sharedPhotoCount } = await detachCopiedRecordPhotos(
        layer,
        otherRecord([victim]),
        folder,
        new Set(),
        { ...other, downloadPhoto: download }
      );
      const [copied] = result.field['写真'] as PhotoType[];
      expect(FileSystem.copyAsync).not.toHaveBeenCalled();
      expect(download).toHaveBeenCalledWith(victim, `${copied.id}_EMAP_1.jpg`);
      expect(copied).toMatchObject({ uri: `${folder}/${copied.id}_EMAP_1.jpg`, url: null, key: null });
      expect(sharedPhotoCount).toBe(0);
    });

    it('他人の記録の、別プロジェクトや写真フォルダの外のパスも写さない', async () => {
      const { record: result } = await detachCopiedRecordPhotos(
        layer,
        otherRecord([
          photo('a', { uri: `${root}/p2/L/me/a.jpg`, url: null, key: null }),
          photo('b', { uri: 'file:///docs/SQLite/b.jpg', url: null, key: null }),
        ]),
        folder,
        new Set(),
        other
      );
      expect(FileSystem.copyAsync).not.toHaveBeenCalled();
      expect(result.field['写真']).toEqual([]);
    });

    it('自分の記録でも、別プロジェクトのパスは写さない', async () => {
      await detachCopiedRecordPhotos(
        layer,
        record([photo('a', { uri: `${root}/p2/L/me/a.jpg` })]),
        folder,
        new Set(),
        own
      );
      expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    });

    it('他人の写真をこの端末へ取得した置き場所（持ち主のフォルダの id 付きの名前）にある原画は写す', async () => {
      const downloaded = photo('a', { uri: `${root}/p1/L/other/a_EMAP_1.jpg`, url: 'https://x/a' });
      const { record: result } = await detachCopiedRecordPhotos(
        layer,
        otherRecord([downloaded]),
        folder,
        new Set(),
        other
      );
      const [copied] = result.field['写真'] as PhotoType[];
      expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: downloaded.uri, to: copied.uri });
    });

    it('他人の記録でも、自分のフォルダにある原画（自分が取得したテンプレート由来など）は写す', async () => {
      await detachCopiedRecordPhotos(layer, otherRecord([photo('a')]), folder, new Set(), other);
      expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
    });

    it('プロジェクト外では、このレイヤの LOCAL の写真フォルダの原画だけを写す', async () => {
      const local: PhotoCopyContext = { source: { userId: undefined } };
      const localFolder = `${root}/LOCAL/L/OWNER`;
      await detachCopiedRecordPhotos(
        layer,
        record([
          photo('a', { uri: `${localFolder}/a.jpg`, url: null, key: null }),
          photo('b', { uri: `${root}/LOCAL/L2/OWNER/b.jpg`, url: null, key: null }),
        ]),
        localFolder,
        new Set(),
        local
      );
      expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: `${localFolder}/a.jpg`, to: expect.any(String) });
    });
  });

  describe('原画が手元にない写真の取得（P-M8(c)・P-M10(a)）', () => {
    it('クラウドから取得できた写真は、写した人の名義で上げ直すよう url/key を空にする', async () => {
      mockHasLocal.mockResolvedValue(false);
      const download = jest.fn(async (_photo: PhotoType, filename: string) => `${folder}/${filename}`);
      const { record: result, sharedPhotoCount } = await detachCopiedRecordPhotos(
        layer,
        record([photo('a', { uri: null })]),
        folder,
        new Set(),
        { ...own, downloadPhoto: download }
      );
      const [copied] = result.field['写真'] as PhotoType[];
      expect(copied.id).not.toBe('a');
      expect(copied).toMatchObject({ url: null, key: null, uri: `${folder}/${copied.id}_EMAP_1.jpg` });
      expect(sharedPhotoCount).toBe(0);
    });

    it('取得できなかった写真は、写しから消さずに元の url/key を指したまま残し、その枚数を返す', async () => {
      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const download = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
      const {
        record: result,
        sharedPhotoCount,
        droppedPhotoCount,
      } = await detachCopiedRecordPhotos(
        layer,
        record([photo('a', { uri: null }), photo('b', { uri: null })]),
        folder,
        new Set(),
        { ...own, downloadPhoto: download }
      );
      const photos = result.field['写真'] as PhotoType[];
      expect(photos).toHaveLength(2);
      expect(photos[0]).toMatchObject({ url: 'https://x/a', key: 'k', uri: null });
      expect(photos[1]).toMatchObject({ url: 'https://x/b', key: 'k', uri: null });
      expect(sharedPhotoCount).toBe(2);
      expect(droppedPhotoCount).toBe(0);
    });
  });
});
