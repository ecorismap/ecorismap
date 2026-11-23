import { collectPhotoPaths, photoStoragePathFromUrl, selectPhotoPathsToDelete } from '../cloudPhotoCleanup';

const url = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=t`;

describe('cloudPhotoCleanup（写真監査 P-H2）', () => {
  it('ダウンロードURLからStorageのパスを取り出す', () => {
    expect(photoStoragePathFromUrl(url('projects/P/PHOTO/L/U/PH1'))).toBe('projects/P/PHOTO/L/U/PH1');
    expect(photoStoragePathFromUrl('https://example.com/a.jpg')).toBeUndefined();
    expect(photoStoragePathFromUrl(null)).toBeUndefined();
    expect(photoStoragePathFromUrl('%E0%A4%A')).toBeUndefined();
  });

  it('記録の写真（テーブルの中も）からパスを集める', () => {
    const records = [
      { field: { photo: [{ id: 'PH1', url: url('projects/P/PHOTO/L/U/PH1') }, { id: 'PH2', url: null }], name: 'a' } },
      { field: { table: [{ field: { photo: [{ url: url('projects/P/PHOTO/L/V/PH3') }] } }] } },
    ];
    expect(Array.from(collectPhotoPaths(records)).sort()).toEqual([
      'projects/P/PHOTO/L/U/PH1',
      'projects/P/PHOTO/L/V/PH3',
    ]);
  });

  it('残すデータが参照している写真は消さない', () => {
    const result = selectPhotoPathsToDelete(
      ['projects/P/PHOTO/L/X/T1', 'projects/P/PHOTO/L/X/R1'],
      ['projects/P/PHOTO/L/A/Z1'],
      new Set(['projects/P/PHOTO/L/X/R1'])
    );
    expect(result.sort()).toEqual(['projects/P/PHOTO/L/A/Z1', 'projects/P/PHOTO/L/X/T1']);
  });
});
