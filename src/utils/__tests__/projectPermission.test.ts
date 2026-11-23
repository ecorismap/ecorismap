import { canDeleteProject } from '../projectPermission';

describe('canDeleteProject', () => {
  it('オーナーだけが削除できる', () => {
    expect(canDeleteProject({ ownerUid: 'owner' }, 'owner')).toBe(true);
  });
  it('オーナーでない管理者・メンバーは削除できない（Storage だけ消えて project doc が残るのを防ぐ）', () => {
    expect(canDeleteProject({ ownerUid: 'owner' }, 'admin')).toBe(false);
    expect(canDeleteProject({ ownerUid: 'owner' }, 'member')).toBe(false);
  });
  it('未ログイン（uid が無い）では削除できない', () => {
    expect(canDeleteProject({ ownerUid: 'owner' }, undefined)).toBe(false);
    expect(canDeleteProject({ ownerUid: '' }, '')).toBe(false);
  });
});
