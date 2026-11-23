// 写真監査 P-M4: 再読み込みで無効になった前のページの blob: は「未同期」に数えない
(require('react-native') as { Platform: { OS: string } }).Platform.OS = 'web';
// 起動時に包む URL.createObjectURL を、読み込む前に用意する（jsdom には無い）
let counter = 0;
const mockRevoke = jest.fn();
(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => `blob:https://example/${++counter}`;
(URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = mockRevoke;

import type { DataType, PhotoType, RecordType } from '../../types';
import type * as UnsyncedChanges from '../unsyncedChanges';

// import は先に評価されるので、URL を用意した後に require で読み込む
const { hasUnsyncedChanges, hasUnuploadedBlobPhoto, isLivePageBlobUrl } =
  require('../unsyncedChanges') as typeof UnsyncedChanges;

const photo = (uri: string): PhotoType =>
  ({ id: 'ph1', name: 'a.jpg', uri, url: null, key: null, width: 1, height: 1, thumbnail: null }) as PhotoType;
const record = (photos: PhotoType[]): RecordType => ({
  id: 'r1',
  userId: 'me',
  displayName: 'me',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: { photo: photos },
  updatedAt: 100,
  uploaded: true,
});
const marks = { openedAt: 50, layerUploadedAt: { layerA: 200 } };

describe('このページで作った blob: だけを未同期に数える', () => {
  it('このページで作った blob: の未アップロード写真は「未同期あり」', () => {
    const uri = URL.createObjectURL(new Blob(['x']));
    expect(isLivePageBlobUrl(uri)).toBe(true);
    expect(hasUnuploadedBlobPhoto(record([photo(uri)]))).toBe(true);
    const dataSet: DataType[] = [{ layerId: 'layerA', userId: 'me', data: [record([photo(uri)])] }];
    expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(true);
  });

  it('再読み込みの前のページの blob:（このページで作っていない）は数えない', () => {
    const stale = 'blob:https://example/from-previous-page';
    expect(isLivePageBlobUrl(stale)).toBe(false);
    expect(hasUnuploadedBlobPhoto(record([photo(stale)]))).toBe(false);
    const dataSet: DataType[] = [{ layerId: 'layerA', userId: 'me', data: [record([photo(stale)])] }];
    expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(false);
  });

  it('破棄した blob: も数えない', () => {
    const uri = URL.createObjectURL(new Blob(['y']));
    URL.revokeObjectURL(uri);
    expect(mockRevoke).toHaveBeenCalledWith(uri);
    expect(hasUnuploadedBlobPhoto(record([photo(uri)]))).toBe(false);
  });
});
