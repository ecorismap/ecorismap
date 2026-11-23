import { cleanupOrphanTileRows, selectOrphanTileRowIds } from '../tilesDbOrphanCleanup';

const mockReadAlive = jest.fn<Promise<Set<string> | undefined>, []>();
jest.mock('../reduxPersistWebStorage', () => ({
  readTileMapIdsFromAliveTabs: () => mockReadAlive(),
}));
const mockGeotiffDelete = jest.fn((_ids: string[]) => Promise.resolve());
const mockPmtilesDelete = jest.fn((_ids: string[]) => Promise.resolve());
jest.mock('../db', () => ({
  db: {
    geotiff: {
      toCollection: () => ({ primaryKeys: () => Promise.resolve(['pdfA', 'pdfOrphan']) }),
      bulkDelete: (ids: string[]) => mockGeotiffDelete(ids),
    },
    pmtiles: {
      toCollection: () => ({ primaryKeys: () => Promise.resolve(['pmB', 'pmNew', 'pmOrphan']) }),
      bulkDelete: (ids: string[]) => mockPmtilesDelete(ids),
    },
  },
}));

describe('tilesDB の孤児掃除（永続化監査 S-H1）', () => {
  beforeEach(() => {
    mockReadAlive.mockReset();
    mockGeotiffDelete.mockClear();
    mockPmtilesDelete.mockClear();
  });

  test('selectOrphanTileRowIds はどの一覧にも無い行だけを選ぶ', () => {
    expect(selectOrphanTileRowIds(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });

  test('生きているタブの一覧と自タブのメモリ上の一覧にある行は残し、それ以外だけ消す', async () => {
    mockReadAlive.mockResolvedValueOnce(new Set(['pdfA', 'pmB']));
    await cleanupOrphanTileRows(['pmNew']);
    expect(mockGeotiffDelete).toHaveBeenCalledWith(['pdfOrphan']);
    expect(mockPmtilesDelete).toHaveBeenCalledWith(['pmOrphan']);
  });

  test('生きているタブを確かめられないときは何も消さない', async () => {
    mockReadAlive.mockResolvedValueOnce(undefined);
    await cleanupOrphanTileRows([]);
    expect(mockGeotiffDelete).not.toHaveBeenCalled();
    expect(mockPmtilesDelete).not.toHaveBeenCalled();
  });
});
