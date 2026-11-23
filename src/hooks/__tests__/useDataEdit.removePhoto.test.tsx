/**
 * プロジェクトで写真を外したときの記録の中身（写真監査 P-L6）
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import rootReducer from '../../modules';
import { useDataEdit } from '../useDataEdit';
import { LayerType, PhotoType, RecordType, SelectedPhotoType } from '../../types';

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
  hasLocalPhotoFile: async () => true,
}));

const layer = {
  id: 'L',
  name: 'L',
  type: 'NONE',
  permission: 'PUBLIC',
  field: [{ id: 'p', name: '写真', format: 'PHOTO' }],
  active: true,
} as unknown as LayerType;

const photo = (id: string, extra: Partial<PhotoType> = {}): PhotoType => ({
  id,
  name: `${id}.jpg`,
  uri: `file:///docs/projects/p1/L/me/${id}.jpg`,
  url: `https://x/${id}`,
  key: 'k',
  width: 1,
  height: 1,
  thumbnail: 'data:image/jpeg;base64,AAAA',
  ...extra,
});

const makeRecord = (photos: PhotoType[]): RecordType => ({
  id: 'r1',
  userId: 'me',
  displayName: 'me',
  visible: true,
  redraw: false,
  coords: undefined,
  field: { 写真: photos },
  updatedAt: 100,
});

const setup = (projectId: string | undefined, record: RecordType) => {
  const base = rootReducer(undefined, { type: '@@INIT' });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      ...base,
      user: { ...base.user, uid: 'me' },
      settings: { ...base.settings, projectId, role: 'MEMBER' as const },
      layers: [layer],
      dataSet: [{ layerId: 'L', userId: 'me', data: [record] }],
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return renderHook(() => useDataEdit(record, layer), { wrapper });
};

const select = (p: PhotoType, index: number): SelectedPhotoType => ({ ...p, index, fieldName: '写真', hasLocal: true });

describe('removePhoto（P-L6）', () => {
  beforeEach(() => mockDeleteLocalPhoto.mockClear());

  it('プロジェクトでも、まだ上げていない写真（url:null）は配列から取り除く', () => {
    const local = photo('a', { url: null, key: null });
    const { result } = setup('p1', makeRecord([local, photo('b')]));

    act(() => {
      result.current.removePhoto(select(local, 0));
    });

    expect((result.current.targetRecord.field['写真'] as PhotoType[]).map((p) => p.id)).toEqual(['b']);
  });

  it('プロジェクトで上げてある写真は uri:undefined の印にし、SelectedPhoto の余分なキーを持ち込まない', () => {
    const uploaded = photo('b');
    const { result } = setup('p1', makeRecord([photo('a'), uploaded]));

    act(() => {
      result.current.removePhoto(select(uploaded, 1));
    });

    const photos = result.current.targetRecord.field['写真'] as PhotoType[];
    expect(photos).toHaveLength(2);
    expect(photos[1]).toEqual({ ...uploaded, uri: undefined });
    expect(Object.keys(photos[1]).sort()).toEqual(Object.keys(uploaded).sort());
  });

  it('表示中に位置がずれていても、id の一致する写真を外す', () => {
    const target = photo('b', { url: null, key: null });
    const { result } = setup('p1', makeRecord([photo('a'), target]));

    act(() => {
      //開いたときは先頭だったが、その後に一覧が変わった
      result.current.removePhoto(select(target, 0));
    });

    expect((result.current.targetRecord.field['写真'] as PhotoType[]).map((p) => p.id)).toEqual(['a']);
  });

  it('プロジェクトでなければ、上げてある写真でも取り除く（従来どおり）', () => {
    const uploaded = photo('a');
    const { result } = setup(undefined, makeRecord([uploaded]));

    act(() => {
      result.current.removePhoto(select(uploaded, 0));
    });

    expect(result.current.targetRecord.field['写真']).toEqual([]);
  });

  it('外した上げていない写真のファイルは、保存のときに消す', async () => {
    const local = photo('a', { url: null, key: null });
    const { result } = setup('p1', makeRecord([local]));

    act(() => {
      result.current.removePhoto(select(local, 0));
    });
    await act(async () => {
      await result.current.saveData();
    });

    expect(mockDeleteLocalPhoto).toHaveBeenCalledWith(local.uri);
  });
});
