import React from 'react';
import { renderHook } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Platform } from 'react-native';
import dataSetReducer from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import userReducer from '../../modules/user';
import { usePendingPhotoCapture } from '../usePendingPhotoCapture';
import { takePendingPhoto } from '../../utils/Photo';
import { LayerType, PhotoType, RecordType } from '../../types';

jest.mock('../../utils/Photo', () => ({
  takePendingPhoto: jest.fn(),
  deleteLocalPhoto: jest.fn(),
}));

const mockTakePendingPhoto = takePendingPhoto as jest.MockedFunction<typeof takePendingPhoto>;

const layer = {
  id: 'layer1',
  name: 'Points',
  type: 'POINT',
  permission: 'PRIVATE',
  field: [{ id: 'f1', name: 'photo', format: 'PHOTO' }],
  active: true,
  visible: true,
  colorStyle: {},
  label: '',
} as unknown as LayerType;

const record = {
  id: 'rec1',
  userId: 'user1',
  displayName: 'user',
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 135 },
  field: { photo: [] as PhotoType[] },
} as unknown as RecordType;

const createStore = (pending?: { layerId: string; recordId: string; fieldName: string }) =>
  configureStore({
    reducer: { dataSet: dataSetReducer, layers: layersReducer, settings: settingsReducer, user: userReducer },
    preloadedState: {
      dataSet: [{ layerId: 'layer1', userId: 'user1', data: [record] }],
      layers: [layer],
      settings: { ...settingsInitialState, projectId: undefined, pendingPhotoCapture: pending },
      user: { uid: 'user1', email: 'a@b.c', displayName: 'user', photoURL: null },
    },
  });

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('usePendingPhotoCapture', () => {
  const originalOS = Platform.OS;
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  const render = (store: ReturnType<typeof createStore>) => {
    const navigateToSplit = jest.fn();
    const openSheet = jest.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
    renderHook(() => usePendingPhotoCapture({ navigateToSplit, openSheet }), { wrapper });
    return { navigateToSplit, openSheet };
  };

  it('does nothing when no capture is pending', async () => {
    const store = createStore(undefined);
    const { navigateToSplit } = render(store);
    await flush();
    expect(mockTakePendingPhoto).not.toHaveBeenCalled();
    expect(navigateToSplit).not.toHaveBeenCalled();
  });

  it('attaches the pending photo to the record and reopens DataEdit', async () => {
    mockTakePendingPhoto.mockResolvedValue({
      uri: 'file:///photos/EMAP_1.jpeg',
      thumbnail: 'data:image/jpeg;base64,xx',
      name: 'EMAP_1.jpeg',
      width: 100,
      height: 80,
    });
    const store = createStore({ layerId: 'layer1', recordId: 'rec1', fieldName: 'photo' });
    const { navigateToSplit, openSheet } = render(store);
    await flush();

    expect(mockTakePendingPhoto).toHaveBeenCalledWith(expect.stringContaining('/LOCAL/layer1/OWNER'));
    const saved = store.getState().dataSet[0].data[0];
    const photos = saved.field.photo as PhotoType[];
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ uri: 'file:///photos/EMAP_1.jpeg', name: 'EMAP_1.jpeg', url: null, key: null });
    expect(openSheet).toHaveBeenCalledWith(2);
    expect(navigateToSplit).toHaveBeenCalledWith('DataEdit', {
      previous: 'Data',
      targetData: saved,
      targetLayer: layer,
    });
    expect(store.getState().settings.pendingPhotoCapture).toBeUndefined();
  });

  it('clears the pending capture when no result was left by the picker', async () => {
    mockTakePendingPhoto.mockResolvedValue(undefined);
    const store = createStore({ layerId: 'layer1', recordId: 'rec1', fieldName: 'photo' });
    const { navigateToSplit } = render(store);
    await flush();
    expect(navigateToSplit).not.toHaveBeenCalled();
    expect(store.getState().settings.pendingPhotoCapture).toBeUndefined();
    expect((store.getState().dataSet[0].data[0].field.photo as PhotoType[]).length).toBe(0);
  });

  it('does not run on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    const store = createStore({ layerId: 'layer1', recordId: 'rec1', fieldName: 'photo' });
    render(store);
    await flush();
    expect(mockTakePendingPhoto).not.toHaveBeenCalled();
    expect(store.getState().settings.pendingPhotoCapture).toBeDefined();
  });
});
