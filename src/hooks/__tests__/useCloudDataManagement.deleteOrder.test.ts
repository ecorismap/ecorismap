jest.mock('../../lib/firebase/firestore', () => ({
  downloadLayerDataGroups: jest.fn(async () => ({ isOK: true, complete: true, groups: [] })),
  deleteData: jest.fn(async () => ({ isOK: true, message: '' })),
  deleteLayerFromSettings: jest.fn(async () => ({ isOK: true, message: '' })),
  downloadProjectSettings: jest.fn(async () => ({ isOK: true, data: { layers: [{ id: 'L', name: 'L' }] } })),
  getCloudDataSummary: jest.fn(async () => ({
    isOK: true,
    data: [
      { layerId: 'L', userId: 'A', permission: 'PUBLIC', chunkCount: 1, lastUpdatedAt: new Date(2) },
      { layerId: 'L', userId: 'B', permission: 'PUBLIC', chunkCount: 1, lastUpdatedAt: new Date(1) },
    ],
  })),
}));
jest.mock('../../lib/firebase/storage', () => ({
  listLayerPhotoPaths: jest.fn(async (_p: string, _l: string, u: string) => [`projects/P/PHOTO/L/${u}/PH`]),
  deletePhotoPaths: jest.fn(async () => 0),
  deleteLayerPhotos: jest.fn(),
}));
jest.mock('../../i18n/config', () => ({ t: (k: string) => k }));
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn(), useSelector: () => [] }));

import { act, renderHook } from '@testing-library/react-hooks';
import { useCloudDataManagement } from '../useCloudDataManagement';
import * as projectStore from '../../lib/firebase/firestore';
import * as projectStorage from '../../lib/firebase/storage';

const project = { id: 'P', members: [] } as any;
const user = { uid: 'X', email: 'x@example.com', displayName: 'X', photoURL: null, emailVerified: true } as any;

const setup = async () => {
  const hook = renderHook(() => useCloudDataManagement(project, user));
  await act(async () => {
    await hook.result.current.fetchCloudData();
  });
  act(() => hook.result.current.changeLayerChecked(0, true));
  return hook;
};

describe('deleteCloudData の順序（写真監査 P-H2）', () => {
  beforeEach(() => jest.clearAllMocks());

  it('写真フォルダの一覧と照合データを、データを消す前に取る', async () => {
    const hook = await setup();
    await act(async () => {
      await hook.result.current.deleteCloudData();
    });
    const list = (projectStorage.listLayerPhotoPaths as jest.Mock).mock.invocationCallOrder[0];
    const load = (projectStore.downloadLayerDataGroups as jest.Mock).mock.invocationCallOrder[0];
    const firstDelete = (projectStore.deleteData as jest.Mock).mock.invocationCallOrder[0];
    expect(list).toBeLessThan(load);
    expect(load).toBeLessThan(firstDelete);
    expect(projectStorage.deletePhotoPaths).toHaveBeenCalledWith(
      'P',
      expect.arrayContaining(['projects/P/PHOTO/L/A/PH', 'projects/P/PHOTO/L/B/PH']),
      expect.any(Number)
    );
  });

  it('途中でデータの削除に失敗しても、消せた分の写真は片付け、消せなかった分は残す', async () => {
    const groups = [
      { permission: 'PUBLIC', userId: 'A', records: [] },
      { permission: 'PUBLIC', userId: 'B', records: [] },
    ];
    (projectStore.downloadLayerDataGroups as jest.Mock).mockResolvedValue({ isOK: true, complete: true, groups });
    (projectStore.deleteData as jest.Mock)
      .mockResolvedValueOnce({ isOK: true, message: '' })
      .mockResolvedValueOnce({ isOK: false, message: 'fail' });
    const hook = await setup();
    let result: { isOK: boolean } | undefined;
    await act(async () => {
      result = await hook.result.current.deleteCloudData();
    });
    expect(result?.isOK).toBe(false);
    const deleted = (projectStorage.deletePhotoPaths as jest.Mock).mock.calls.flatMap((c) => c[1]);
    expect(deleted).toEqual(['projects/P/PHOTO/L/A/PH']);
  });

  it('写真は照合を始めた時刻より前に上がったものだけを消す', async () => {
    const before = Date.now();
    const hook = await setup();
    await act(async () => {
      await hook.result.current.deleteCloudData();
    });
    const createdBefore = (projectStorage.deletePhotoPaths as jest.Mock).mock.calls[0][2];
    expect(createdBefore).toBeLessThanOrEqual(before);
  });

  it('レイヤ定義の削除は、レイヤのデータを全部消せたときだけ写真フォルダを消す', async () => {
    const hook = await setup();
    await act(async () => {
      await hook.result.current.deleteLayerDefinition();
    });
    expect(projectStore.deleteData).toHaveBeenCalledWith('P', 'L');
    expect(projectStorage.deleteLayerPhotos).toHaveBeenCalledWith('P', 'L');

    jest.clearAllMocks();
    (projectStore.deleteData as jest.Mock).mockResolvedValueOnce({ isOK: false, message: 'fail' });
    const hook2 = await setup();
    let result: { isOK: boolean } | undefined;
    await act(async () => {
      result = await hook2.result.current.deleteLayerDefinition();
    });
    expect(result?.isOK).toBe(false);
    expect(projectStorage.deleteLayerPhotos).not.toHaveBeenCalled();
  });
});
