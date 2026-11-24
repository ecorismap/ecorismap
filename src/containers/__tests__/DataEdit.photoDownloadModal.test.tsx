import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { DataEditContext } from '../../contexts/DataEdit';
import DataEditContainer from '../DataEdit';

// iOS 実機（2026-11-24）: 写真ビューアの「ダウンロード」で確認ダイアログを出すとビューアが引っ込み、「Yes」で
// 0.3秒後に出し直される。ダウンロードが終わって閉じるのが表示アニメーションの途中に重なると、iOS では閉じる
// 処理が効かず、中身のない透明な Modal が前面に残って画面のタップがすべて効かなくなった。
// ダウンロード後はどの経路でもビューアを閉じるので、確認を出す前に閉じておく

const mockCaptured: { ctx?: React.ContextType<typeof DataEditContext> } = {};
const mockProcessingRef = { current: true };
const mockAcquirePhoto = jest.fn(async () => 'added');
const mockNavigate = jest.fn();
const mockNavigateToHome = jest.fn();
const mockCopyRecord = jest.fn();
const mockDeleteRecord = jest.fn();
const mockAlertAsync = jest.fn(async (_message: string) => undefined);
const mockConfirmAsync = jest.fn(async (_message: string) => false);
const mockAlert = jest.fn();

jest.mock('../../components/pages/DataEdit', () => {
  const { useContext: useCtx } = jest.requireActual('react');
  const { DataEditContext: Ctx } = jest.requireActual('../../contexts/DataEdit');
  return function MockDataEdit() {
    mockCaptured.ctx = useCtx(Ctx);
    return null;
  };
});
jest.mock('../../components/organisms/DataEditModalPhotoView', () => ({ DataEditModalPhotoView: () => null }));
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: (message: string) => mockAlertAsync(message),
  ConfirmAsync: (message: string) => mockConfirmAsync(message),
}));
jest.mock('../../components/atoms/Alert', () => ({ Alert: { alert: (...args: unknown[]) => mockAlert(...args) } }));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));
jest.mock('../../utils/Photo', () => ({
  isPhotoPermissionDenied: jest.fn(() => false),
  pickImage: jest.fn(),
  takePhoto: jest.fn(),
}));
jest.mock('../../lib/firebase/storage', () => ({}));
jest.mock('../../hooks/useDynamicDictionaryInput', () => ({ addToDynamicDictionary: jest.fn() }));
jest.mock('../../hooks/usePhotoAcquisition', () => ({
  usePhotoAcquisition: () => ({
    isPhotoProcessing: mockProcessingRef.current,
    isPhotoProcessingRef: mockProcessingRef,
    acquirePhoto: mockAcquirePhoto,
  }),
}));

const mockLayer = {
  id: 'layer1',
  name: 'L',
  type: 'POINT',
  permission: 'PRIVATE',
  field: [],
  colorStyle: {},
  label: '',
  visible: true,
  active: true,
};
const mockRecord = {
  id: 'rec1',
  userId: undefined,
  displayName: null,
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field: {},
};

jest.mock('../../contexts/BottomSheetNavigationContext', () => ({
  useBottomSheetNavigation: () => ({ navigate: mockNavigate, navigateToHome: mockNavigateToHome }),
  useBottomSheetRoute: () => ({ params: { previous: 'Data', targetData: mockRecord, targetLayer: mockLayer } }),
}));
jest.mock('../../hooks/useDataEdit', () => ({
  useDataEdit: () => ({
    targetRecord: mockRecord,
    targetLayer: mockLayer,
    latlon: [],
    selectedPhoto: undefined,
    isEditingRecord: false,
    isDecimal: true,
    recordNumber: 1,
    maxRecordNumber: 1,
    photoFolder: 'photos',
    isEditable: true,
    modifyBlockMessage: undefined,
    deleteBlockMessage: undefined,
    addPhoto: jest.fn(),
    updatePhoto: jest.fn(),
    selectPhoto: jest.fn(),
    removePhoto: jest.fn(),
    changeRecord: jest.fn(),
    saveData: jest.fn(),
    deleteRecord: mockDeleteRecord,
    copyRecord: mockCopyRecord,
    changeLatLonType: jest.fn(),
    changeField: jest.fn(),
    submitField: jest.fn(),
    changeLatLon: jest.fn(),
    cancelUpdate: jest.fn(),
    getPhotoCaptureDraft: jest.fn(),
  }),
}));
jest.mock('../../hooks/useLayers', () => ({ useLayers: () => ({ changeActiveLayer: jest.fn() }) }));
jest.mock('../../hooks/useRecord', () => ({
  useRecord: () => ({ checkRecordEditable: jest.fn(() => ({ isOK: true, message: '' })), unselectRecord: jest.fn() }),
}));
jest.mock('../../hooks/usePermission', () => ({ usePermission: () => ({ isRunningProject: false }) }));
jest.mock('../../hooks/useWindow', () => ({
  useWindow: () => ({
    isLandscape: false,
    windowWidth: 400,
    mapRegion: { latitude: 35, longitude: 139, latitudeDelta: 0.01, longitudeDelta: 0.01, zoom: 15 },
  }),
}));
jest.mock('@react-native-community/hooks', () => ({ useKeyboard: () => ({ keyboardShown: false }) }));
const mockState = { settings: { projectId: undefined }, user: { uid: 'u1' }, layers: [] };
jest.mock('react-redux', () => ({
  shallowEqual: jest.fn(),
  useDispatch: () => jest.fn(),
  useSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
  useStore: () => ({ getState: () => mockState }),
}));

const renderContainer = async () => {
  await render(<DataEditContainer />);
  await waitFor(() => expect(mockCaptured.ctx).toBeDefined());
  const ctx = mockCaptured.ctx;
  if (ctx === undefined) throw new Error('DataEditContext was not provided');
  return ctx;
};

describe('DataEdit コンテナ: 写真ビューアからのダウンロード', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptured.ctx = undefined;
    mockProcessingRef.current = false;
  });

  it('確認ダイアログを出す前に写真ビューアを閉じる（出し直しと閉じる処理を重ねない）', async () => {
    let answer: (value: boolean) => void = () => undefined;
    mockConfirmAsync.mockImplementationOnce(() => new Promise<boolean>((resolve) => (answer = resolve)));
    const ctx = await renderContainer();
    await act(async () => {
      await ctx.pressPhoto('photo', { id: 'p1', name: 'a.jpg', uri: null, url: 'u', key: 'k' } as never, 0);
    });
    expect(mockCaptured.ctx?.isPhotoViewOpen).toBe(true);
    let pending: Promise<void> | undefined;
    await act(async () => {
      // コンテキストの型は () => void だが、実体は確認とダウンロードを待つ async 関数
      pending = mockCaptured.ctx?.pressDownloadPhoto() as unknown as Promise<void> | undefined;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    //確認に答える前の時点で閉じている
    await waitFor(() => expect(mockConfirmAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockCaptured.ctx?.isPhotoViewOpen).toBe(false));
    expect(mockConfirmAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer(false);
      await pending;
    });
    expect(mockCaptured.ctx?.isPhotoViewOpen).toBe(false);
  });
});
