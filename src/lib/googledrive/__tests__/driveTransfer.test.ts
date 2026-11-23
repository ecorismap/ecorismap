// アカウント監査 A-M7: Drive保存のファイル名に「#」が入るとネイティブで必ず失敗していた
jest.mock('react-native-fs', () => ({ CachesDirectoryPath: '/cache', downloadFile: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));
jest.mock('../auth', () => ({ getAccessToken: jest.fn() }));
jest.mock('../driveApi', () => ({ downloadFileUrl: jest.fn() }));

import * as FileSystem from 'expo-file-system/legacy';
import { readChunk, toFileUri } from '../driveTransfer';

const mockRead = FileSystem.readAsStringAsync as jest.Mock;

describe('toFileUri', () => {
  test('「#」「?」「%」をエスケープし、ネイティブのURL解釈でフラグメント等として落ちないようにする', () => {
    expect(toFileUri('/var/Caches/export/調査#1?.zip')).toBe(
      `file:///var/Caches/export/${encodeURIComponent('調査')}%231%3F.zip`
    );
    expect(toFileUri('/a/100%.zip')).toBe('file:///a/100%25.zip');
  });

  test('パス区切りはエスケープしない', () => {
    expect(toFileUri('/a b/c.zip')).toBe('file:///a%20b/c.zip');
  });

  test('既に file:// なら手を加えない', () => {
    expect(toFileUri('file:///a/b%23.zip')).toBe('file:///a/b%23.zip');
  });

  test('URLとして解釈しても元のパスに戻る', () => {
    const path = '/var/Caches/export/調査#1 (2)?&=+.zip';
    expect(decodeURIComponent(new URL(toFileUri(path)).pathname)).toBe(path);
  });
});

describe('readChunk', () => {
  test('「#」を含むファイル名でもエスケープしたURIで部分読み込みする', async () => {
    mockRead.mockResolvedValue(Buffer.from([1, 2, 3]).toString('base64'));
    const chunk = await readChunk('/cache/export/調査#1.zip', 10, 3);
    expect(mockRead).toHaveBeenCalledWith(`file:///cache/export/${encodeURIComponent('調査')}%231.zip`, {
      encoding: 'base64',
      position: 10,
      length: 3,
    });
    expect(Array.from(chunk as Uint8Array)).toEqual([1, 2, 3]);
  });
});
