import { renderHook } from '@testing-library/react-hooks';
import { usePermission } from '../../hooks/usePermission';
import { RoleType, UserType } from '../../types';

let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useSelector: () => mockSelector(),
}));

describe('usePermission', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const user: UserType = {
    uid: '0',
    email: 'mizutani.takayuki@gmail.com',
    displayName: 'Takayuki Mizutani',
    photoURL: 'https://www.dummy.com/test.jpg',
  };

  let projectId: string | undefined = '0';
  let role: RoleType | undefined = 'OWNER';
  const isSettingProject = true;

  test('オーナーなら編集可能', () => {
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.editable).toBe(true);
  });
  test('プロジェクトを開いてなければ編集可能', () => {
    projectId = undefined;
    role = undefined;
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.editable).toBe(true);
  });
  test('メンバーはプロジェクトを開いている時は編集不可', () => {
    projectId = '0';
    role = 'MEMBER';
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.editable).toBe(false);
  });
});
