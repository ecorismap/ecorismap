/**
 * 撮影・選択の起動前に、image-picker に残った古い保留を捨てる（写真監査 P-L2）
 */
import { Platform } from 'react-native';

const mockGetPendingResultAsync = jest.fn();
jest.mock('expo-image-picker', () => ({
  getPendingResultAsync: () => mockGetPendingResultAsync(),
}));

import { discardStalePickerResult } from '../discardStalePickerResult';

const setOS = (os: typeof Platform.OS) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};

describe('discardStalePickerResult', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    setOS(originalOS);
    mockGetPendingResultAsync.mockReset();
  });

  it('Android では保留を一度読み出して捨てる', async () => {
    setOS('android');
    mockGetPendingResultAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///old.jpg' }] });

    await expect(discardStalePickerResult()).resolves.toBeUndefined();
    expect(mockGetPendingResultAsync).toHaveBeenCalledTimes(1);
  });

  it('読み出しで例外が出ても握りつぶす（撮影・選択は続けられる）', async () => {
    setOS('android');
    mockGetPendingResultAsync.mockRejectedValue(new Error('boom'));

    await expect(discardStalePickerResult()).resolves.toBeUndefined();
  });

  it.each(['ios', 'web'] as const)('%s では呼ばない', async (os) => {
    setOS(os);

    await discardStalePickerResult();
    expect(mockGetPendingResultAsync).not.toHaveBeenCalled();
  });
});
