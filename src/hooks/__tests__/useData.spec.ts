import { renderHook, act } from '@testing-library/react-hooks';
import { useData } from '../useData';
import { DataType, LayerType, UserType } from '../../types';
import { COLOR } from '../../constants/AppConstants';
//@ts-ignore
import MockDate from 'mockdate';
jest.mock('uuid', () => ({ v4: () => '1234' }));
MockDate.set('2000-01-01');

const layer: LayerType = {
  id: '1',
  name: 'point',
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    transparency: 0.2,
    color: COLOR.RED,
    fieldName: 'name',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
  },
  label: 'name',
  visible: true,
  active: false,
  field: [
    { id: '0-0', name: 'name', format: 'SERIAL' },
    { id: '0-1', name: 'time', format: 'DATETIME' },
    { id: '0-2', name: 'cmt', format: 'STRING' },
    { id: '0-3', name: 'photo', format: 'PHOTO' },
  ],
};
const dataSet: DataType[] = [
  { layerId: '0', userId: undefined, data: [] },
  {
    layerId: '1',
    userId: '0123',
    data: [
      {
        id: '0',
        userId: '0',
        displayName: 'abc',
        visible: true,
        redraw: false,
        coords: [{ latitude: 0, longitude: 0 }],
        field: { name: 'abc', time: '2020-01-01T00:00:00.000Z', cmt: 'test', photo: 'https://www.dummy.com/test.jpg' },
      },
    ],
  },
];

const projectId = '0';
const user: UserType = {
  uid: '0123',
  email: 'abc@test.com',
  displayName: 'abc',
  photoURL: 'https://www.dummy.com/test.jpg',
};

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

describe('useData', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    //useDataからusePhotoを呼んでいて、そこでもuseSelectorが呼ばれている。
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(dataSet)
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(dataSet);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('表示非表示ボタンを押すとデータの表示非表示が切り替わる', () => {
    const { result } = renderHook(() => useData(layer));

    const record = result.current.allUserRecordSet[0];
    expect(record.visible).toBe(true);

    act(() => {
      result.current.changeVisible(record);
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'dataSet/updateRecords',
      value: {
        data: [
          {
            coords: [{ latitude: 0, longitude: 0 }],
            displayName: 'abc',
            field: {
              cmt: 'test',
              name: 'abc',
              photo: 'https://www.dummy.com/test.jpg',
              time: '2020-01-01T00:00:00.000Z',
            },
            id: '0',
            redraw: false,
            userId: '0',
            visible: false,
          },
        ],
        layerId: '1',
        userId: '0',
      },
    });
  });

  test('全表示非表示ボタンを押すとすべてのデータの表示非表示が切り替わる', () => {
    const { result } = renderHook(() => useData(layer));

    //expect(mockSelector).toBeCalledTimes(8);
    act(() => {
      result.current.changeVisibleAll(true);
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'dataSet/setRecordSet',
      value: {
        data: [
          {
            coords: [{ latitude: 0, longitude: 0 }],
            displayName: 'abc',
            field: {
              cmt: 'test',
              name: 'abc',
              photo: 'https://www.dummy.com/test.jpg',
              time: '2020-01-01T00:00:00.000Z',
            },
            id: '0',
            redraw: false,
            userId: '0',
            visible: true,
          },
        ],
        layerId: '1',
        userId: '0123',
      },
    });
  });

  test('チェックボタンを押すとデータのチェックが切り替わる', () => {
    const { result } = renderHook(() => useData(layer));
    expect(result.current.checkList[0]).toBe(false);

    act(() => {
      result.current.changeChecked(0);
    });

    expect(result.current.checkList[0]).toBe(true);
  });

  test('全チェックボタンを押すとすべてのデータのチェックが切り替わる', () => {
    const { result } = renderHook(() => useData(layer));
    expect(result.current.checkList[0]).toBe(false);

    act(() => {
      result.current.changeCheckedAll(true);
    });

    expect(result.current.checkList[0]).toBe(true);
  });

  test('データ追加ボタンを押すとデータが追加される', () => {
    const { result } = renderHook(() => useData(layer));
    act(() => {
      result.current.addDefaultRecord();
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'dataSet/addRecords',
      value: {
        data: [
          {
            coords: { latitude: 0, longitude: 0 },
            displayName: 'abc',
            field: { cmt: '', name: 1, photo: [], time: '2000-01-01T09:00:00+09:00' },
            id: '1234',
            redraw: false,
            userId: '0123',
            visible: true,
          },
        ],
        layerId: '1',
        userId: '0123',
      },
    });
  });

  test('データ削除ボタンを押すとチェックされているデータが削除される', () => {
    const { result } = renderHook(() => useData(layer));

    expect(result.current.checkList[0]).toBe(false);
    act(() => {
      result.current.changeChecked(0);
    });
    expect(result.current.checkList[0]).toBe(true);
    act(() => {
      result.current.deleteRecords();
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'dataSet/deleteRecords',
      value: {
        data: [
          {
            coords: [{ latitude: 0, longitude: 0 }],
            displayName: 'abc',
            field: {
              cmt: 'test',
              name: 'abc',
              photo: 'https://www.dummy.com/test.jpg',
              time: '2020-01-01T00:00:00.000Z',
            },
            id: '0',
            redraw: false,
            userId: '0',
            visible: true,
          },
        ],
        layerId: '1',
        userId: undefined,
      },
    });
  });

  test('エクスポートボタンを押すとチェックされているデータがジオデータに変換される', () => {
    const { result } = renderHook(() => useData(layer));

    expect(result.current.checkList[0]).toBe(false);
    act(() => {
      result.current.changeChecked(0);
    });
    expect(result.current.checkList[0]).toBe(true);

    let exportData;
    let fileName;
    act(() => {
      const ret = result.current.generateExportGeoData();
      exportData = ret.exportData;
      fileName = ret.fileName;
    });
    expect(exportData).not.toEqual('');
    expect(fileName).toEqual('point_2000-01-01_09-00-00');
  });
});
