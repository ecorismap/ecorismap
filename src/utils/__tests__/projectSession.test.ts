import { isOtherUsersProjectOpen, resolveProjectSessionUid } from '../projectSession';

// A-M1: 取りやめられないログアウトやセッション切れの後に、別の人が前の人のプロジェクトを引き継がない
describe('resolveProjectSessionUid', () => {
  it('プロジェクトを開いていなければ持ち主は無い', () => {
    expect(resolveProjectSessionUid({ projectId: undefined, projectSessionUid: 'a' }, 'a')).toBeUndefined();
  });

  it('記録があればそれを使う', () => {
    expect(resolveProjectSessionUid({ projectId: 'p', projectSessionUid: 'a' }, 'b')).toBe('a');
  });

  it('記録の無い旧データは、いま Redux にいるユーザーのものとみなす', () => {
    expect(resolveProjectSessionUid({ projectId: 'p', projectSessionUid: undefined }, 'a')).toBe('a');
  });
});

describe('isOtherUsersProjectOpen', () => {
  it('前の人と違う uid でログインするなら true', () => {
    expect(isOtherUsersProjectOpen({ projectId: 'p', projectSessionUid: 'a' }, undefined, 'b')).toBe(true);
  });

  it('同じ人が入り直すなら false（今のまま）', () => {
    expect(isOtherUsersProjectOpen({ projectId: 'p', projectSessionUid: 'a' }, undefined, 'a')).toBe(false);
  });

  it('セッション切れで Redux に前の人が残っている旧データでも、別の人なら true', () => {
    expect(isOtherUsersProjectOpen({ projectId: 'p', projectSessionUid: undefined }, 'a', 'b')).toBe(true);
  });

  it('持ち主が分からないとき（未ログインで開いたままの旧データ）は今の挙動を保つ', () => {
    expect(isOtherUsersProjectOpen({ projectId: 'p', projectSessionUid: undefined }, undefined, 'b')).toBe(false);
  });

  it('プロジェクトを開いていなければ false', () => {
    expect(isOtherUsersProjectOpen({ projectId: undefined, projectSessionUid: 'a' }, 'a', 'b')).toBe(false);
  });
});
