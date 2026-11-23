jest.mock('../../utils/Photo', () => ({
  createThumbnail: jest.fn(async () => 'data:image/jpeg;base64,THUMB'),
}));

import { createThumbnail } from '../../utils/Photo';
import { loadPhotoInfo } from '../useTrackPhotos';

// 軌跡写真のサムネイル作成で、iCloud にしかない原画を原寸で取り寄せない（写真監査 P-M15）

const mockCreateThumbnail = createThumbnail as jest.MockedFunction<typeof createThumbnail>;

type MediaLibraryModule = typeof import('expo-media-library/legacy');
type Asset = import('expo-media-library/legacy').Asset;

const makeMediaLibrary = (localUri: string | undefined) =>
  ({
    getAssetInfoAsync: jest.fn(async () => ({ localUri })),
  }) as unknown as MediaLibraryModule & { getAssetInfoAsync: jest.Mock };

const asset = (uri: string, mediaSubtypes?: string[]) =>
  ({ id: 'a1', uri, mediaSubtypes, creationTime: 0, modificationTime: 0 }) as unknown as Asset;

describe('loadPhotoInfo のサムネイル元', () => {
  beforeEach(() => jest.clearAllMocks());

  it('端末に原画がある写真は localUri からサムネイルを作る', async () => {
    const ml = makeMediaLibrary('file:///photos/IMG_1.JPG');

    const info = await loadPhotoInfo(ml, asset('ph://a1'));

    expect(ml.getAssetInfoAsync).toHaveBeenCalledWith(expect.anything(), { shouldDownloadFromNetwork: false });
    expect(mockCreateThumbnail).toHaveBeenCalledWith('file:///photos/IMG_1.JPG');
    expect(info).toEqual({ thumbnail: 'data:image/jpeg;base64,THUMB', localUri: 'file:///photos/IMG_1.JPG' });
  });

  it('iOS で localUri が取れない（iCloud にしかない）写真は ph:// を渡さず、サムネイルなしにする', async () => {
    const ml = makeMediaLibrary(undefined);

    const info = await loadPhotoInfo(ml, asset('ph://a1'));

    expect(mockCreateThumbnail).not.toHaveBeenCalled();
    expect(info).toEqual({ thumbnail: null, localUri: undefined });
  });

  it('Live Photo は情報取得を省き、従来どおり ph:// からサムネイルを作る', async () => {
    const ml = makeMediaLibrary(undefined);

    const info = await loadPhotoInfo(ml, asset('ph://a1', ['livePhoto']));

    expect(ml.getAssetInfoAsync).not.toHaveBeenCalled();
    expect(mockCreateThumbnail).toHaveBeenCalledWith('ph://a1');
    expect(info.thumbnail).toBe('data:image/jpeg;base64,THUMB');
  });

  it('Android で localUri が欠けても、uri は file:// の実パスなのでそこから作る', async () => {
    const ml = makeMediaLibrary(undefined);

    await loadPhotoInfo(ml, asset('file:///storage/DCIM/IMG_2.JPG'));

    expect(mockCreateThumbnail).toHaveBeenCalledWith('file:///storage/DCIM/IMG_2.JPG');
  });
});
