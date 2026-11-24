import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { ProjectEditContext } from '../../contexts/ProjectEdit';
import ProjectEditContainer from '../ProjectEdit';
import { Props_ProjectEdit } from '../../routes';
import { ProjectType } from '../../types';
import { AlertAsync } from '../../components/molecules/AlertAsync';

// 保存前の照合（2026-11-24 Pixel 実機）: 一覧は端末に保存した内容から出るので、開いた編集画面が古いことがある。
// ほかの端末でプロジェクトが更新されていたら、古い内容で黙って上書きせず止める

const mockCaptured: { ctx?: React.ContextType<typeof ProjectEditContext> } = {};
const mockOrder: string[] = [];
const mockDiscardSyncBaselines = jest.fn(() => {
  mockOrder.push('discard');
});
const mockLoadE3kitGroup = jest.fn();
const mockCreateE3kitGroup = jest.fn();
const mockCreateProject = jest.fn();
const mockDownloadProjectSettings = jest.fn();
const mockUpdateProject = jest.fn();
const mockUpdateE3kitGroupMembers = jest.fn();
const mockSaveProject = jest.fn();
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
  encryptedAt: new Date('2026-11-24T10:00:00.000Z'),
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
jest.mock('../../hooks/useProject', () => ({ useProject: () => ({ clearProject: jest.fn() }) }));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: () => ({ getState: () => ({ dataSet: [] }) }),
}));
jest.mock('../../i18n/dayjs', () => jest.fn());
jest.mock('../../utils/trackingLeaveGuard', () => ({
  leaveWithTrackingGuard: jest.fn(async (_kind: string, confirm: () => Promise<boolean>) => confirm()),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: 'wifi' })) }));
jest.mock('../../utils/File', () => ({ exportGeoFile: jest.fn() }));
jest.mock('../../lib/crypto/migration', () => ({ getKeyMigrationState: jest.fn(async () => 'none') }));
jest.mock('../../hooks/useProjects', () => ({ resolveKeyRestoreMessage: jest.fn(() => 'restore') }));
const mockGetProjectEncryptedAt = jest.fn();
jest.mock('../../lib/firebase/firestore', () => ({
  getMemberKeyFreshness: jest.fn(async () => ({})),
  getProjectEncryptedAt: (...args: unknown[]) => mockGetProjectEncryptedAt(...args),
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
    saveProject: mockSaveProject,
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
    updateE3kitGroupMembers: mockUpdateE3kitGroupMembers,
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
    updateProject: mockUpdateProject,
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
  mockIsNew = false;
  mockCaptured.ctx = undefined;
  mockUpdateE3kitGroupMembers.mockImplementation(async (_o: ProjectType, p: ProjectType) => ({ isOK: true, message: '', project: p }));
  mockUpdateProject.mockImplementation(async (p: ProjectType) => ({
    isOK: true,
    message: '',
    project: { ...p, encryptedAt: new Date('2026-11-24T12:00:00.000Z') },
  }));
});

const pressSave = async () => {
  await act(async () => {
    await mockCaptured.ctx!.pressSaveProject();
  });
};

describe('pressSaveProject: 保存前にクラウドの最新と照合する', () => {
  it('クラウドの方が新しければ保存せず、一覧の更新を案内する', async () => {
    mockGetProjectEncryptedAt.mockResolvedValue({ isOK: true, exists: true, encryptedAt: new Date('2026-11-24T11:00:00.000Z') });
    await renderContainer();
    await pressSave();
    expect(mockGetProjectEncryptedAt).toHaveBeenCalledWith('p-initial');
    expect(AlertAsync).toHaveBeenCalledWith('ProjectEdit.alert.staleProject');
    expect(mockUpdateE3kitGroupMembers).not.toHaveBeenCalled();
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('クラウドと同じ時刻なら保存し、書いた時刻を持たせて画面の元の内容を更新する', async () => {
    mockGetProjectEncryptedAt.mockResolvedValue({ isOK: true, exists: true, encryptedAt: new Date('2026-11-24T10:00:00.000Z') });
    await renderContainer();
    await pressSave();
    expect(mockUpdateProject).toHaveBeenCalledTimes(1);
    expect(mockSaveProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-initial', encryptedAt: new Date('2026-11-24T12:00:00.000Z') })
    );
    expect(AlertAsync).not.toHaveBeenCalledWith('ProjectEdit.alert.staleProject');
  });

  it('クラウドから消えていれば保存しない', async () => {
    mockGetProjectEncryptedAt.mockResolvedValue({ isOK: true, exists: false });
    await renderContainer();
    await pressSave();
    expect(AlertAsync).toHaveBeenCalledWith('ProjectEdit.alert.projectGone');
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('最新を確かめられなければ保存しない', async () => {
    mockGetProjectEncryptedAt.mockResolvedValue({ isOK: false, exists: false });
    await renderContainer();
    await pressSave();
    expect(AlertAsync).toHaveBeenCalledWith('ProjectEdit.alert.checkLatestFailed');
    expect(mockUpdateProject).not.toHaveBeenCalled();
  });

  it('新規作成では照合しない', async () => {
    mockIsNew = true;
    mockCreateE3kitGroup.mockImplementation(async (p: ProjectType) => ({ isOK: true, message: '', project: p }));
    mockCreateProject.mockResolvedValue({ isOK: true, message: '' });
    await renderContainer();
    await pressSave();
    expect(mockGetProjectEncryptedAt).not.toHaveBeenCalled();
  });
});
