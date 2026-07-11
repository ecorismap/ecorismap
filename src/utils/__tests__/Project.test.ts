import { hasOpened, checkDuplicateMember, checkEmails } from '../Project';

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
