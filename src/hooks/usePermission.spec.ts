import { renderHook } from '@testing-library/react-hooks';
import { usePermission } from './usePermission';

let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useSelector: () => mockSelector(),
}));

describe('usePermission', () => {
  // beforeEach(() => {
  //   jest.resetAllMocks();
  // });
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('管理者になっている', () => {
    const projectId = '0';
    const role = 'ADMIN';
    const isSettingProject = true;
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.isOwnerAdmin).toBe(true);
    expect(result.current.isMember).toBe(false);
  });

  test('プロジェクトを開いていないので管理者にもメンバーにもなっていない', () => {
    const projectId = undefined;
    const role = 'ADMIN';
    const isSettingProject = false;
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.isClosedProject).toBe(true);
    expect(result.current.isRunningProject).toBe(false);
    expect(result.current.isSettingProject).toBe(false);
    expect(result.current.isOwnerAdmin).toBe(false);
    expect(result.current.isMember).toBe(false);
  });

  test('管理者がプロジェクトを開いている', () => {
    const projectId = '0';
    const role = 'OWNER';
    const isSettingProject = false;
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.isClosedProject).toBe(false);
    expect(result.current.isRunningProject).toBe(true);
    expect(result.current.isSettingProject).toBe(false);
    expect(result.current.isOwnerAdmin).toBe(true);
    expect(result.current.isMember).toBe(false);
  });
  test('メンバーとしてプロジェクトを開いてる', () => {
    const projectId = '0';
    const role = 'MEMBER';
    const isSettingProject = false;
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.isClosedProject).toBe(false);
    expect(result.current.isRunningProject).toBe(true);
    expect(result.current.isSettingProject).toBe(false);
    expect(result.current.isOwnerAdmin).toBe(false);
    expect(result.current.isMember).toBe(true);
  });
  test('管理者がプロジェクトを設定中', () => {
    const projectId = '0';
    const role = 'OWNER';
    const isSettingProject = true;
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    const { result } = renderHook(() => usePermission());
    expect(result.current.isClosedProject).toBe(false);
    expect(result.current.isRunningProject).toBe(false);
    expect(result.current.isSettingProject).toBe(true);
    expect(result.current.isOwnerAdmin).toBe(true);
    expect(result.current.isMember).toBe(false);
  });
  test('メンバーはプロジェクトページを開けないはず。', () => {
    const projectId = '0';
    const role = 'MEMBER';
    const isSettingProject = true;
    console.assert = jest.fn();
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(role)
      .mockReturnValueOnce(isSettingProject);
    renderHook(() => usePermission());
    expect(console.assert).toHaveBeenCalledWith(false, 'Member should not open Setting Page');
  });
});
