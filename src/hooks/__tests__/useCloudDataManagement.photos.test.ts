jest.mock('../../lib/firebase/firestore', () => ({
  downloadLayerDataGroups: jest.fn(),
  deleteData: jest.fn(),
}));
jest.mock('../../lib/firebase/storage', () => ({
  listLayerPhotoPaths: jest.fn(async () => []),
  deletePhotoPaths: jest.fn(async () => 0),
  deleteLayerPhotos: jest.fn(),
}));
jest.mock('../../i18n/config', () => ({ t: (k: string) => k }));

import { deletePhotosOfDeletedData } from '../useCloudDataManagement';
import * as projectStorage from '../../lib/firebase/storage';
import type { LayerDataGroup } from '../../lib/firebase/firestore';

const del = projectStorage.deletePhotoPaths as jest.Mock;
const url = (path: string) => `https://h/o/${encodeURIComponent(path)}?alt=media`;
const rec = (...paths: string[]) => ({ field: { photo: paths.map((p) => ({ url: url(p) })) } }) as any;
const loaded = (groups: LayerDataGroup[], complete = true) => ({ isOK: true, complete, groups });
const items = (groups: LayerDataGroup[]) => groups.map((g) => ({ permission: g.permission, userId: g.userId }));

describe('deletePhotosOfDeletedData（写真監査 P-H2）', () => {
  beforeEach(() => jest.clearAllMocks());

  it('例A: 管理者のテンプレートだけを消しても、同じ人のPUBLICの写真は残す', async () => {
    const groups: LayerDataGroup[] = [
      { permission: 'TEMPLATE', userId: 'X', records: [rec('projects/P/PHOTO/L/X/T1')] },
      { permission: 'PUBLIC', userId: 'X', records: [rec('projects/P/PHOTO/L/X/R1')] },
    ];
    await deletePhotosOfDeletedData(
      'P',
      'L',
      [{ layerId: 'L', permission: 'TEMPLATE', userId: 'X' }],
      items(groups),
      ['projects/P/PHOTO/L/X/T1', 'projects/P/PHOTO/L/X/R1'],
      loaded(groups),
      loaded([groups[1]])
    );
    expect(del).toHaveBeenCalledWith('P', ['projects/P/PHOTO/L/X/T1'], undefined);
  });

  it('例B: メンバーAのデータを消しても、管理者が引き継いだ記録の写真（Aのフォルダ）は残す', async () => {
    const groups: LayerDataGroup[] = [
      { permission: 'PUBLIC', userId: 'A', records: [rec('projects/P/PHOTO/L/A/A1')] },
      { permission: 'PUBLIC', userId: 'X', records: [rec('projects/P/PHOTO/L/A/A2')] },
    ];
    await deletePhotosOfDeletedData(
      'P',
      'L',
      [{ layerId: 'L', permission: 'PUBLIC', userId: 'A' }],
      items(groups),
      ['projects/P/PHOTO/L/A/A1', 'projects/P/PHOTO/L/A/A2'],
      loaded(groups),
      loaded([groups[1]])
    );
    expect(del).toHaveBeenCalledWith('P', ['projects/P/PHOTO/L/A/A1'], undefined);
  });

  it('他人のPRIVATEが写したテンプレートの写真も、PRIVATEを読めていれば残す', async () => {
    const groups: LayerDataGroup[] = [
      { permission: 'TEMPLATE', userId: 'X', records: [rec('projects/P/PHOTO/L/X/T1')] },
      { permission: 'PRIVATE', userId: 'B', records: [rec('projects/P/PHOTO/L/X/T1')] },
    ];
    await deletePhotosOfDeletedData(
      'P',
      'L',
      [{ layerId: 'L', permission: 'TEMPLATE', userId: 'X' }],
      items(groups),
      ['projects/P/PHOTO/L/X/T1'],
      loaded(groups),
      loaded([groups[1]])
    );
    expect(del).toHaveBeenCalledWith('P', [], undefined);
  });

  it('一覧にある残すデータを読めていなければ、写真は消さない', async () => {
    const groups: LayerDataGroup[] = [{ permission: 'PUBLIC', userId: 'A', records: [rec('projects/P/PHOTO/L/A/A1')] }];
    await deletePhotosOfDeletedData(
      'P',
      'L',
      [{ layerId: 'L', permission: 'PUBLIC', userId: 'A' }],
      [...items(groups), { permission: 'PRIVATE', userId: 'Y' }],
      ['projects/P/PHOTO/L/A/A1'],
      loaded(groups),
      loaded([])
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('復号できないデータがあれば、写真は消さない', async () => {
    await deletePhotosOfDeletedData(
      'P',
      'L',
      [{ layerId: 'L', permission: 'PUBLIC', userId: 'A' }],
      [],
      ['projects/P/PHOTO/L/A/A1'],
      loaded([], false),
      loaded([])
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('消している間に上がったdocが参照する写真は残す', async () => {
    const groups: LayerDataGroup[] = [{ permission: 'PUBLIC', userId: 'A', records: [rec('projects/P/PHOTO/L/A/A1')] }];
    await deletePhotosOfDeletedData(
      'P',
      'L',
      [{ layerId: 'L', permission: 'PUBLIC', userId: 'A' }],
      items(groups),
      ['projects/P/PHOTO/L/A/A1', 'projects/P/PHOTO/L/A/A9'],
      loaded(groups),
      loaded([{ permission: 'TEMPLATE', userId: 'A', records: [rec('projects/P/PHOTO/L/A/A9')] }])
    );
    expect(del).toHaveBeenCalledWith('P', ['projects/P/PHOTO/L/A/A1'], undefined);
  });

  it('消すデータが参照する別の人のフォルダの写真も、残すデータが使っていなければ消す', async () => {
    const groups: LayerDataGroup[] = [{ permission: 'COMMON', userId: 'X', records: [rec('projects/P/PHOTO/L/B/B1')] }];
    await deletePhotosOfDeletedData(
      'P',
      'L',
      [{ layerId: 'L', permission: 'COMMON', userId: 'X' }],
      items(groups),
      [],
      loaded(groups),
      loaded([])
    );
    expect(del).toHaveBeenCalledWith('P', ['projects/P/PHOTO/L/B/B1'], undefined);
  });
});
