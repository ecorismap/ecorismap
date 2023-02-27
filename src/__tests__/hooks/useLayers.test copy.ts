import { LayerType } from '../../types';
import { COLOR } from '../../constants/AppConstants';
import { useLayers } from '../../hooks/useLayers';
import { renderHook, act } from '@testing-library/react-hooks';

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

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

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
jest.mock('../../utils/File', () => ({ clearCacheData: jest.fn(), exportDataAndPhoto: jest.fn() }));

describe('useLayers', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest.fn().mockReturnValueOnce(layers);
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

  test('表示非表示ボタンを押すとレイヤの表示非表示が切り替わる', () => {
    const { result } = renderHook(() => useLayers());
    const layer = result.current.layers[0];
    expect(layer.visible).toBe(true);

    act(() => {
      result.current.changeVisible(layer);
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/update',
      value: { ...layer, visible: false },
    });
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
