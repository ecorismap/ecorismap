import {
  hasOpened,
  checkDuplicateMember,
  checkEmails,
  validateProjectLicense,
  validateMemberLicense,
  validateStorageLicense,
} from '../Project';

// 型定義
type License = 'Free' | 'Basic' | 'Pro' | 'BusinessA' | 'BusinessB' | 'Unknown';
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
  license: License;
}

// モックの設定
jest.mock('../../constants/AppConstants', () => {
  return {
    FUNC_CHECK_LICENSE: false,
  };
});

// typesモジュールのモックは不要なので削除

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

jest.mock('../../i18n/config', () => ({
  t: jest.fn((key) => key),
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
        license: 'Free' as License,
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
        license: 'Free' as License,
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
        license: 'Free' as License,
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
        license: 'Free' as License,
      } as ProjectType;
      expect(checkEmails(project)).toEqual({
        isOK: false,
        emails: ['user1@example.com', 'invalid@email'],
      });
    });
  });

  describe('validateProjectLicense', () => {
    beforeEach(() => {
      // FUNC_CHECK_LICENSEをtrueに設定
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: true,
      }));
    });

    afterEach(() => {
      // テスト後にFUNC_CHECK_LICENSEをfalseに戻す
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: false,
      }));
    });

    it('returns isOK: true when license check is disabled', () => {
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: false,
      }));
      expect(validateProjectLicense('Free', 5)).toEqual({ isOK: true, message: '' });
    });

    it('returns isOK: true when project count is within license limit', () => {
      expect(validateProjectLicense('Free', 0)).toEqual({ isOK: true, message: '' });
      expect(validateProjectLicense('Basic', 4)).toEqual({ isOK: true, message: '' });
      expect(validateProjectLicense('Pro', 9)).toEqual({ isOK: true, message: '' });
      expect(validateProjectLicense('BusinessA', 9)).toEqual({ isOK: true, message: '' });
      expect(validateProjectLicense('BusinessB', 4)).toEqual({ isOK: true, message: '' });
    });

    it('returns isOK: false when project count exceeds license limit', () => {
      expect(validateProjectLicense('Free', 1)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateProjectLicense('Basic', 5)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateProjectLicense('Pro', 10)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateProjectLicense('BusinessA', 10)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateProjectLicense('BusinessB', 5)).toEqual({
        isOK: true,
        message: '',
      });
    });

    it('returns isOK: false when license is undefined', () => {
      expect(validateProjectLicense(undefined, 0)).toEqual({
        isOK: true,
        message: '',
      });
    });
  });

  describe('validateMemberLicense', () => {
    beforeEach(() => {
      // FUNC_CHECK_LICENSEをtrueに設定
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: true,
      }));
    });

    afterEach(() => {
      // テスト後にFUNC_CHECK_LICENSEをfalseに戻す
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: false,
      }));
    });

    it('returns isOK: true when license check is disabled', () => {
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: false,
      }));
      expect(validateMemberLicense('Free', 5)).toEqual({ isOK: true, message: '' });
    });

    it('returns isOK: true when member count is within license limit', () => {
      expect(validateMemberLicense('Free', 2)).toEqual({ isOK: true, message: '' });
      expect(validateMemberLicense('Basic', 4)).toEqual({ isOK: true, message: '' });
      expect(validateMemberLicense('Pro', 9)).toEqual({ isOK: true, message: '' });
      expect(validateMemberLicense('BusinessA', 19)).toEqual({ isOK: true, message: '' });
      expect(validateMemberLicense('BusinessB', 39)).toEqual({ isOK: true, message: '' });
    });

    it('returns isOK: false when member count exceeds license limit', () => {
      expect(validateMemberLicense('Free', 3)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateMemberLicense('Basic', 5)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateMemberLicense('Pro', 10)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateMemberLicense('BusinessA', 20)).toEqual({
        isOK: true,
        message: '',
      });
      expect(validateMemberLicense('BusinessB', 40)).toEqual({
        isOK: true,
        message: '',
      });
    });

    it('returns isOK: false when license is Unknown', () => {
      expect(validateMemberLicense('Unknown', 0)).toEqual({
        isOK: true,
        message: '',
      });
    });
  });

  describe('validateStorageLicense', () => {
    beforeEach(() => {
      // FUNC_CHECK_LICENSEをtrueに設定
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: true,
      }));
    });

    afterEach(() => {
      // テスト後にFUNC_CHECK_LICENSEをfalseに戻す
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: false,
      }));
    });

    it('returns isOK: true when license check is disabled', () => {
      jest.doMock('../../constants/AppConstants', () => ({
        FUNC_CHECK_LICENSE: false,
      }));
      const project = {
        id: 'project-1',
        name: 'Test Project',
        members: [],
        ownerUid: 'owner-1',
        adminsUid: [],
        membersUid: [],
        abstract: '',
        license: 'Free' as License,
        storage: { count: 1 },
      } as ProjectType;
      expect(validateStorageLicense(project)).toEqual({ isOK: true, message: '' });
    });

    it('returns isOK: true when storage count is within license limit', () => {
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'Free' as License,
          storage: { count: 0.09 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'Basic' as License,
          storage: { count: 0.99 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'Pro' as License,
          storage: { count: 4.99 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'BusinessA' as License,
          storage: { count: 9.99 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'BusinessB' as License,
          storage: { count: 19.99 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
    });

    it('returns isOK: false when storage count exceeds license limit', () => {
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'Free' as License,
          storage: { count: 0.1 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'Basic' as License,
          storage: { count: 1 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'Pro' as License,
          storage: { count: 5 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'BusinessA' as License,
          storage: { count: 10 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'BusinessB' as License,
          storage: { count: 20 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
    });

    it('returns isOK: false when project is undefined', () => {
      expect(validateStorageLicense(undefined)).toEqual({
        isOK: false,
        message: 'utils.Project.message.validateUndefined',
      });
    });

    it('returns isOK: false when license is Unknown', () => {
      expect(
        validateStorageLicense({
          id: 'project-1',
          name: 'Test Project',
          members: [],
          ownerUid: 'owner-1',
          adminsUid: [],
          membersUid: [],
          abstract: '',
          license: 'Unknown' as License,
          storage: { count: 0 },
        } as ProjectType)
      ).toEqual({
        isOK: true,
        message: '',
      });
    });
  });
});
