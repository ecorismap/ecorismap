/**
 * マップメモの Undo/Redo の確定（docs/SYNC_AUDIT_2026-11.md の S5）
 */
jest.mock('react-native-maps', () => ({}));
jest.mock('react-map-gl/maplibre', () => ({}));
import { mergeMemoHistoryResult } from '../useMapMemo';
import { LineRecordType, RecordType } from '../../types';

const line = (id: string, extra: Partial<RecordType> = {}): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'U',
  visible: true,
  redraw: false,
  coords: [{ latitude: 35, longitude: 135 }],
  field: {},
  updatedAt: 100,
  ...extra,
});

const NOW = 999;

test('もとからある墓標は残す（消すと別端末から削除した線が戻る）', () => {
  const a = line('a');
  const tomb = line('t', { deleted: true, uploaded: true, updatedAt: 200 });
  const result = mergeMemoHistoryResult([a] as LineRecordType[], [a] as LineRecordType[], [a, tomb], NOW);
  expect(result.map((r) => r.id)).toEqual(['a', 't']);
  expect(result[0]).toBe(a); // 変わっていない線は更新日時も変えない
});

test('Undo で消したアップロード済みの線は墓標になり、未アップロードの線は物理削除する', () => {
  const uploadedLine = line('up', { uploaded: true });
  const localLine = line('local');
  const result = mergeMemoHistoryResult(
    [uploadedLine, localLine] as LineRecordType[],
    [] as LineRecordType[],
    [uploadedLine, localLine],
    NOW
  );
  expect(result).toEqual([{ ...uploadedLine, deleted: true, updatedAt: NOW }]);
});

test('Undo で戻した線は同じ id の墓標を置き換え、更新日時を進める（同期で削除に負けない）', () => {
  const restored = line('r');
  const tomb = line('r', { deleted: true, uploaded: true, updatedAt: 500 });
  const result = mergeMemoHistoryResult([] as LineRecordType[], [restored] as LineRecordType[], [tomb], NOW);
  // 墓標がアップロード済みなら、戻した線もアップロード済みの印を引き継ぐ（次の Undo で墓標にするため）
  expect(result).toEqual([{ ...restored, updatedAt: NOW, uploaded: true }]);
});

test('Redo で戻した線（履歴のコピーは uploaded なし）を、続けて Undo してもアップロード済みなら墓標になる', () => {
  const copy = line('L'); // 履歴に入っているアップロード前のコピー
  const tomb = line('L', { deleted: true, uploaded: true, updatedAt: 500 });
  const afterRedo = mergeMemoHistoryResult([] as LineRecordType[], [copy] as LineRecordType[], [tomb], NOW);
  const restored = afterRedo[0];
  const afterUndo = mergeMemoHistoryResult([restored] as LineRecordType[], [] as LineRecordType[], afterRedo, NOW + 1);
  expect(afterUndo).toEqual([{ ...restored, deleted: true, updatedAt: NOW + 1 }]);
});

test('Undo/Redo で形を戻した線は更新日時を進める', () => {
  const current = line('a', { coords: [{ latitude: 1, longitude: 1 }] });
  const previous = line('a', { coords: [{ latitude: 0, longitude: 0 }] });
  const result = mergeMemoHistoryResult([current] as LineRecordType[], [previous] as LineRecordType[], [current], NOW);
  expect(result).toEqual([{ ...previous, updatedAt: NOW }]);
});
