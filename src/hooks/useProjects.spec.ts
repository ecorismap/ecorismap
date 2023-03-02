import { renderHook, act } from '@testing-library/react-hooks';
import { ProjectType, UserType } from '../../types';
import { useProjects } from '../../hooks/useProjects';
import { ROLETYPE } from '../../constants/AppConstants';

const userA: UserType = {
  uid: '0123',
  email: 'abc@test.com',
  displayName: 'abc',
  photoURL: 'https://www.dummy.com/test.jpg',
};

const userB: UserType = {
  uid: '4567',
  email: 'def@test.com',
  displayName: 'def',
  photoURL: 'https://www.dummy.com/test.jpg',
};

const projectsA: ProjectType[] = [
  {
    id: '0',
    name: 'test0 project',
    ownerUid: '0123',
    adminsUid: ['0123'],
    members: [{ uid: '0123', email: 'abc@test.com', verified: true, role: 'OWNER' }],
    membersUid: ['0123'],
    abstract: 'this is test0 project',
  },
];

const projectsB: ProjectType[] = [
  {
    id: '1',
    name: 'test1 project',
    ownerUid: '4567',
    adminsUid: ['4567'],
    membersUid: ['4567'],
    members: [{ uid: '4567', email: 'def@test.com', verified: true, role: 'OWNER' }],
    abstract: 'this is test1 project',
  },
];

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => jest.fn(),
}));

let mockGetAllProject = jest.fn();
jest.mock('../../lib/firebase/Firebase', () => ({
  getAllProjects: (userMail: string) => mockGetAllProject(userMail),
}));

describe('useProject', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectsA)
      .mockReturnValueOnce(projectsB)
      .mockReturnValueOnce(projectsB)
      .mockReturnValueOnce(projectsA)
      .mockReturnValueOnce(projectsA);
    mockGetAllProject = jest.fn((userMail: string) =>
      Promise.resolve(userMail === 'abc@test.com' ? projectsA : projectsB)
    );
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  //let result: RenderResult<UseProjectReturnType>;

  test('最初とuserが変更になったらgetAllProjectが呼ばれる', async () => {
    await act(async () => {
      const { rerender, result, waitFor } = renderHook((user: UserType) => useProjects(user), {
        initialProps: userA,
      });
      await waitFor(() => result.current.projects === projectsA);
      rerender(userB);
      await waitFor(() => result.current.projects === projectsB);
      rerender(userB);
      await waitFor(() => result.current.projects === projectsB);
      rerender(userA);
      rerender(userA);
    });

    expect(mockGetAllProject.mock.calls.length).toBe(3);
  });
});
