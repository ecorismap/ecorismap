// 目印の保存は Web のときだけ働くので、読み込む前に web へ切り替える
(require('react-native') as { Platform: { OS: string } }).Platform.OS = 'web';

import {
  clearProjectMarks,
  clearUnsyncedMarks,
  getUnsyncedMarks,
  hasUnsyncedChanges,
  markLayerUploaded,
  markProjectOpened,
} from '../unsyncedChanges';
import { DataType, RecordType } from '../../types';

const record = (id: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId: 'me',
  displayName: 'me',
  visible: true,
  redraw: false,
  coords: { latitude: 0, longitude: 0 },
  field: {},
  updatedAt: 100,
  ...extra,
});

describe('Web版の離脱確認の判定（同期監査 L14）', () => {
  beforeEach(() => {
    clearUnsyncedMarks();
  });

  describe('hasUnsyncedChanges', () => {
    const marks = { openedAt: 50, layerUploadedAt: { layerA: 200 } };

    it('アップロードしていない記録があれば確認を出す', () => {
      const dataSet: DataType[] = [{ layerId: 'layerA', userId: 'me', data: [record('r1')] }];
      expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(true);
    });

    it('すべてアップロード済みで、その後に変えていなければ確認を出さない', () => {
      const dataSet: DataType[] = [{ layerId: 'layerA', userId: 'me', data: [record('r1', { uploaded: true })] }];
      expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(false);
    });

    it('アップロード後に編集した自分の記録があれば確認を出す（uploaded は true のまま）', () => {
      const dataSet: DataType[] = [
        { layerId: 'layerA', userId: 'me', data: [record('r1', { uploaded: true, updatedAt: 300 })] },
      ];
      expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(true);
    });

    it('アップロード後に削除した記録（墓標）があれば確認を出す', () => {
      const dataSet: DataType[] = [
        { layerId: 'layerA', userId: 'me', data: [record('r1', { uploaded: true, deleted: true, updatedAt: 300 })] },
      ];
      expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(true);
    });

    it('まだアップロードしていないレイヤは、プロジェクトを開いた時刻より後の変更を見る', () => {
      const before: DataType[] = [{ layerId: 'layerB', userId: 'me', data: [record('r1', { uploaded: true, updatedAt: 40 })] }];
      const after: DataType[] = [{ layerId: 'layerB', userId: 'me', data: [record('r1', { uploaded: true, updatedAt: 60 })] }];
      expect(hasUnsyncedChanges(before, 'p1', 'me', marks)).toBe(false);
      expect(hasUnsyncedChanges(after, 'p1', 'me', marks)).toBe(true);
    });

    it('取得した他のメンバーの記録は、更新時刻が新しくても確認の対象にしない', () => {
      const dataSet: DataType[] = [
        { layerId: 'layerA', userId: 'other', data: [record('r1', { userId: 'other', uploaded: true, updatedAt: 999 })] },
      ];
      expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(false);
    });

    it('アップロードの印を持たない他のメンバーの古い記録があっても、確認を出さない（レビューの指摘）', () => {
      const dataSet: DataType[] = [{ layerId: 'layerA', userId: 'other', data: [record('r1', { userId: 'other' })] }];
      expect(hasUnsyncedChanges(dataSet, 'p1', 'me', marks)).toBe(false);
    });

    it('基準時刻が分からないときは、記録を守る側に倒して確認を出す', () => {
      const dataSet: DataType[] = [{ layerId: 'layerC', userId: 'me', data: [record('r1', { uploaded: true })] }];
      expect(hasUnsyncedChanges(dataSet, 'p1', 'me', { layerUploadedAt: {} })).toBe(true);
    });

    it('プロジェクトを開いていないときは、記録が1件でもあれば確認を出す（上げる先がなく、閉じると必ず消える）', () => {
      expect(hasUnsyncedChanges([{ layerId: 'l', userId: undefined, data: [record('r1', { userId: undefined })] }], undefined, undefined, { layerUploadedAt: {} })).toBe(true);
      expect(hasUnsyncedChanges([{ layerId: 'l', userId: undefined, data: [] }], undefined, undefined, { layerUploadedAt: {} })).toBe(false);
    });
  });

  describe('目印の記録', () => {
    it('開いた時刻は最初の1回だけ記録する（再読み込みで基準が進まない）', () => {
      markProjectOpened('p1', 10);
      markProjectOpened('p1', 20);
      expect(getUnsyncedMarks('p1').openedAt).toBe(10);
    });

    it('アップロード時刻はレイヤごとに記録し、古い時刻で戻さない', () => {
      markLayerUploaded('p1', 'layerA', 100);
      markLayerUploaded('p1', 'layerA', 90);
      markLayerUploaded('p1', 'layerB', 50);
      expect(getUnsyncedMarks('p1').layerUploadedAt).toEqual({ layerA: 100, layerB: 50 });
    });

    it('プロジェクトを閉じると、そのプロジェクトの目印を捨てる', () => {
      markProjectOpened('p1', 10);
      markProjectOpened('p2', 10);
      clearProjectMarks('p1');
      expect(getUnsyncedMarks('p1')).toEqual({ layerUploadedAt: {} });
      expect(getUnsyncedMarks('p2').openedAt).toBe(10);
    });
  });
});
