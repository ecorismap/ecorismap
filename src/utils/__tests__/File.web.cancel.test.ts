import JSZip from 'jszip';
import { ExportCancelledError } from '../zipProgress';

jest.mock('../../lib/firebase/storage', () => ({ fetchPhoto: jest.fn() }));
jest.mock('file-saver', () => ({ saveAs: jest.fn() }));

// File.webはimport時のPlatform.OSでfile-saverを読み込むため、読み込み前にwebへ切り替える
 
(require('react-native') as { Platform: { OS: string } }).Platform.OS = 'web';
 
const { exportGeoFile, generateZipBlob } = require('../File.web') as typeof import('../File.web');
 
const FileSaver = require('file-saver') as { saveAs: jest.Mock };

const data = [{ data: 'a,b', name: 'x.csv', folder: '', type: 'CSV' as const }];

describe('File.web export cancel', () => {
  beforeEach(() => FileSaver.saveAs.mockClear());

  it('中止済みならダウンロードせずExportCancelledErrorを投げる', async () => {
    await expect(exportGeoFile(data, 'out', 'zip', undefined, { cancel: { cancelled: true } })).rejects.toBeInstanceOf(
      ExportCancelledError
    );
    expect(FileSaver.saveAs).not.toHaveBeenCalled();
  });

  it('中止しなければzipを作って保存し進捗を通知する', async () => {
    const onProgress = jest.fn();
    await expect(exportGeoFile(data, 'out', 'zip', undefined, { cancel: { cancelled: false }, onProgress })).resolves.toBe(
      'saved'
    );
    expect(FileSaver.saveAs).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalled();
  });

  it('作ったBlobは中身を読み戻せるzipになっている', async () => {
    const blob = await generateZipBlob(data);
    expect(blob).toBeDefined();
    if (blob === undefined) return;
    const buf = await blob.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    expect(await zip.file('x.csv')?.async('string')).toBe('a,b');
  });
});
