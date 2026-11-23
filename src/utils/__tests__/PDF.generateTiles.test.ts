import { generateTilesFromPDF } from '../PDF';
import ImageEditor from '@react-native-community/image-editor';
import { moveFile, unlink } from '../File';
import { removeTileCacheEntries } from '../tileCacheCleanup';
import { warpedFileType } from 'react-native-gdalwarp';

jest.mock('react-native-fs', () => ({ exists: jest.fn(), copyFile: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///doc/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  downloadAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { PNG: 'png' }, manipulateAsync: jest.fn() }));
jest.mock('@react-native-community/image-editor', () => ({ __esModule: true, default: { cropImage: jest.fn() } }));
jest.mock('react-native-gdalwarp', () => ({}));
jest.mock('../File', () => ({ moveFile: jest.fn(), unlink: jest.fn() }));
jest.mock('../terrain3d/pmtileRasterizer', () => ({ renderPmtile: jest.fn() }));
jest.mock('../tileCacheCleanup', () => ({ removeTileCacheEntries: jest.fn().mockResolvedValue(undefined) }));

const mockCrop = ImageEditor.cropImage as jest.Mock;
const mockMove = moveFile as jest.Mock;
const mockUnlink = unlink as jest.Mock;
const mockRemove = removeTileCacheEntries as jest.Mock;

//z16の1タイルに収まる小さな範囲（Webメルカトル）
const outputFile = {
  uri: '/tmp/page.png',
  topLeft: { x: 15028131.26, y: 4163881.14 },
  bottomRight: { x: 15028141.26, y: 4163871.14 },
  width: 100,
  height: 100,
} as unknown as warpedFileType;

const run = () => generateTilesFromPDF('file:///tmp/page.png', outputFile, 'pdf1', 512, 16, 16, 0.1);

describe('generateTilesFromPDF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCrop.mockImplementation(async (_uri: string, data: { offset: { x: number } }) => `file:///cache/crop_${data.offset.x}.png`);
    mockUnlink.mockReset().mockResolvedValue(undefined);
    mockMove.mockReset().mockResolvedValue(undefined);
    mockRemove.mockReset().mockResolvedValue(undefined);
  });

  it('生成前に旧タイルを消し、移動先を消してから移動し終えるまで待つ', async () => {
    const order: string[] = [];
    mockRemove.mockImplementation(async () => order.push('remove'));
    mockUnlink.mockImplementation(async (uri: string) => order.push(`unlink:${uri}`));
    mockMove.mockImplementation(async (_from: string, to: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`move:${to}`);
    });
    await run();
    expect(mockRemove).toHaveBeenCalledWith('pdf1');
    expect(order[0]).toBe('remove');
    const tileUri = mockMove.mock.calls[0][1] as string;
    expect(tileUri).toMatch(/\/tiles\/pdf1\/16\/\d+\/\d+$/);
    expect(order.indexOf(`unlink:${tileUri}`)).toBeLessThan(order.indexOf(`move:${tileUri}`));
    //最後のunlinkはPDF画像。移動は全て完了してから返る
    expect(order[order.length - 1]).toBe('unlink:file:///tmp/page.png');
  });

  it('移動に失敗したら切り出した一時ファイルを消し、全体は止めない', async () => {
    mockMove.mockRejectedValue(new Error('exists'));
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(run()).resolves.toBeUndefined();
    const cropped = mockMove.mock.calls[0][0] as string;
    expect(mockUnlink).toHaveBeenCalledWith(cropped);
    log.mockRestore();
  });

  it('型定義どおりのオブジェクトが返っても uri を使う', async () => {
    mockCrop.mockResolvedValue({ uri: 'file:///cache/obj.png', path: '/cache/obj.png' });
    await run();
    expect(mockMove).toHaveBeenCalledWith('file:///cache/obj.png', expect.stringMatching(/\/tiles\/pdf1\//));
  });
});
