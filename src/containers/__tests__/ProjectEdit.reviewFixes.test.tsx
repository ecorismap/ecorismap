import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { ProjectEditContext } from '../../contexts/ProjectEdit';
import ProjectEditContainer from '../ProjectEdit';
import { Props_ProjectEdit } from '../../routes';
import { ProjectType } from '../../types';

// ACCOUNT_AUDIT_2026-11 のレビュー指摘
// - A-H2: 今のプロジェクトの同期の基準値は、鍵の問題などで開く前に中止したときは捨てない
// - A-M3: 後始末で消した id を再保存で使い回さない（Functions の連鎖削除が後から走るため）

const mockCaptured: { ctx?: React.ContextType<typeof ProjectEditContext> } = {};
const mockOrder: string[] = [];
const mockDiscardSyncBaselines = jest.fn(() => {
  mockOrder.push('discard');
});
const mockLoadE3kitGroup = jest.fn();
const mockCreateE3kitGroup = jest.fn();
const mockCreateProject = jest.fn();
const mockDownloadProjectSettings = jest.fn();
const mockProject: ProjectType = {
  id: 'p-initial',
  name: 'P',
  members: [{ uid: 'u1', email: 'u1@example.com', verified: 'OK', role: 'OWNER' }],
  ownerUid: 'u1',
  adminsUid: ['u1'],
  membersUid: ['u1'],
  abstract: '',
  storage: { count: 0 },
  license: 'Unknown',
} as unknown as ProjectType;
let mockIsNew = false;

jest.mock('../../components/pages/ProjectEdit', () => {
  const { useContext: useCtx } = jest.requireActual('react');
  const { ProjectEditContext: Ctx } = jest.requireActual('../../contexts/ProjectEdit');
  return function MockProjectEdit() {
    mockCaptured.ctx = useCtx(Ctx);
    return null;
  };
});
jest.mock('../../components/organisms/HomeModalConflictResolver', () => ({ ConflictResolverModal: () => null }));
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async () => undefined),
  ConfirmAsync: jest.fn(async () => true),
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../i18n/dayjs', () => jest.fn());
jest.mock('../../utils/trackingLeaveGuard', () => ({
  leaveWithTrackingGuard: jest.fn(async (_kind: string, confirm: () => Promise<boolean>) => confirm()),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: 'wifi' })) }));
jest.mock('../../utils/File', () => ({ exportGeoFile: jest.fn() }));
jest.mock('../../lib/crypto/migration', () => ({ getKeyMigrationState: jest.fn(async () => 'none') }));
jest.mock('../../hooks/useProjects', () => ({ resolveKeyRestoreMessage: jest.fn(() => 'restore') }));
jest.mock('../../lib/firebase/firestore', () => ({
  getMemberKeyFreshness: jest.fn(async () => ({})),
  migrateSelfDataToDEK: jest.fn(),
}));
jest.mock('../../hooks/useEcorismapFile', () => ({
  useEcorisMapFile: () => ({ generateEcorisMapData: jest.fn(), createExportSettings: jest.fn() }),
}));
jest.mock('../../hooks/useProjectEdit', () => ({
  useProjectEdit: () => ({
    isProjectOpen: true,
    isOwner: true,
    isOwnerAdmin: true,
    isNew: mockIsNew,
    user: { uid: 'u1' },
    targetProject: mockProject,
    originalProject: mockProject,
    isEdited: true,
    checkedProject: jest.fn(async () => ({ isOK: true, message: '', project: mockProject })),
    saveProject: jest.fn(),
    changeText: jest.fn(),
    changeMemberText: jest.fn(),
    changeAdmin: jest.fn(),
    addMembers: jest.fn(),
    deleteMember: jest.fn(),
    openProject: jest.fn(),
    discardSyncBaselines: mockDiscardSyncBaselines,
    startProjectSetting: jest.fn(),
  }),
}));
jest.mock('../../hooks/useE3kitGroup', () => ({
  useE3kitGroup: () => ({
    loadE3kitGroup: mockLoadE3kitGroup,
    deleteE3kitGroup: jest.fn(),
    updateE3kitGroupMembers: jest.fn(),
    createE3kitGroup: mockCreateE3kitGroup,
    reshareMemberKey: jest.fn(),
  }),
}));
jest.mock('../../hooks/useRepository', () => ({
  useRepository: () => ({
    deleteProject: jest.fn(),
    fetchProjectSettings: jest.fn(),
    fetchAllData: jest.fn(),
    createProject: mockCreateProject,
    updateProject: jest.fn(),
    downloadProjectSettings: mockDownloadProjectSettings,
    fetchPublicData: jest.fn(),
    fetchPrivateData: jest.fn(),
    fetchTemplateData: jest.fn(),
    downloadCommonData: jest.fn(),
    downloadTemplateData: jest.fn(),
    createMergedDataSet: jest.fn(),
    conflictState: { visible: false, queue: [] },
    handleSelect: jest.fn(),
    handleBulkSelect: jest.fn(),
  }),
}));

const renderContainer = async () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const props = {
    navigation,
    route: { params: { project: mockProject, isNew: mockIsNew } },
  } as unknown as Props_ProjectEdit;
  render(<ProjectEditContainer {...props} />);
  await waitFor(() => expect(mockCaptured.ctx).toBeDefined());
  return navigation;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.length = 0;
  mockIsNew = false;
  mockCaptured.ctx = undefined;
});

describe('pressOpenProject: 基準値を捨てる時機', () => {
  it('鍵などの問題で開く前に中止したら、基準値を捨てない', async () => {
    mockLoadE3kitGroup.mockResolvedValue({ isOK: false, message: 'network' });
    await renderContainer();
    await act(async () => {
      await mockCaptured.ctx?.pressOpenProject(false);
    });
    expect(mockDiscardSyncBaselines).not.toHaveBeenCalled();
    expect(mockDownloadProjectSettings).not.toHaveBeenCalled();
  });

  it('鍵の読み込みに成功したら、手元を書き換える前に基準値を捨てる', async () => {
    mockLoadE3kitGroup.mockResolvedValue({ isOK: true, message: '' });
    mockDownloadProjectSettings.mockImplementation(async () => {
      mockOrder.push('downloadSettings');
      return { isOK: false, message: 'fail' };
    });
    await renderContainer();
    await act(async () => {
      await mockCaptured.ctx?.pressOpenProject(false);
    });
    expect(mockOrder).toEqual(['discard', 'downloadSettings']);
  });
});

describe('pressSaveProject（新規）: 再保存では別の id を使う', () => {
  it('1回目に失敗した後の再保存は、1回目と違う id で作る', async () => {
    mockIsNew = true;
    mockCreateE3kitGroup.mockImplementation(async (project: ProjectType) => ({ isOK: true, message: '', project }));
    mockCreateProject.mockResolvedValueOnce({ isOK: false, message: 'fail' });
    mockCreateProject.mockResolvedValueOnce({ isOK: true, message: '' });
    const navigation = await renderContainer();
    await act(async () => {
      await mockCaptured.ctx?.pressSaveProject();
    });
    await act(async () => {
      await mockCaptured.ctx?.pressSaveProject();
    });
    const firstId = (mockCreateProject.mock.calls[0][0] as ProjectType).id;
    const secondId = (mockCreateProject.mock.calls[1][0] as ProjectType).id;
    expect(firstId).toBe('p-initial');
    expect(secondId).not.toBe(firstId);
    expect(navigation.navigate).toHaveBeenCalledWith('Projects', { reload: true });
  });
});
