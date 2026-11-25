import React from 'react';
import { act, render } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { AlertAsync } from '../../components/molecules/AlertAsync';
import { MapEditContext } from '../../contexts/MapEdit';
import { TileMapType } from '../../types';
import MapEditContainer from '../MapEdit';

// 地図編集で読み込んだスタイルは、地図を保存したときに初めて端末に書く（保存せずに戻れば前のスタイルのまま）

const mockCaptured: { ctx?: React.ContextType<typeof MapEditContext> } = {};
jest.mock('../../components/pages/MapEdit', () => {
  const { useContext } = jest.requireActual('react');
  const { MapEditContext: Ctx } = jest.requireActual('../../contexts/MapEdit');
  return function MockMapEdit() {
    mockCaptured.ctx = useContext(Ctx);
    return null;
  };
});
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async () => undefined),
  ConfirmAsync: jest.fn(async () => true),
}));
jest.mock('../../components/molecules/Loading', () => ({ Loading: () => null }));
jest.mock('../../utils/terrain3d/textureDiskCache', () => ({
  removeTerrainTextureCacheForMap: (...args: unknown[]) => mockRemoveTextures(...args),
}));
const mockRemoveTextures = jest.fn();
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../contexts/BottomSheetNavigationContext', () => ({
  useBottomSheetNavigation: () => ({ goBack: jest.fn() }),
  useBottomSheetRoute: () => ({
    params: { targetMap: { ...mockSaved, name: 'P' } },
  }),
}));
const mockOrder: string[] = [];
let mockSavedMap: TileMapType | undefined;
const mockDispatch = jest.fn((action: { type?: string }) => {
  if (action.type?.startsWith('tileMaps/')) {
    mockOrder.push('saveMap');
    mockSavedMap = (action as { payload: TileMapType }).payload;
  }
});
const mockSaved = {
  id: 'P',
  url: 'pmtiles://https://example.com/a.pmtiles',
  minimumZ: 0,
  maximumZ: 22,
  overzoomThreshold: 18,
  isVector: true,
};
const mockState: { tileMaps: (typeof mockSaved & { styleURL?: string })[]; settings: object } = {
  tileMaps: [mockSaved],
  settings: {},
};
jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector(mockState),
  useStore: () => ({ getState: () => mockState, dispatch: mockDispatch }),
}));
const mockGetPmtilesBoundary = jest.fn();
const mockReadStyleFile = jest.fn();
const mockSaveStyleFile = jest.fn();
jest.mock('../../hooks/useMaps', () => ({
  useMaps: () => ({
    deleteMap: jest.fn(),
    exportSingleMap: jest.fn(),
    readStyleFile: mockReadStyleFile,
    saveStyleFile: mockSaveStyleFile,
    getPmtilesBoundary: mockGetPmtilesBoundary,
  }),
}));
jest.mock('../../utils/db', () => ({ db: { pmtiles: { update: jest.fn() } } }));
jest.mock('../../utils/tileSourceCleanup', () => ({
  discardStaleTileSources: jest.fn(async () => {
    mockOrder.push('discard');
    return [];
  }),
}));
jest.mock('../../constants/Presets', () => ({ MAP_PRESETS: [] }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({}));

const originalOS = Platform.OS;
const pick = (name: string) =>
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ assets: [{ name, uri: `blob:${name}` }] });
const ctx = () => mockCaptured.ctx!;
const importStyle = async (name: string, style: string) => {
  pick(name);
  mockReadStyleFile.mockResolvedValueOnce({ isOK: true, message: '', style });
  await act(async () => ctx().pressImportStyle());
};
const save = () => act(async () => ctx().pressSaveMap());

describe('地図編集のスタイル読み込み', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockOrder.length = 0;
    mockSavedMap = undefined;
    mockGetPmtilesBoundary.mockImplementation(async () => {
      mockOrder.push('header');
      return {};
    });
    mockSaveStyleFile.mockImplementation(async () => {
      mockOrder.push('style');
      return { isOK: true, message: '' };
    });
    Platform.OS = 'web';
    await render(<MapEditContainer />);
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('読み込んだだけでは書かず、保存したときに書いてから地図を保存する', async () => {
    await importStyle('a.json', 'A');
    expect(ctx().map.styleURL).toBe('style://a.json');
    expect(ctx().isEdited).toBe(true);
    expect(mockSaveStyleFile).not.toHaveBeenCalled();

    await save();
    expect(mockSaveStyleFile).toHaveBeenCalledWith('P', 'A');
    expect(mockOrder).toEqual(['header', 'style', 'discard', 'saveMap']);
  });

  it('続けて読み込んだら、最後のものを書く', async () => {
    await importStyle('a.json', 'A');
    await importStyle('b.json', 'B');
    await save();
    expect(mockSaveStyleFile.mock.calls).toEqual([['P', 'B']]);
  });

  it('style:// の名前だけ書き換えたら、読み込んだものを書く', async () => {
    await importStyle('a.json', 'A');
    await act(async () => ctx().changeStyleURL('style://river.json'));
    await save();
    expect(mockSaveStyleFile).toHaveBeenCalledWith('P', 'A');
  });

  it.each(['https://example.com/style.json', '', 'style://https://example.com/shared?token=x'])(
    '読み込んだあとでスタイル欄を「%s」に変えたら書かない',
    async (styleURL) => {
      await importStyle('a.json', 'A');
      await act(async () => ctx().changeStyleURL(styleURL));
      await save();
      expect(mockSaveStyleFile).not.toHaveBeenCalled();
      expect(mockOrder).toEqual(['header', 'discard', 'saveMap']);
    }
  );

  it('保存したあとの2回目の保存では書き直さない', async () => {
    await importStyle('a.json', 'A');
    await save();
    await act(async () => ctx().changeMapName('Q'));
    await save();
    expect(mockSaveStyleFile).toHaveBeenCalledTimes(1);
  });

  it('書けなければ案内を出し、地図も保存しない。もう一度保存すれば書く', async () => {
    await importStyle('a.json', 'A');
    mockSaveStyleFile.mockResolvedValueOnce({ isOK: false, message: 'fail' });
    await save();
    expect(AlertAsync).toHaveBeenCalledWith('fail');
    expect(mockOrder).toEqual(['header']);
    mockOrder.length = 0;
    expect(ctx().isEdited).toBe(true);

    await save();
    expect(mockOrder).toEqual(['header', 'style', 'discard', 'saveMap']);
  });

  it('壊れたファイルでは欄を変えず、前に読み込んだものも保つ', async () => {
    await importStyle('a.json', 'A');
    pick('broken.json');
    mockReadStyleFile.mockResolvedValueOnce({ isOK: false, message: 'invalid' });
    await act(async () => ctx().pressImportStyle());
    expect(AlertAsync).toHaveBeenCalledWith('invalid');
    expect(ctx().map.styleURL).toBe('style://a.json');
    await save();
    expect(mockSaveStyleFile.mock.calls).toEqual([['P', 'A']]);
  });

  it.each([
    [undefined, 'style://style.json'],
    ['https://example.com/style.json', 'style://style.json'],
    ['style://style.json', 'style://style.json?v=2'],
    ['style://style.json?v=2', 'style://style.json?v=3'],
  ])('iOS/Android では保存済み（%s）と違う styleURL にして、描き直させる', async (saved, expected) => {
    Platform.OS = 'android';
    mockState.tileMaps = [{ ...mockSaved, styleURL: saved }];
    await importStyle('a.json', 'A');
    expect(ctx().map.styleURL).toBe(expected);
    await save();
    expect(mockSaveStyleFile).toHaveBeenCalledWith('P', 'A');
    mockState.tileMaps = [mockSaved];
  });

  it('iOS/Android でも読み込んだだけでは書かない', async () => {
    Platform.OS = 'ios';
    await importStyle('a.json', 'A');
    expect(ctx().map.styleURL).toBe('style://style.json');
    expect(mockSaveStyleFile).not.toHaveBeenCalled();
  });
});

describe('地図編集の保存（PMTiles のヘッダー）', () => {
  const header = (minZoom: number, maxZoom: number) => ({ header: { minZoom, maxZoom }, boundary: undefined });

  const open = async (saved: Partial<typeof mockSaved>) => {
    jest.clearAllMocks();
    mockOrder.length = 0;
    mockSavedMap = undefined;
    Platform.OS = 'android';
    Object.assign(mockSaved, { minimumZ: 0, maximumZ: 22, overzoomThreshold: 18 }, saved);
    mockState.tileMaps = [mockSaved];
    await render(<MapEditContainer />);
  };
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('ヘッダーを待つ間の2回目の保存は受け付けない', async () => {
    await open({});
    let resolve: (value: unknown) => void = () => undefined;
    mockGetPmtilesBoundary.mockReturnValue(new Promise((r) => (resolve = r)));
    await act(async () => ctx().changeMapName('Q'));
    await act(async () => {
      void ctx().pressSaveMap();
      void ctx().pressSaveMap();
    });
    await act(async () => resolve(header(5, 10)));
    expect(mockGetPmtilesBoundary).toHaveBeenCalledTimes(1);
    expect(mockOrder).toEqual(['discard', 'saveMap']);
    expect(mockSavedMap).toMatchObject({ minimumZ: 5, maximumZ: 10, overzoomThreshold: 10 });
  });

  it('拡大を始めるズームが変わったら、3D の「タイルなし」の印を捨てる', async () => {
    await open({});
    mockGetPmtilesBoundary.mockResolvedValue(header(5, 10));
    await save();
    expect(mockRemoveTextures).toHaveBeenCalledWith('P');

    await open({ minimumZ: 5, maximumZ: 10, overzoomThreshold: 10 });
    await save();
    expect(mockRemoveTextures).not.toHaveBeenCalled();
  });

  it('URL を変えたら、前のアーカイブの最大ズームで切り詰めない', async () => {
    await open({ minimumZ: 5, maximumZ: 10, overzoomThreshold: 10 });
    mockGetPmtilesBoundary.mockResolvedValue(header(0, 15));
    await act(async () => ctx().changeMapURL('pmtiles://https://example.com/b.pmtiles'));
    await save();
    expect(mockSavedMap).toMatchObject({ minimumZ: 0, maximumZ: 15, overzoomThreshold: 15 });
  });

  it.each(['https://example.com/{z}/{x}/{y}.png', 'https://example.com/{z}/{x}/{y}.pbf'])(
    'PMTiles から %s に変えたら、ズームの範囲を既定に戻す',
    async (url) => {
      await open({ minimumZ: 5, maximumZ: 10, overzoomThreshold: 10 });
      await act(async () => ctx().changeMapURL(url));
      await save();
      expect(mockSavedMap).toMatchObject({ minimumZ: 0, maximumZ: 22, overzoomThreshold: 18 });
    }
  );

  it('利用者が下げた固定ズームは、URL を変えても残す', async () => {
    await open({ minimumZ: 5, maximumZ: 15, overzoomThreshold: 12 });
    mockGetPmtilesBoundary.mockResolvedValue({ header: undefined, boundary: undefined });
    await act(async () => ctx().changeMapURL('pmtiles://https://example.com/b.pmtiles'));
    await save();
    expect(mockSavedMap).toMatchObject({ minimumZ: 0, maximumZ: 22, overzoomThreshold: 12 });
  });

  it('URL が同じでヘッダーが読めないときは、今の設定を残す', async () => {
    await open({ minimumZ: 5, maximumZ: 10, overzoomThreshold: 10 });
    mockGetPmtilesBoundary.mockResolvedValue({ header: undefined, boundary: undefined });
    await act(async () => ctx().changeMapName('Q'));
    await save();
    expect(mockSavedMap).toMatchObject({ minimumZ: 5, maximumZ: 10, overzoomThreshold: 10 });
  });
});
