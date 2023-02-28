import { LayerType, UserType } from '../types';
import { COLOR } from '../constants/AppConstants';
import { useLayers } from './useLayers';
import { renderHook, act } from '@testing-library/react-hooks';
import { useData } from './useData';
import { dataSet } from '../__tests__/resources/dataSet';

const layers: LayerType[] = [
  {
    id: '0',
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
    active: true,
    field: [
      { id: '0-0', name: 'name', format: 'SERIAL' },
      { id: '0-1', name: 'time', format: 'DATETIME' },
      { id: '0-2', name: 'cmt', format: 'STRING' },
      { id: '0-3', name: 'photo', format: 'PHOTO' },
    ],
  },
  {
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
    mockSelector = jest.fn().mockReturnValueOnce(projectId).mockReturnValueOnce(user).mockReturnValueOnce(dataSet);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  //let result: RenderResult<UseLayersReturnType>;

  test('編集ボタンを押すとアクティブの場合、非アクティブになる', () => {
    const { result } = renderHook(() => useLayers());
    expect(result.current.layers[0].active).toBe(true);
    act(() => {
      result.current.changeActiveLayer(0);
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/set',
      value: [{ ...result.current.layers[0], active: false }, ...result.current.layers.slice(1)],
    });
  });

  test('編集ボタンを押すと非アクティブはアクティブになり、同タイプは非アクティブになる', () => {
    const { result } = renderHook(() => useLayers());

    expect(result.current.layers[0].active).toBe(true);
    expect(result.current.layers[1].active).toBe(false);
    expect(result.current.layers[0].type).toBe('POINT');
    expect(result.current.layers[1].type).toBe('POINT');

    act(() => {
      result.current.changeActiveLayer(1);
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/set',
      value: [
        { ...result.current.layers[0], active: false },
        { ...result.current.layers[1], active: true },
      ],
    });
  });

  test('表示非表示ボタンを押すとデータの表示非表示が切り替わる', () => {
    const layer = layers[0];
    const { result } = renderHook(() => useData(layer));
    const record = result.current.allUserRecordSet[0];
    expect(record.visible).toBe(true);

    act(() => {
      result.current.changeVisible(record);
    });

    expect(mockDispatch).toHaveBeenCalledWith();
  });

  test('ラベルが切り替わる', () => {
    const { result } = renderHook(() => useLayers());
    const layer = result.current.layers[0];
    expect(layer.label).toBe('name');

    act(() => {
      result.current.changeLabel(layer, 'id');
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/update',
      value: { ...layer, label: 'id' },
    });
  });

  test('レイヤ順番ボタンを押すと順番が一つ前になる', () => {
    const { result } = renderHook(() => useLayers());
    expect(result.current.layers).toEqual(layers);

    act(() => {
      result.current.changeLayerOrder(1);
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/set',
      value: [result.current.layers[1], result.current.layers[0]],
    });
  });

  test('一番上のレイヤ順番ボタンを押しても順番は変わらない', () => {
    const { result } = renderHook(() => useLayers());
    expect(result.current.layers).toEqual(layers);

    act(() => {
      result.current.changeLayerOrder(0);
    });
    expect(mockDispatch).toHaveLength(0);
  });
});
