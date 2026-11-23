import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { DataEditContext } from '../../contexts/DataEdit';
import DataEditContainer from '../DataEdit';

// Pixel 確認 1: 未保存の編集中に「⇨」と「保存」を続けて押すと、保存と記録の切り替え（破棄の確認）が重なる。
// 保存の後で「破棄」を選ぶと、cancelUpdate が保存した記録の使う写真ファイルを消してしまう。
// 保存中は切り替え・戻るを止め、破棄の確認を出している間は保存を止めることを確かめる

const mockCaptured: { ctx?: React.ContextType<typeof DataEditContext> } = {};
const mockProcessingRef = { current: false };
const mockAcquirePhoto = jest.fn(async () => 'added');
const mockNavigate = jest.fn();
const mockNavigateToHome = jest.fn();
const mockCopyRecord = jest.fn();
const mockDeleteRecord = jest.fn();
const mockAlertAsync = jest.fn(async (_message: string) => undefined);
const mockConfirmAsync = jest.fn(async (_message: string) => true);
const mockSaveData = jest.fn(async () => ({ isOK: true, message: '' }));
const mockChangeRecord = jest.fn();
const mockCancelUpdate = jest.fn();
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
    //位置なしの記録（座標欄が空）として保存させる
    latlon: {
      latitude: { decimal: '', deg: '', min: '', sec: '' },
      longitude: { decimal: '', deg: '', min: '', sec: '' },
    },
    selectedPhoto: undefined,
    isEditingRecord: true,
    isDecimal: true,
    recordNumber: 1,
    maxRecordNumber: 3,
    photoFolder: 'photos',
    isEditable: true,
    modifyBlockMessage: undefined,
    deleteBlockMessage: undefined,
    addPhoto: jest.fn(),
    updatePhoto: jest.fn(),
    selectPhoto: jest.fn(),
    removePhoto: jest.fn(),
    changeRecord: mockChangeRecord,
    saveData: mockSaveData,
    deleteRecord: mockDeleteRecord,
    copyRecord: mockCopyRecord,
    changeLatLonType: jest.fn(),
    changeField: jest.fn(),
    submitField: jest.fn(),
    changeLatLon: jest.fn(),
    cancelUpdate: mockCancelUpdate,
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

//外から解決できる Promise。保存や確認ダイアログが「まだ終わっていない」状態を作る
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('DataEdit コンテナ: 保存と記録の切り替えを重ねない（Pixel 確認 1）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCaptured.ctx = undefined;
  });

  it('破棄の確認を出している間の保存は何もしない。確認で「破棄」なら切り替えて編集を捨てる', async () => {
    const confirm = deferred<boolean>();
    mockConfirmAsync.mockImplementationOnce(() => confirm.promise);
    const ctx = await renderContainer();
    let changing: Promise<void> = Promise.resolve();
    await act(async () => {
      changing = Promise.resolve(ctx.onChangeRecord(2));
      await ctx.pressSaveData();
    });
    expect(mockConfirmAsync).toHaveBeenCalledTimes(1);
    expect(mockSaveData).not.toHaveBeenCalled();
    await act(async () => {
      confirm.resolve(true);
      await changing;
    });
    expect(mockChangeRecord).toHaveBeenCalledWith(2);
    expect(mockCancelUpdate).toHaveBeenCalledTimes(1);
  });

  it('保存中の「⇨」「戻る」は確認を出さず、編集（足した写真）を捨てない', async () => {
    const save = deferred<{ isOK: boolean; message: string }>();
    mockSaveData.mockImplementationOnce(() => save.promise);
    const ctx = await renderContainer();
    let saving: Promise<void> = Promise.resolve();
    await act(async () => {
      saving = Promise.resolve(ctx.pressSaveData());
      await ctx.onChangeRecord(2);
      await ctx.gotoBack();
    });
    expect(mockSaveData).toHaveBeenCalledTimes(1);
    expect(mockConfirmAsync).not.toHaveBeenCalled();
    expect(mockChangeRecord).not.toHaveBeenCalled();
    expect(mockCancelUpdate).not.toHaveBeenCalled();
    await act(async () => {
      save.resolve({ isOK: true, message: '' });
      await saving;
    });
    expect(mockCancelUpdate).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('Data', expect.anything());
  });

  it('保存していなければ「⇨」はいつもどおり確認を出し、「いいえ」なら何もしない', async () => {
    mockConfirmAsync.mockImplementationOnce(async () => false);
    const ctx = await renderContainer();
    await act(async () => {
      await ctx.onChangeRecord(2);
    });
    expect(mockConfirmAsync).toHaveBeenCalledTimes(1);
    expect(mockChangeRecord).not.toHaveBeenCalled();
    expect(mockCancelUpdate).not.toHaveBeenCalled();
  });
});
