import React from 'react';
import { Platform } from 'react-native';
import { render, userEvent } from '@testing-library/react-native';
import Projects from '../Projects';
import { ProjectsContext } from '../../../contexts/Projects';
import { ProjectType, UserType } from '../../../types';

// @expo/vector-iconsのモック
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'View',
}));
// Redux接続を持つ子コンポーネントはモックする（このテストは一覧の表示・ソートのみ対象）
jest.mock('../../organisms/ProjectsButtons', () => ({ ProjectsButtons: () => null }));
jest.mock('../../organisms/ProjectsModalEncryptPassword', () => ({ ProjectsModalEncryptPassword: () => null }));

const user: UserType = { uid: 'u1', email: 'a@example.com', displayName: 'me', photoURL: null };

const makeProject = (
  id: string,
  name: string,
  options: Partial<Pick<ProjectType, 'ownerUid' | 'archived' | 'settingsEncryptedAt'>> = {}
): ProjectType => ({
  id,
  name,
  members: [],
  ownerUid: options.ownerUid ?? 'other',
  adminsUid: [],
  membersUid: [],
  abstract: '',
  storage: { count: 0 },
  archived: options.archived,
  settingsEncryptedAt: options.settingsEncryptedAt,
});

// 既定ソート(更新日時の降順)で C, B, A の順になる日時を与える。
// アーカイブ列の3状態: A=アーカイブできる(自分がオーナー・未アーカイブ) / B=操作不可(他人がオーナー) / C=復元できる(自分がオーナー・アーカイブ済み)
const projects: ProjectType[] = [
  makeProject('a', 'A', { ownerUid: 'u1', settingsEncryptedAt: new Date('2026-01-01') }),
  makeProject('b', 'B', { settingsEncryptedAt: new Date('2026-02-01') }),
  makeProject('c', 'C', { ownerUid: 'u1', archived: true, settingsEncryptedAt: new Date('2026-03-01') }),
];

const createContextValue = () => ({
  projects,
  user,
  isLoading: false,
  isEncryptPasswordModalOpen: false,
  favoriteProjectIds: [],
  showOnlyFavorites: false,
  isShowArchive: true,
  pressEncryptPasswordOK: jest.fn(),
  pressEncryptPasswordCancel: jest.fn(),
  onReloadProjects: jest.fn(),
  pressAddProject: jest.fn(),
  gotoProject: jest.fn(),
  gotoBack: jest.fn(),
  toggleFavorite: jest.fn(),
  toggleShowOnlyFavorites: jest.fn(),
  toggleShowArchive: jest.fn(),
  pressArchiveProject: jest.fn(),
  pressRestoreProject: jest.fn(),
  dekMigratableCount: 0,
  migrationProgress: '',
  pressMigrateProjects: jest.fn(),
});

const renderProjects = async () =>
  await render(
    <ProjectsContext.Provider value={createContextValue()}>
      <Projects />
    </ProjectsContext.Provider>
  );

describe('Projects ソート', () => {
  let originalOS: typeof Platform.OS;
  beforeAll(() => {
    // アーカイブ列はWeb版のみ表示のため
    originalOS = Platform.OS;
    Platform.OS = 'web';
  });
  afterAll(() => {
    Platform.OS = originalOS;
  });

  const rowName = (queryByTestId: any, index: number) => queryByTestId(`project-${index}`)?.props.children;

  it('名前ヘッダーを押すと名前の降順に並ぶ(既存機能の確認)', async () => {
    const { getByText, queryByTestId } = await renderProjects();
    await userEvent.press(getByText('common.projectName'));
    expect(rowName(queryByTestId, 0)).toBe('C');
  });

  it('初期状態は更新日時の降順', async () => {
    const { queryByTestId } = await renderProjects();
    expect([rowName(queryByTestId, 0), rowName(queryByTestId, 1), rowName(queryByTestId, 2)]).toEqual(['C', 'B', 'A']);
  });

  it('アーカイブヘッダーを押すと「アーカイブできる・操作不可・復元できる」の順に並ぶ(降順)', async () => {
    const { getByText, queryByTestId } = await renderProjects();
    await userEvent.press(getByText('Projects.label.archive'));
    expect([rowName(queryByTestId, 0), rowName(queryByTestId, 1), rowName(queryByTestId, 2)]).toEqual(['A', 'B', 'C']);
  });

  it('アーカイブヘッダーを2回押すと逆順(復元できるが先頭)に並ぶ(昇順)', async () => {
    const { getByText, queryByTestId } = await renderProjects();
    await userEvent.press(getByText('Projects.label.archive'));
    await userEvent.press(getByText('Projects.label.archive'));
    expect([rowName(queryByTestId, 0), rowName(queryByTestId, 1), rowName(queryByTestId, 2)]).toEqual(['C', 'B', 'A']);
  });

  it('オーナーヘッダーを押すと自分がオーナーのものが先頭に並ぶ(降順)', async () => {
    const { getByText, queryByTestId } = await renderProjects();
    await userEvent.press(getByText('common.owner'));
    expect([rowName(queryByTestId, 0), rowName(queryByTestId, 1), rowName(queryByTestId, 2)]).toEqual(['A', 'C', 'B']);
  });
});
