import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { DataEditContext } from '../../contexts/DataEdit';
import DataEditContainer from '../DataEdit';

// 写真監査 P-L3 / PHOTO-10: 写真の取り込み中は、撮影・選択・複製・削除・地図へ移動・位置の編集を何もせずに止める。
// ボタンの無効化（表示側）が描画の遅れで間に合わなくても、コンテナの ref で止まることを確かめる

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

describe('DataEdit コンテナ: 写真の取り込み中は操作を止める（写真監査 P-L3）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptured.ctx = undefined;
  });

  it('取り込み中は撮影・選択・複製・削除・地図へ移動・位置の編集が何もしない（案内のダイアログも出さない）', async () => {
    mockProcessingRef.current = true;
    const ctx = await renderContainer();
    await act(async () => {
      await ctx.pressTakePhoto('photo');
      await ctx.pressPickPhoto('photo');
      await ctx.pressCopyData();
      await ctx.pressDeleteData();
      ctx.pressJumpToData();
      await ctx.pressEditPosition();
    });
    expect(mockAcquirePhoto).not.toHaveBeenCalled();
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    expect(mockAlertAsync).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockCopyRecord).not.toHaveBeenCalled();
    expect(mockDeleteRecord).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockNavigateToHome).not.toHaveBeenCalled();
  });

  it('取り込み中でなければ、選択・複製・削除・地図へ移動はいつもどおり動く', async () => {
    mockProcessingRef.current = false;
    const ctx = await renderContainer();
    await act(async () => {
      await ctx.pressPickPhoto('photo');
      await ctx.pressCopyData();
      await ctx.pressDeleteData();
      ctx.pressJumpToData();
    });
    expect(mockAcquirePhoto).toHaveBeenCalledTimes(1);
    // 複製・削除は確認を出す（テストでは「いいえ」で止める）
    expect(mockConfirmAsync).toHaveBeenCalledTimes(2);
    expect(mockNavigateToHome).toHaveBeenCalledTimes(1);
  });
});
