import { renderHook, act } from '@testing-library/react-hooks';
import { PhotoType, SelectedPhotoType, UserType } from '../../types';
import { layers } from '../../__tests__/resources/layer';
import { point_record } from '../../__tests__/resources/record';
import { useDataEdit } from '../useDataEdit';

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

jest.mock('uuid', () => ({ v4: () => '123456789' }));
jest.mock('i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  language: ['en'],
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  use: () => {
    return {
      init: () => {},
    };
  },
  t: (key: string) => key,
}));

const projectId: string | undefined = '0';
const user: UserType = {
  uid: '0',
  email: 'mizutani.takayuki@gmail.com',
  displayName: 'Takayuki Mizutani',
  photoURL: 'https://www.dummy.com/test.jpg',
};
const isEditingRecord = false;

jest.mock('../usePhoto', () => ({
  usePhoto: () => ({
    deleteRecordPhotos: jest.fn,
  }),
}));

jest.mock('../useRecord', () => ({
  useRecord: () => ({
    selectRecord: jest.fn,
  }),
}));

describe('useDataEdit', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(isEditingRecord);

    jest.mock('react-native/Libraries/Utilities/Platform', () => {
      const Platform = jest.requireActual('react-native/Libraries/Utilities/Platform');
      Platform.OS = 'web';
      return Platform;
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('写真をデータに追加する', async () => {
    const record = point_record[0];
    const layer = layers[0];
    const photo = {
      uri: 'test.jpg',
      thumbnail: 'test_thumbnail.jpg',
      width: 400,
      height: 300,
      name: 'test.jpg',
    };
    const { result, waitForNextUpdate } = renderHook(() => useDataEdit(record, layer));

    act(() => {
      result.current.addPhoto('photo', photo);
    });
    waitForNextUpdate();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'settings/edit', value: { isEditingRecord: true } });
    expect(result.current.targetRecord).toStrictEqual({
      coords: { ele: 100, latitude: 38.24715800176878, longitude: 140.71658064854364 },
      displayName: 'mizutani',
      field: {
        cmt: '',
        name: 'St.1',
        photo: [
          {
            height: 300,
            id: '123456789',
            key: null,
            name: 'test.jpg',
            thumbnail: 'test_thumbnail.jpg',
            uri: 'test.jpg',
            url: null,
            width: 400,
          },
        ],
        time: '2020-01-01T09:28:38+09:00',
      },
      id: '1234',
      redraw: false,
      userId: '0',
      visible: true,
    });
  });
  test('写真を除く', async () => {
    const record = point_record[1];
    const layer = layers[0];

    const photo: SelectedPhotoType = {
      id: '123456789',
      name: 'test.jpg',
      uri: 'test.jpg',
      url: null,
      width: 0,
      height: 0,
      thumbnail: 'test_thumbnail.jpg',
      key: null,
      index: 0,
      fieldName: 'photo',
      hasLocal: false,
    };
    const { result, waitForNextUpdate } = renderHook(() => useDataEdit(record, layer));

    act(() => {
      result.current.removePhoto(photo);
    });
    waitForNextUpdate();
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'settings/edit', value: { isEditingRecord: true } });
    expect(result.current.targetRecord).toStrictEqual({
      coords: { ele: undefined, latitude: 38.24101016421964, longitude: 140.71548306286388 },
      displayName: 'takayuki',
      field: { cmt: '', name: 'St.3', photo: [], time: '5時' },
      id: '1234',
      redraw: false,
      userId: '1',
      visible: true,
    });
  });
  test('写真を選択する', async () => {
    const record = point_record[1];
    const layer = layers[0];

    const photo: PhotoType = {
      id: '123456789',
      name: 'test.jpg',
      uri: 'test.jpg',
      url: null,
      width: 0,
      height: 0,
      thumbnail: 'test_thumbnail.jpg',
      key: null,
    };

    const { result, waitForNextUpdate } = renderHook(() => useDataEdit(record, layer));

    act(() => {
      result.current.selectPhoto('photo', photo, 0);
    });
    waitForNextUpdate();
    expect(result.current.selectedPhoto).toStrictEqual({
      fieldName: 'photo',
      hasLocal: true,
      height: 0,
      id: '123456789',
      index: 0,
      key: null,
      name: 'test.jpg',
      thumbnail: 'test_thumbnail.jpg',
      uri: 'test.jpg',
      url: null,
      width: 0,
    });
  });
});
