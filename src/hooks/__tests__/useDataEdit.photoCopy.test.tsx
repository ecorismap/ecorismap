/**
 * 記録の複製とテンプレートの写しで、写真を元の記録と共有しない（写真監査 P-M8・P-M10）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import rootReducer from '../../modules';
import { useDataEdit } from '../useDataEdit';
import { DataType, LayerType, PhotoType, RecordType, RoleType } from '../../types';

jest.mock('../useProject', () => ({
  useProject: () => ({ isSettingProject: false }),
}));
jest.mock('../useRecord', () => ({
  useRecord: () => ({ selectRecord: jest.fn(), setIsEditingRecord: jest.fn() }),
}));
jest.mock('../../contexts/BottomSheetNavigationContext', () => ({
  useBottomSheetNavigation: () => ({
    currentScreen: { name: 'DataEdit', params: {} },
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
}));
const mockDeleteLocalPhoto = jest.fn();
jest.mock('../../utils/Photo', () => ({
  deleteLocalPhoto: (uri: string) => mockDeleteLocalPhoto(uri),
  deleteRecordPhotos: jest.fn(),
  hasLocalPhotoFile: async (uri: string | null | undefined) => typeof uri === 'string' && !uri.includes('missing'),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
}));

const mockDownloadPhoto = jest.fn();
jest.mock('../../lib/firebase/storage', () => ({
  downloadPhoto: (...args: unknown[]) => mockDownloadPhoto(...args),
}));

import * as FileSystem from 'expo-file-system/legacy';

const root = 'file:///docs/projects';

const layer = {
  id: 'L',
  name: 'L',
  type: 'NONE',
  permission: 'PUBLIC',
  field: [
    { id: 'f', name: 'name', format: 'STRING' },
    { id: 'p', name: '写真', format: 'PHOTO' },
  ],
  active: true,
} as unknown as LayerType;

const photo = (id: string, extra: Partial<PhotoType> = {}): PhotoType => ({
  id,
  name: 'EMAP_1.jpg',
  uri: `file:///docs/projects/p1/L/me/${id}.jpg`,
  url: `https://x/${id}`,
  key: 'k',
  width: 1,
  height: 1,
  thumbnail: null,
  ...extra,
});

const makeRecord = (userId: string, photos: PhotoType[]): RecordType => ({
  id: 'r1',
  userId,
  displayName: userId,
  visible: true,
  redraw: false,
  coords: undefined,
  field: { name: 'original', 写真: photos },
  updatedAt: 100,
  uploaded: true,
});

const setup = (record: RecordType) => {
  const initial = rootReducer(undefined, { type: '@@INIT' });
  const dataSet: DataType[] = [
    { layerId: 'L', userId: record.userId, data: [record] },
    ...(record.userId === 'me' ? [] : [{ layerId: 'L', userId: 'me', data: [] }]),
  ];
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      ...initial,
      dataSet,
      layers: [layer],
      user: { uid: 'me', email: '', displayName: 'Me', photoURL: '' },
      settings: { ...initial.settings, projectId: 'p1', isSettingProject: false, role: 'MEMBER' as RoleType },
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ immutableCheck: false, serializableCheck: false }),
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useDataEdit(record, layer), { wrapper });
  return { store, result };
};

const bucket = (dataSet: DataType[], userId: string) => dataSet.find((d) => d.userId === userId)?.data ?? [];
const photosOf = (record: RecordType) => record.field['写真'] as PhotoType[];

const resetMocks = () => {
  jest.clearAllMocks();
  //既定は取得できない（圏外）
  mockDownloadPhoto.mockResolvedValue({ isOK: false, message: 'offline', uri: null });
};

describe('記録の複製（P-M8）', () => {
  beforeEach(resetMocks);

  it('写真に新しい id を振り、原画を別名でコピーし、url/key を空にする。元の記録の写真は変えない', async () => {
    const original = makeRecord('me', [photo('a')]);
    const { store, result } = setup(original);
    let copied: RecordType | undefined;
    await act(async () => {
      copied = (await result.current.copyRecord(original)).record;
    });
    const [copiedPhoto] = photosOf(copied!);
    expect(copied!.id).not.toBe('r1');
    expect(copiedPhoto.id).not.toBe('a');
    expect(copiedPhoto).toMatchObject({ url: null, key: null });
    expect(copiedPhoto.uri).not.toBe(photo('a').uri);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: photo('a').uri, to: copiedPhoto.uri });
    const records = bucket(store.getState().dataSet, 'me');
    expect(photosOf(records.find((r) => r.id === 'r1')!)).toEqual([photo('a')]);
    expect(records.find((r) => r.id === copied!.id)).toBeDefined();
  });

  it('原画が手元にない写真は、クラウドから取得して自分の写真フォルダへ置き、自分の名義で上げ直す', async () => {
    mockDownloadPhoto.mockImplementation(async (_url: string, _key: string, filename: string, folder: string) => ({
      isOK: true,
      message: '',
      uri: `${folder}/${filename}`,
    }));
    const original = makeRecord('me', [photo('missing', { uri: null })]);
    const { result } = setup(original);
    let copied: { record: RecordType; droppedPhotoCount: number; sharedPhotoCount: number } | undefined;
    await act(async () => {
      copied = await result.current.copyRecord(original);
    });
    const [copiedPhoto] = photosOf(copied!.record);
    expect(mockDownloadPhoto).toHaveBeenCalledWith(
      'https://x/missing',
      'k',
      `${copiedPhoto.id}_EMAP_1.jpg`,
      `${root}/p1/L/me`
    );
    expect(copiedPhoto).toMatchObject({ url: null, key: null, uri: `${root}/p1/L/me/${copiedPhoto.id}_EMAP_1.jpg` });
    expect(copied!.sharedPhotoCount).toBe(0);
  });

  it('原画を取得できない写真は、新しい id で元の url/key を指したまま複製に残し、その枚数を返す', async () => {
    const original = makeRecord('me', [photo('missing', { uri: 'file:///docs/projects/p1/L/other/missing.jpg' })]);
    const { result } = setup(original);
    let copied: { record: RecordType; droppedPhotoCount: number; sharedPhotoCount: number } | undefined;
    await act(async () => {
      copied = await result.current.copyRecord(original);
    });
    const [copiedPhoto] = photosOf(copied!.record);
    expect(copied!.droppedPhotoCount).toBe(0);
    expect(copied!.sharedPhotoCount).toBe(1);
    expect(copiedPhoto).toMatchObject({ url: 'https://x/missing', key: 'k', uri: null });
    expect(copiedPhoto.id).not.toBe('missing');
  });

  it('他人の記録の写真 uri が自分の端末の LOCAL のパスを指していても、そのファイルは写さない（P-M13）', async () => {
    const original = makeRecord('other', [
      photo('a', { uri: `${root}/LOCAL/L/OWNER/a.jpg`, url: null, key: null }),
      photo('b', { uri: `${root}/p2/L/victim/b.jpg` }),
    ]);
    const { result } = setup(original);
    let copied: { record: RecordType; droppedPhotoCount: number; sharedPhotoCount: number } | undefined;
    await act(async () => {
      copied = await result.current.copyRecord(original);
    });
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    //クラウドにない a は写せない。b はクラウドの元を参照したまま（取得できないため）
    expect(copied!.droppedPhotoCount).toBe(1);
    expect(photosOf(copied!.record)).toEqual([expect.objectContaining({ url: 'https://x/b', uri: null })]);
  });

  it('原画もクラウドの実体もない写真は複製から外し、外した枚数を返す', async () => {
    const original = makeRecord('me', [
      photo('missing', { uri: 'file:///docs/projects/p1/L/other/missing.jpg', url: null, key: null }),
    ]);
    const { result } = setup(original);
    let copied: { record: RecordType; droppedPhotoCount: number } | undefined;
    await act(async () => {
      copied = await result.current.copyRecord(original);
    });
    expect(photosOf(copied!.record)).toEqual([]);
    expect(copied!.droppedPhotoCount).toBe(1);
  });
});

describe('テンプレートの写し（P-M10）', () => {
  beforeEach(resetMocks);

  it('写しの写真はテンプレートと切り離し、外した写真の端末のファイルは消さない', async () => {
    const template = makeRecord('template', [photo('keep'), photo('drop'), photo('notDownloaded', { uri: null })]);
    const { store, result } = setup(template);
    act(() => {
      result.current.changeField('name', 'edited');
    });
    act(() => {
      result.current.removePhoto({ ...photo('drop'), index: 1, fieldName: '写真', hasLocal: true });
    });
    await act(async () => {
      expect((await result.current.saveData()).isOK).toBe(true);
    });
    const [copy] = bucket(store.getState().dataSet, 'me');
    expect(copy.field.name).toBe('edited');
    const photos = photosOf(copy);
    //外した写真は入らず、原画のある写真はコピー、写真を落としていない写真は url/key を指したまま残る
    expect(photos).toHaveLength(2);
    expect(photos[0].id).not.toBe('keep');
    expect(photos[0]).toMatchObject({ url: null, key: null });
    expect(photos[0].uri).not.toBe(photo('keep').uri);
    expect(photos[1].id).not.toBe('notDownloaded');
    expect(photos[1]).toMatchObject({ url: 'https://x/notDownloaded', key: 'k', uri: null });
    expect(mockDeleteLocalPhoto).not.toHaveBeenCalled();
  });

  it('写せなかった写真があれば、保存はできたうえで知らせる文言を返す', async () => {
    const template = makeRecord('template', [photo('nothing', { uri: null, url: null, key: null })]);
    const { result } = setup(template);
    act(() => {
      result.current.changeField('name', 'edited');
    });
    let saved: { isOK: boolean; message: string } | undefined;
    await act(async () => {
      saved = await result.current.saveData();
    });
    expect(saved!.isOK).toBe(true);
    expect(saved!.message).not.toBe('');
  });

  it('写しを作るときに足した写真は、そのまま写しに入る', async () => {
    const template = makeRecord('template', []);
    const { store, result } = setup(template);
    act(() => {
      result.current.addPhoto('写真', {
        uri: 'file:///docs/projects/p1/L/me/new.jpg',
        thumbnail: null,
        width: 1,
        height: 1,
        name: 'new.jpg',
      });
    });
    await act(async () => {
      await result.current.saveData();
    });
    const [copy] = bucket(store.getState().dataSet, 'me');
    expect(photosOf(copy)).toEqual([expect.objectContaining({ uri: 'file:///docs/projects/p1/L/me/new.jpg', url: null })]);
    expect(FileSystem.copyAsync).not.toHaveBeenCalled();
  });
});
