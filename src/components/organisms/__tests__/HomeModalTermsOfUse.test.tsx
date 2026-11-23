import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { HomeModalTermsOfUse } from '../HomeModalTermsOfUse';

// 新しいタブで規約モーダルが開いたとき、全タブ共有の tilesDB を丸ごと消さず、
// どのタブの地図一覧にも無い行だけを消す処理へ任せる（永続化監査 S-H1）

let mockState: { settings: { agreedTermsVersion: string }; tileMaps: { id: string }[] };
const mockCleanup = jest.fn(async (_ids: string[]) => undefined);
const mockGeotiffClear = jest.fn();
const mockPmtilesClear = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useStore: () => ({ getState: () => mockState }),
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
}));
jest.mock('../../molecules/StyledDialog', () => ({ useModalYieldingToDialog: (open: boolean) => open }));
jest.mock('../../../utils/tilesDbOrphanCleanup', () => ({
  cleanupOrphanTileRows: (ids: string[]) => mockCleanup(ids),
}));
jest.mock('../../../utils/db', () => ({
  db: { geotiff: { clear: () => mockGeotiffClear() }, pmtiles: { clear: () => mockPmtilesClear() } },
}));
jest.mock('../../../i18n/config', () => ({ t: (key: string) => key }));

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { settings: { agreedTermsVersion: '' }, tileMaps: [{ id: 'map1' }, { id: 'map2' }] };
});

afterEach(() => {
  (Platform as { OS: string }).OS = originalOS;
});

describe('HomeModalTermsOfUse の tilesDB 掃除（永続化監査 S-H1）', () => {
  it('Web で開いたら、全件消去はせず自タブの地図一覧を渡して孤児だけ消させる', async () => {
    (Platform as { OS: string }).OS = 'web';
    render(<HomeModalTermsOfUse />);
    await waitFor(() => expect(mockCleanup).toHaveBeenCalledWith(['map1', 'map2']));
    expect(mockGeotiffClear).not.toHaveBeenCalled();
    expect(mockPmtilesClear).not.toHaveBeenCalled();
  });

  it('ネイティブでは何もしない', async () => {
    (Platform as { OS: string }).OS = 'ios';
    render(<HomeModalTermsOfUse />);
    expect(mockCleanup).not.toHaveBeenCalled();
    expect(mockGeotiffClear).not.toHaveBeenCalled();
  });
});
