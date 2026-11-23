import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { ProjectsContext } from '../../contexts/Projects';
import { AlertAsync } from '../../components/molecules/AlertAsync';
import ProjectsContainers from '../Projects';
import { Props_Projects } from '../../routes';

// A-M5（ACCOUNT_AUDIT_2026-11）: 復号できないプロジェクトがあるときの案内（isOK:true の message）を表示する

const mockCaptured: { ctx?: React.ContextType<typeof ProjectsContext> } = {};
const mockFetchProjects = jest.fn();
const mockToggleShowArchive = jest.fn();
const mockOrder: string[] = [];

jest.mock('../../components/pages/Projects', () => {
  const { useContext: useCtx } = jest.requireActual('react');
  const { ProjectsContext: Ctx } = jest.requireActual('../../contexts/Projects');
  return function MockProjects() {
    mockCaptured.ctx = useCtx(Ctx);
    return null;
  };
});
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async (message: string) => {
    mockOrder.push(`alert:${message}`);
  }),
  ConfirmAsync: jest.fn(async () => true),
}));
jest.mock('../../components/atoms/Alert', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../hooks/useProjects', () => ({
  useProjects: () => ({
    user: { uid: 'u1', email: 'u1@example.com', displayName: 'u1', photoURL: null },
    isLoading: false,
    projects: [],
    favoriteProjectIds: [],
    showOnlyFavorites: false,
    isShowArchive: false,
    sortField: 'name',
    sortOrder: 'asc',
    changeProjectSort: jest.fn(),
    fetchProjects: mockFetchProjects,
    generateProject: jest.fn(),
    toggleFavorite: jest.fn(),
    toggleShowOnlyFavorites: jest.fn(),
    toggleShowArchive: mockToggleShowArchive,
    archiveProject: jest.fn(),
    unarchiveProject: jest.fn(),
    dekMigratableProjects: [],
    migrateProjectsToDEK: jest.fn(),
  }),
}));
jest.mock('../../hooks/usePermission', () => ({ usePermission: () => ({ isSettingProject: false }) }));
jest.mock('../../hooks/useAccount', () => ({
  useAccount: () => ({ restoreEncryptKey: jest.fn(), cleanupEncryptKey: jest.fn() }),
}));
jest.mock('../../hooks/useE3kitGroup', () => ({ useE3kitGroup: () => ({ reshareMemberKeys: jest.fn() }) }));
jest.mock('../../lib/firebase/firestore', () => ({ findStaleMemberKeys: jest.fn() }));
jest.mock('../../components/organisms/ProjectsModalReshareKeys', () => ({}));

const mockAlertAsync = AlertAsync as jest.MockedFunction<typeof AlertAsync>;

const renderContainer = () => {
  const navigation = {
    navigate: jest.fn((name: string) => {
      mockOrder.push(`navigate:${name}`);
    }),
    setParams: jest.fn(),
  };
  const props = { navigation, route: { params: {} } } as unknown as Props_Projects;
  render(<ProjectsContainers {...props} />);
  return navigation;
};

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder.length = 0;
});

describe('A-M5: 読み込めないプロジェクトの案内', () => {
  it('一覧の読み込みが成功しても message があれば表示する', async () => {
    mockFetchProjects.mockResolvedValue({ isOK: true, message: 'common.message.cannotLoadProject' });
    renderContainer();
    await waitFor(() => expect(mockAlertAsync).toHaveBeenCalledWith('common.message.cannotLoadProject'));
  });

  it('鍵の誘導で画面を移る前に表示する', async () => {
    mockFetchProjects.mockResolvedValue({
      isOK: true,
      message: 'common.message.cannotLoadProject',
      keyGuidance: { accountFormState: 'restoreEncryptKey', message: 'guide' },
    });
    renderContainer();
    await waitFor(() =>
      expect(mockOrder).toEqual(['alert:common.message.cannotLoadProject', 'navigate:Account'])
    );
  });

  it('message が空なら何も出さない', async () => {
    mockFetchProjects.mockResolvedValue({ isOK: true, message: '' });
    renderContainer();
    await waitFor(() => expect(mockFetchProjects).toHaveBeenCalled());
    await act(flush);
    expect(mockAlertAsync).not.toHaveBeenCalled();
  });

  it('アーカイブ表示の切替でも表示する', async () => {
    mockFetchProjects.mockResolvedValue({ isOK: true, message: '' });
    mockToggleShowArchive.mockResolvedValue({ isOK: true, message: 'common.message.cannotLoadProject' });
    renderContainer();
    await waitFor(() => expect(mockFetchProjects).toHaveBeenCalled());
    await act(async () => {
      await mockCaptured.ctx?.toggleShowArchive();
    });
    expect(mockAlertAsync).toHaveBeenCalledWith('common.message.cannotLoadProject');
  });
});
