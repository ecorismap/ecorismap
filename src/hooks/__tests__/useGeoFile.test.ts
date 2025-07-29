import { renderHook, act } from '@testing-library/react-hooks';
import { useGeoFile } from '../useGeoFile';
import { UserType } from '../../types';
//@ts-ignore
import Base64 from 'Base64';
import { Buffer } from 'buffer';

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

jest.mock('ulid', () => ({ ulid: () => '123456789' }));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
}));

// Set Platform.OS to 'web' for this test
const { Platform } = require('react-native');
Platform.OS = 'web';

const user: UserType = {
  uid: '0',
  email: 'mizutani.takayuki@gmail.com',
  displayName: 'Takayuki Mizutani',
  photoURL: 'https://www.dummy.com/test.jpg',
};

const projectId: string | undefined = '0';

describe('useGeoFile', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest.fn().mockReturnValueOnce(projectId).mockReturnValueOnce(user);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('web環境でgeojsonを読み込む', async () => {
    const name = 'test.geojson';
    const geojsonData = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Tokyo Tower',
          },
          geometry: {
            type: 'Point',
            coordinates: [139.7455, 35.6586],
          },
        },
      ],
    };

    const jsonString = JSON.stringify(geojsonData);
    const base64String = Buffer.from(jsonString).toString('base64');
    const uri = `data:application/json;base64,${base64String}`;
    const { result } = renderHook(() => useGeoFile());
    let ret;
    await act(async () => {
      ret = await result.current.importGeoFile(uri, name);
    });
    //expect(result.current.isLoading).toBe(true);
    //await waitForNextUpdate();
    //expect(result.current.isLoading).toStrictEqual(false);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
    expect(ret).toStrictEqual({ isOK: true, message: 'hooks.message.receiveFile' });
    expect(mockDispatch.mock.calls[0][0]).toEqual({
      type: 'layers/addLayerAction',
      payload: {
        active: false,
        colorStyle: {
          color: '#ff0000',
          colorList: [],
          colorRamp: 'RANDOM',
          colorType: 'SINGLE',
          customFieldValue: '',
          fieldName: '',
          lineWidth: 1.5,
          transparency: 0.8,
        },
        field: [{ format: 'STRING', id: '123456789', name: 'name' }],
        id: '123456789',
        label: '',
        name: 'test.geojson',
        permission: 'COMMON',
        type: 'POINT',
        visible: true,
      },
    });
    expect(mockDispatch.mock.calls[1][0]).toEqual({
      type: 'dataSet/addDataAction',
      payload: [
        {
          data: [
            {
              coords: { latitude: 35.6586, longitude: 139.7455 },
              displayName: 'Takayuki Mizutani',
              field: { name: 'Tokyo Tower' },
              id: '123456789',
              redraw: false,
              userId: '0',
              visible: true,
            },
          ],
          layerId: '123456789',
          userId: '0',
        },
      ],
    });
  });
});
