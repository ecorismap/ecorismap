// 目印の保存は Web のときだけ働くので、読み込む前に web へ切り替える
(require('react-native') as { Platform: { OS: string } }).Platform.OS = 'web';

import { hasUnsyncedChanges, hasUnuploadedBlobPhoto } from '../unsyncedChanges';
import { DataType, PhotoType, RecordType } from '../../types';

// Web で、まだアップロードしていない blob: の写真があれば離脱確認を出す（写真監査 P-M4 の当面の策）

const photo = (extra: Partial<PhotoType>): PhotoType =>
  ({ id: 'ph1', name: 'a.jpg', uri: 'blob:https://example/1', url: null, key: null, ...extra }) as PhotoType;

const record = (id: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId: 'me',
  displayName: 'me',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {},
  updatedAt: 100,
  uploaded: true,
  ...extra,
});

// 記録自体は上がっていて、基準時刻も記録の更新より後（写真だけ失敗した後の状態）
const marks = { openedAt: 50, layerUploadedAt: { layerA: 200 } };

describe('hasUnuploadedBlobPhoto', () => {
  it('url が null で uri が blob: の写真があれば true', () => {
    expect(hasUnuploadedBlobPhoto(record('r1', { field: { photo: [photo({})] } }))).toBe(true);
  });

  it('アップロード済み（url あり）なら blob: でも false', () => {
    expect(hasUnuploadedBlobPhoto(record('r1', { field: { photo: [photo({ url: 'https://x', key: 'k' })] } }))).toBe(
      false
    );
  });

  it('uri が blob: でない写真や、写真でない欄は false', () => {
    expect(hasUnuploadedBlobPhoto(record('r1', { field: { photo: [photo({ uri: null })] } }))).toBe(false);
    expect(hasUnuploadedBlobPhoto(record('r1', { field: { name: 'blob:abc' } }))).toBe(false);
  });
});

describe('hasUnsyncedChanges と未アップロードの写真', () => {
  it('記録は同期済みでも、自分の記録に未アップロードの blob: 写真があれば確認を出す', () => {
    const dataSet: DataType[] = [
      { layerId: 'layerA', userId: 'me', data: [record('r1', { field: { photo: [photo({})] } })] },
    ];
    expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(true);
  });

  it('写真がすべて上がっていれば確認を出さない', () => {
    const dataSet: DataType[] = [
      { layerId: 'layerA', userId: 'me', data: [record('r1', { field: { photo: [photo({ url: 'https://x', key: 'k' })] } })] },
    ];
    expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(false);
  });

  it('他のメンバーの記録の写真は見ない', () => {
    const dataSet: DataType[] = [
      { layerId: 'layerA', userId: 'other', data: [record('r1', { userId: 'other', field: { photo: [photo({})] } })] },
    ];
    expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(false);
  });

  it('削除した記録の写真は見ない', () => {
    const dataSet: DataType[] = [
      { layerId: 'layerA', userId: 'me', data: [record('r1', { deleted: true, updatedAt: 100, field: { photo: [photo({})] } })] },
    ];
    expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(false);
  });

  it('テンプレートの記録の写真も見る', () => {
    const dataSet: DataType[] = [
      { layerId: 'layerA', userId: 'template', data: [record('r1', { userId: 'template', field: { photo: [photo({})] } })] },
    ];
    expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(true);
  });
});
