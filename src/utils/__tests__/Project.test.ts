import {
  hasOpened,
  checkDuplicateMember,
  checkEmails,
  pickNewProjectIdForSave,
  normalizeMemberEmail,
  hasDuplicateMemberUid,
} from '../Project';

// 型定義
type VerifiedType = 'OK' | 'HOLD' | 'NO_ACCOUNT';
type RoleType = 'MEMBER' | 'ADMIN' | 'OWNER';

interface ProjectType {
  id: string;
  name: string;
  members: { uid: string | null; email: string; verified: VerifiedType; role: RoleType }[];
  ownerUid: string;
  adminsUid: string[];
  membersUid: string[];
  abstract: string;
  storage: { count: number };
}

jest.mock('../Format', () => ({
  formattedInputs: jest.fn((value, type) => {
    if (type === 'email') {
      if (value === 'invalid@email') {
        return { isOK: false, result: value };
      }
      return { isOK: true, result: value };
    }
    return { isOK: true, result: value };
  }),
}));

describe('Project', () => {
  describe('hasOpened', () => {
    it('returns true when projectId is defined', () => {
      expect(hasOpened('project-123')).toBe(true);
    });

    it('returns false when projectId is undefined', () => {
      expect(hasOpened(undefined)).toBe(false);
    });
  });

  describe('checkDuplicateMember', () => {
    it('returns true when there are no duplicate emails', () => {
      const project = {
        id: 'project-1',
        name: 'Test Project',
        members: [
          { email: 'user1@example.com', uid: null, verified: 'OK', role: 'MEMBER' },
          { email: 'user2@example.com', uid: null, verified: 'OK', role: 'MEMBER' },
        ],
        ownerUid: 'owner-1',
        adminsUid: [],
        membersUid: [],
        abstract: '',
        storage: { count: 0 },
      } as ProjectType;
      expect(checkDuplicateMember(project, 0)).toBe(true);
    });

    it('returns false when there are duplicate emails', () => {
      const project = {
        id: 'project-1',
        name: 'Test Project',
        members: [
          { email: 'user1@example.com', uid: null, verified: 'OK', role: 'MEMBER' },
          { email: 'user1@example.com', uid: null, verified: 'OK', role: 'MEMBER' },
        ],
        ownerUid: 'owner-1',
        adminsUid: [],
        membersUid: [],
        abstract: '',
        storage: { count: 0 },
      } as ProjectType;
      expect(checkDuplicateMember(project, 0)).toBe(false);
    });
  });

  describe('checkEmails', () => {
    it('returns isOK: true when all emails are valid', () => {
      const project = {
        id: 'project-1',
        name: 'Test Project',
        members: [
          { email: 'user1@example.com', uid: null, verified: 'OK', role: 'MEMBER' },
          { email: 'user2@example.com', uid: null, verified: 'OK', role: 'MEMBER' },
        ],
        ownerUid: 'owner-1',
        adminsUid: [],
        membersUid: [],
        abstract: '',
        storage: { count: 0 },
      } as ProjectType;
      expect(checkEmails(project)).toEqual({
        isOK: true,
        emails: ['user1@example.com', 'user2@example.com'],
      });
    });

    it('returns isOK: false when any email is invalid', () => {
      const project = {
        id: 'project-1',
        name: 'Test Project',
        members: [
          { email: 'user1@example.com', uid: null, verified: 'OK', role: 'MEMBER' },
          { email: 'invalid@email', uid: null, verified: 'OK', role: 'MEMBER' },
        ],
        ownerUid: 'owner-1',
        adminsUid: [],
        membersUid: [],
        abstract: '',
        storage: { count: 0 },
      } as ProjectType;
      expect(checkEmails(project)).toEqual({
        isOK: false,
        emails: ['user1@example.com', 'invalid@email'],
      });
    });
  });
});

// ACCOUNT_AUDIT_2026-11 A-M3 のレビュー指摘: 後始末で消した id を作り直しに使わない
describe('pickNewProjectIdForSave', () => {
  it('uses the given id on the first attempt', () => {
    const attempted = new Set<string>();
    const gen = jest.fn(() => 'fresh');
    expect(pickNewProjectIdForSave('p1', attempted, gen)).toBe('p1');
    expect(gen).not.toHaveBeenCalled();
  });

  it('switches to a new id when the same id is saved again', () => {
    const attempted = new Set<string>();
    let n = 0;
    const gen = () => `fresh${++n}`;
    expect(pickNewProjectIdForSave('p1', attempted, gen)).toBe('p1');
    expect(pickNewProjectIdForSave('p1', attempted, gen)).toBe('fresh1');
    // 2回目の失敗の後も、それまでに試した id はどれも使わない
    expect(pickNewProjectIdForSave('p1', attempted, gen)).toBe('fresh2');
  });
});

describe('A-L15: メールの正規化と同じ uid の重複', () => {
  const base = {
    id: 'p',
    name: 'p',
    ownerUid: 'o',
    adminsUid: [],
    membersUid: [],
    abstract: '',
    storage: { count: 0 },
  };

  it('normalizeMemberEmail は前後の空白を除き小文字にする', () => {
    expect(normalizeMemberEmail('  Foo@Example.COM ')).toBe('foo@example.com');
  });

  it('checkDuplicateMember は大文字小文字だけの違いも重複とみなす', () => {
    const project = {
      ...base,
      members: [
        { uid: 'a', email: 'a@example.com', verified: 'OK' as const, role: 'OWNER' as const },
        { uid: null, email: 'A@Example.com', verified: 'NO_ACCOUNT' as const, role: 'MEMBER' as const },
      ],
    };
    expect(checkDuplicateMember(project, 1)).toBe(false);
  });

  it('hasDuplicateMemberUid は解決済みの uid の重複だけを見る（未解決の null・空は数えない）', () => {
    const member = (uid: string | null, email: string) => ({
      uid,
      email,
      verified: 'OK' as const,
      role: 'MEMBER' as const,
    });
    expect(hasDuplicateMemberUid({ ...base, members: [member('a', 'a@x.jp'), member('a', 'b@x.jp')] })).toBe(true);
    expect(
      hasDuplicateMemberUid({
        ...base,
        members: [member('a', 'a@x.jp'), member(null, 'b@x.jp'), member(null, 'c@x.jp'), member('', 'd@x.jp')],
      })
    ).toBe(false);
  });
});
