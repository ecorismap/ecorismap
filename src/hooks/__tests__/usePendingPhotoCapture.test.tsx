import React from 'react';
import { renderHook } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Platform } from 'react-native';
import dataSetReducer, { setDataSetAction } from '../../modules/dataSet';
import layersReducer from '../../modules/layers';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import rootReducer from '../../modules';
import userReducer from '../../modules/user';
import { usePendingPhotoCapture } from '../usePendingPhotoCapture';
import { deleteLocalPhoto, takePendingPhoto } from '../../utils/Photo';
import { LayerType, PendingPhotoCaptureType, PhotoType, RecordType, RoleType } from '../../types';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('../../utils/Photo', () => ({
  takePendingPhoto: jest.fn(),
  deleteLocalPhoto: jest.fn(),
  hasLocalPhotoFile: jest.fn(async (uri: string | null | undefined) => typeof uri === 'string'),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
}));
const mockDownloadPhoto = jest.fn(async () => ({ isOK: false, message: 'offline', uri: null }));
jest.mock('../../lib/firebase/storage', () => ({
  downloadPhoto: () => mockDownloadPhoto(),
}));

const mockTakePendingPhoto = takePendingPhoto as jest.MockedFunction<typeof takePendingPhoto>;
const mockDeleteLocalPhoto = deleteLocalPhoto as jest.MockedFunction<typeof deleteLocalPhoto>;

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

const createStore = (pending?: PendingPhotoCaptureType) =>
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
  describe('with an editing draft (P-M1)', () => {
    const photo1 = {
      id: 'p1',
      name: 'EMAP_0.jpeg',
      url: null,
      uri: 'file:///photos/EMAP_0.jpeg',
      width: 10,
      height: 10,
      thumbnail: null,
      key: null,
    } as unknown as PhotoType;
    const draftRecord = {
      ...record,
      field: { ...record.field, photo: [photo1], memo: 'unsaved text' },
    } as unknown as RecordType;
    const draft = {
      record: draftRecord,
      isEditing: true,
      temporaryAddedPhotoList: [{ photoId: 'p1', uri: 'file:///photos/EMAP_0.jpeg' }],
      temporaryDeletePhotoList: [{ photoId: 'old', uri: 'file:///photos/OLD.jpeg' }],
    };
    const pendingPhoto = {
      uri: 'file:///photos/EMAP_1.jpeg',
      thumbnail: null,
      name: 'EMAP_1.jpeg',
      width: 100,
      height: 80,
    };

    it('keeps the earlier photo and unsaved input, and adds the new photo on top', async () => {
      mockTakePendingPhoto.mockResolvedValue(pendingPhoto);
      const store = createStore({ layerId: 'layer1', recordId: 'rec1', fieldName: 'photo', draft });
      const { navigateToSplit } = render(store);
      await flush();

      const saved = store.getState().dataSet[0].data[0];
      const photos = saved.field.photo as PhotoType[];
      expect(photos.map((p) => p.uri)).toEqual(['file:///photos/EMAP_0.jpeg', 'file:///photos/EMAP_1.jpeg']);
      expect(saved.field.memo).toBe('unsaved text');
      //外した写真は保存したのでファイルを消す。先に付けた写真は記録に入ったので消さない
      expect(mockDeleteLocalPhoto).toHaveBeenCalledWith('file:///photos/OLD.jpeg');
      expect(mockDeleteLocalPhoto).not.toHaveBeenCalledWith('file:///photos/EMAP_0.jpeg');
      expect(navigateToSplit).toHaveBeenCalledWith('DataEdit', expect.objectContaining({ targetData: saved }));
    });

    it('saves the draft even when the camera was cancelled, so the edit is not lost', async () => {
      jest.useFakeTimers();
      try {
        mockTakePendingPhoto.mockResolvedValue(undefined);
        const store = createStore({ layerId: 'layer1', recordId: 'rec1', fieldName: 'photo', draft });
        const { navigateToSplit } = render(store);
        for (let i = 0; i < 12; i++) {
          await Promise.resolve();
          jest.advanceTimersByTime(500);
          await Promise.resolve();
        }
        jest.useRealTimers();
        await flush();
        const saved = store.getState().dataSet[0].data[0];
        expect((saved.field.photo as PhotoType[]).map((p) => p.uri)).toEqual(['file:///photos/EMAP_0.jpeg']);
        expect(saved.field.memo).toBe('unsaved text');
        expect(navigateToSplit).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('deletes the new photo and the earlier added photos when the record is gone', async () => {
      mockTakePendingPhoto.mockResolvedValue(pendingPhoto);
      const store = createStore({
        layerId: 'layer1',
        recordId: 'rec1',
        fieldName: 'photo',
        draft,
      });
      //撮影中に記録が消えた状態
      store.dispatch(setDataSetAction([{ layerId: 'layer1', userId: 'user1', data: [] }]));
      const { navigateToSplit } = render(store);
      await flush();
      expect(navigateToSplit).not.toHaveBeenCalled();
      expect(mockDeleteLocalPhoto).toHaveBeenCalledWith('file:///photos/EMAP_1.jpeg');
      expect(mockDeleteLocalPhoto).toHaveBeenCalledWith('file:///photos/EMAP_0.jpeg');
    });

    it('ignores a draft that belongs to another record', async () => {
      mockTakePendingPhoto.mockResolvedValue(pendingPhoto);
      const otherDraft = { ...draft, record: { ...draftRecord, id: 'other' } };
      const store = createStore({ layerId: 'layer1', recordId: 'rec1', fieldName: 'photo', draft: otherDraft });
      render(store);
      await flush();
      const saved = store.getState().dataSet[0].data[0];
      expect((saved.field.photo as PhotoType[]).map((p) => p.uri)).toEqual(['file:///photos/EMAP_1.jpeg']);
      expect(saved.field.memo).toBeUndefined();
    });
  });

  describe('a template record in a running project (P-M1/P-M10)', () => {
    const templatePhoto = (id: string, extra: Partial<PhotoType> = {}): PhotoType => ({
      id,
      name: `${id}.jpg`,
      url: `https://x/${id}`,
      uri: `file:///docs/projects/p1/layer1/user1/${id}_${id}.jpg`,
      width: 1,
      height: 1,
      thumbnail: null,
      key: 'k',
      ...extra,
    });
    const templateRecord = {
      ...record,
      userId: 'template',
      displayName: 'template',
      field: { photo: [templatePhoto('keep'), templatePhoto('removed')] },
    } as unknown as RecordType;
    const addedPhoto = templatePhoto('added', {
      url: null,
      key: null,
      uri: 'file:///photos/p1/layer1/user1/added.jpg',
    });
    const createProjectStore = (pending: PendingPhotoCaptureType) => {
      const initial = rootReducer(undefined, { type: '@@INIT' });
      return configureStore({
        reducer: rootReducer,
        preloadedState: {
          ...initial,
          dataSet: [
            { layerId: 'layer1', userId: 'template', data: [templateRecord] },
            { layerId: 'layer1', userId: 'user1', data: [] },
          ],
          layers: [layer],
          settings: {
            ...initial.settings,
            projectId: 'p1',
            isSettingProject: false,
            role: 'MEMBER' as RoleType,
            pendingPhotoCapture: pending,
          },
          user: { uid: 'user1', email: 'a@b.c', displayName: 'user', photoURL: null },
        },
        middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
      });
    };

    it('does not delete the removed template photo file, and detaches the copy photos from the template', async () => {
      mockTakePendingPhoto.mockResolvedValue({
        uri: 'file:///photos/p1/layer1/user1/new.jpg',
        thumbnail: null,
        name: 'new.jpg',
        width: 1,
        height: 1,
      });
      const draft = {
        record: {
          ...templateRecord,
          field: { photo: [templatePhoto('keep'), { ...templatePhoto('removed'), uri: undefined }, addedPhoto] },
        } as unknown as RecordType,
        isEditing: true,
        temporaryAddedPhotoList: [{ photoId: 'added', uri: addedPhoto.uri as string }],
        temporaryDeletePhotoList: [{ photoId: 'removed', uri: 'file:///docs/projects/p1/layer1/user1/removed_removed.jpg' }],
      };
      const store = createProjectStore({ layerId: 'layer1', recordId: 'rec1', fieldName: 'photo', draft });
      render(store);
      await flush();
      await flush();

      //外したテンプレートの写真の原画は、テンプレートの写真として残るので消さない
      expect(mockDeleteLocalPhoto).not.toHaveBeenCalled();
      const copy = store.getState().dataSet.find((d) => d.userId === 'user1')!.data[0];
      const photos = copy.field.photo as PhotoType[];
      //外した写真は写しに入らない。テンプレートの写真は新しい id・別名のファイルになり、足した写真といま撮った写真はそのまま
      expect(photos).toHaveLength(3);
      expect(photos[0].id).not.toBe('keep');
      expect(photos[0]).toMatchObject({ url: null, key: null });
      expect(photos[0].uri).not.toBe('file:///docs/projects/p1/layer1/user1/keep_keep.jpg');
      expect(FileSystem.copyAsync).toHaveBeenCalledWith({
        from: 'file:///docs/projects/p1/layer1/user1/keep_keep.jpg',
        to: photos[0].uri,
      });
      expect(photos[1]).toEqual(addedPhoto);
      expect(photos[2]).toMatchObject({ uri: 'file:///photos/p1/layer1/user1/new.jpg', url: null });
      //写しはテンプレートの写真の id を共有しない（片方で外すともう一方の原画まで消える状態を残さない）
      expect(photos.map((p) => p.id)).not.toContain('keep');
      expect(photos.map((p) => p.id)).not.toContain('removed');
    });

    it('テンプレートから作った自分の写しは、テンプレートの墓標と並んでいても写しとして扱わず、写真を付け替えない', async () => {
      mockTakePendingPhoto.mockResolvedValue({
        uri: 'file:///docs/projects/p1/layer1/user1/new.jpg',
        thumbnail: null,
        name: 'new.jpg',
        width: 1,
        height: 1,
      });
      const uploaded = templatePhoto('mine', {
        uri: 'file:///docs/projects/p1/layer1/user1/mine.jpg',
        url: 'https://x/mine',
      });
      const removedUploaded = templatePhoto('gone', {
        uri: 'file:///docs/projects/p1/layer1/user1/gone.jpg',
        url: 'https://x/gone',
      });
      const ownCopy = {
        ...record,
        userId: 'user1',
        field: { photo: [uploaded, removedUploaded] },
      } as unknown as RecordType;
      //テンプレートを保存すると、テンプレートの集合に同じ id の墓標が残る（moveRecordsToUserAction）
      const tombstone = { ...templateRecord, deleted: true, uploaded: true } as unknown as RecordType;
      const draft = {
        record: { ...ownCopy, field: { photo: [uploaded, { ...removedUploaded, uri: undefined }] } } as RecordType,
        isEditing: true,
        temporaryAddedPhotoList: [],
        temporaryDeletePhotoList: [{ photoId: 'gone', uri: 'file:///docs/projects/p1/layer1/user1/gone.jpg' }],
      };
      const initial = rootReducer(undefined, { type: '@@INIT' });
      const store = configureStore({
        reducer: rootReducer,
        preloadedState: {
          ...initial,
          dataSet: [
            { layerId: 'layer1', userId: 'template', data: [tombstone] },
            { layerId: 'layer1', userId: 'user1', data: [ownCopy] },
          ],
          layers: [layer],
          settings: {
            ...initial.settings,
            projectId: 'p1',
            isSettingProject: false,
            role: 'MEMBER' as RoleType,
            pendingPhotoCapture: { layerId: 'layer1', recordId: 'rec1', fieldName: 'photo', draft },
          },
          user: { uid: 'user1', email: 'a@b.c', displayName: 'user', photoURL: null },
        },
        middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
      });
      render(store);
      await flush();
      await flush();

      //写しではないので、コピーも取得もしない
      expect(FileSystem.copyAsync).not.toHaveBeenCalled();
      expect(mockDownloadPhoto).not.toHaveBeenCalled();
      //外した写真の端末のファイルは消す
      expect(mockDeleteLocalPhoto).toHaveBeenCalledWith('file:///docs/projects/p1/layer1/user1/gone.jpg');
      const saved = store.getState().dataSet.find((d) => d.userId === 'user1')!.data[0];
      const photos = saved.field.photo as PhotoType[];
      //上げ済みの写真は id も url もそのまま。外した写真は消去の印（uri が undefined）のまま残り、次の同期で消される
      expect(photos[0]).toEqual(uploaded);
      expect(photos[1]).toMatchObject({ id: 'gone', uri: undefined, url: 'https://x/gone' });
      expect(photos[2]).toMatchObject({ uri: 'file:///docs/projects/p1/layer1/user1/new.jpg', url: null });
      //テンプレートの墓標は変えない
      const templateBucket = store.getState().dataSet.find((d) => d.userId === 'template')!.data;
      expect(templateBucket).toEqual([tombstone]);
    });
  });
});
