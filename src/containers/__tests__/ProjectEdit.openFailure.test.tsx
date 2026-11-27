import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { ProjectEditContext } from '../../contexts/ProjectEdit';
import ProjectEditContainer from '../ProjectEdit';
import { Props_ProjectEdit } from '../../routes';
import { ProjectType } from '../../types';

// ACCOUNT_AUDIT_2026-11 の判断項目（推奨案）
// - A-H2: プロジェクトを開いていて、手元に触れた後で開くのに失敗したら、途中まで読み込んだ状態を残さず clearProject で閉じて知らせる
//   （閉じる前のバックアップは取らない。開いていなかったときは閉じない）
// - A-L2: 開いていない状態から開くとき、手元に記録があれば置き換えを確認する（Web は戻せないと書き分ける）

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
const mockNetInfoFetch = jest.fn(async (): Promise<{ type: string; isConnected?: boolean }> => ({ type: 'wifi' }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: () => mockNetInfoFetch() }));
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

const localRecord = { layerId: 'l1', userId: undefined, data: [{ id: 'r1', deleted: false }] };

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.length = 0;
  mockIsNew = false;
  mockIsProjectOpen = true;
  mockDataSet = [];
  mockCaptured.ctx = undefined;
  mockConfirmAsync.mockImplementation(async () => true);
  mockLoadE3kitGroup.mockResolvedValue({ isOK: true, message: '' });
  mockNetInfoFetch.mockImplementation(async () => ({ type: 'wifi' }));
});

describe('通信できないときに開く', () => {
  // Firestore はオフラインだと失敗せずキャッシュを返すので、開く処理に入ると古い（または空の）データで手元を置き換える
  it('確認も出さず、手元にも触れずに、つながっていないことを知らせる', async () => {
    mockNetInfoFetch.mockImplementation(async () => ({ type: 'none', isConnected: false }));
    mockDataSet = [localRecord];
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockAlertAsync).toHaveBeenCalledWith('Home.alert.noInternet');
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    expect(mockLoadE3kitGroup).not.toHaveBeenCalled();
    expect(mockDiscardSyncBaselines).not.toHaveBeenCalled();
    expect(mockDownloadProjectSettings).not.toHaveBeenCalled();
    expect(mockClearProject).not.toHaveBeenCalled();
  });

  it('接続の状態が分からない（null）ときは止めない', async () => {
    mockNetInfoFetch.mockImplementation(async () => ({ type: 'unknown' }));
    mockDownloadProjectSettings.mockResolvedValue({ isOK: false, message: 'network' });
    await renderContainer();
    await pressOpen();
    expect(mockLoadE3kitGroup).toHaveBeenCalledTimes(1);
  });
});

describe('A-H2: 開く途中の失敗', () => {
  it('設定の取得で失敗したら、閉じた状態に落として「閉じました」と知らせる', async () => {
    mockDownloadProjectSettings.mockResolvedValue({ isOK: false, message: 'network' });
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockClearProject).toHaveBeenCalledTimes(1);
    expect(mockAlertAsync).toHaveBeenCalledWith('ProjectEdit.alert.openFailedClosed\nnetwork');
  });

  it('閉じるときは閉じる前の自動バックアップを取らない（今の名前で中身が開く先の途中状態を最新世代にしない）', async () => {
    mockDownloadProjectSettings.mockResolvedValue({ isOK: true, message: '', region: {} });
    await renderContainer();
    await pressOpen();
    expect(mockClearProject).toHaveBeenCalledWith({ skipBackup: true });
  });

  it('設定の取得の後（データの取得）で例外になっても閉じる', async () => {
    mockDownloadProjectSettings.mockResolvedValue({ isOK: true, message: '', region: {} });
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockClearProject).toHaveBeenCalledTimes(1);
  });

  it('鍵の読み込みで開く前に中止したときは、手元に触れていないので閉じない', async () => {
    mockLoadE3kitGroup.mockResolvedValue({ isOK: false, message: 'network' });
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockClearProject).not.toHaveBeenCalled();
    expect(mockAlertAsync).toHaveBeenCalledWith('network');
  });

  it('開いていない状態から開いて失敗したら閉じない（独自の地図一覧やレイヤ構成を初期化しない）', async () => {
    mockIsProjectOpen = false;
    mockDownloadProjectSettings.mockResolvedValue({ isOK: false, message: 'network' });
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockClearProject).not.toHaveBeenCalled();
    expect(mockAlertAsync).toHaveBeenCalledWith('network');
  });

  it('開いていない状態でデータの取得の途中で失敗しても閉じない', async () => {
    mockIsProjectOpen = false;
    mockDownloadProjectSettings.mockResolvedValue({ isOK: true, message: '', region: {} });
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockClearProject).not.toHaveBeenCalled();
  });
});

describe('A-L2: 開いていない状態から開くときの置き換えの確認', () => {
  it('手元に記録があれば確認し、キャンセルなら手元に触れない', async () => {
    mockIsProjectOpen = false;
    mockDataSet = [localRecord];
    mockConfirmAsync.mockImplementation(async () => false);
    await renderContainer();
    expect(await pressOpen()).toBe(false);
    expect(mockConfirmAsync).toHaveBeenCalledWith('ProjectEdit.confirm.replaceLocalData');
    expect(mockLoadE3kitGroup).not.toHaveBeenCalled();
    expect(mockDiscardSyncBaselines).not.toHaveBeenCalled();
  });

  it('記録が無い（削除済みだけ）なら確認しない', async () => {
    mockIsProjectOpen = false;
    mockDataSet = [{ ...localRecord, data: [{ id: 'r1', deleted: true }] }];
    mockDownloadProjectSettings.mockResolvedValue({ isOK: false, message: '' });
    await renderContainer();
    await pressOpen();
    expect(mockConfirmAsync).not.toHaveBeenCalledWith('ProjectEdit.confirm.replaceLocalData');
    expect(mockLoadE3kitGroup).toHaveBeenCalled();
  });

  it('プロジェクトを開いているときは従来の開き直しの確認だけ', async () => {
    mockDataSet = [localRecord];
    mockConfirmAsync.mockImplementation(async () => false);
    await renderContainer();
    await pressOpen();
    expect(mockConfirmAsync).toHaveBeenCalledWith('Home.confirm.reOpenProject');
    expect(mockConfirmAsync).not.toHaveBeenCalledWith('ProjectEdit.confirm.replaceLocalData');
  });
});
