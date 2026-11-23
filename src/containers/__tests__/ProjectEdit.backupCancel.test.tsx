import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { ProjectEditContext } from '../../contexts/ProjectEdit';
import ProjectEditContainer from '../ProjectEdit';
import { Props_ProjectEdit } from '../../routes';
import { ProjectType } from '../../types';

// 永続化監査 S-L2: 開く前の自動バックアップを作れず、続けるのを取りやめたら、今のプロジェクトの同期基準値に触れず
// 設定も取りに行かない（基準値を捨ててから尋ねると、取りやめたのに同期監査 L11 の確認が外れる）

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
const mockAlertAsync = jest.fn(async (_message: string) => undefined);
const mockConfirmAsync = jest.fn(async (_message: string) => true);
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: (message: string) => mockAlertAsync(message),
  ConfirmAsync: (message: string) => mockConfirmAsync(message),
}));
const mockBackupBeforeReplace = jest.fn(async (_state: unknown, _trigger: string) => {
  mockOrder.push('backup');
  return true;
});
jest.mock('../../utils/backupBeforeReplace', () => ({
  backupBeforeReplace: (state: unknown, trigger: string) => mockBackupBeforeReplace(state, trigger),
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
const mockClearProject = jest.fn();
let mockDataSet: unknown[] = [];
let mockIsProjectOpen = true;
jest.mock('../../hooks/useProject', () => ({ useProject: () => ({ clearProject: mockClearProject }) }));
jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: () => ({ getState: () => ({ dataSet: mockDataSet }) }),
}));
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
    isProjectOpen: mockIsProjectOpen,
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

const pressOpen = async () => {
  let result: boolean | void | undefined;
  await act(async () => {
    result = await mockCaptured.ctx?.pressOpenProject(false);
  });
  return result;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.length = 0;
  mockIsNew = false;
  mockIsProjectOpen = true;
  mockDataSet = [];
  mockCaptured.ctx = undefined;
  mockConfirmAsync.mockImplementation(async () => true);
  mockLoadE3kitGroup.mockResolvedValue({ isOK: true, message: '' });
});

describe('開く前の自動バックアップ（永続化監査 S-L2）', () => {
  it('作れず取りやめたら、基準値を捨てず・設定を取りに行かず・閉じない', async () => {
    mockBackupBeforeReplace.mockImplementationOnce(async () => false);
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockBackupBeforeReplace).toHaveBeenCalledWith(expect.anything(), 'projectOpen');
    expect(mockDiscardSyncBaselines).not.toHaveBeenCalled();
    expect(mockDownloadProjectSettings).not.toHaveBeenCalled();
    expect(mockClearProject).not.toHaveBeenCalled();
  });

  it('続けるなら、バックアップの後で基準値を捨てて設定を取りに行く', async () => {
    mockDownloadProjectSettings.mockResolvedValue({ isOK: false, message: 'network' });
    await renderContainer();
    await pressOpen();
    expect(mockOrder).toEqual(['backup', 'discard']);
    expect(mockDownloadProjectSettings).toHaveBeenCalled();
  });
});
