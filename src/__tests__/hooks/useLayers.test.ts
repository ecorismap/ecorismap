import { RenderResult, renderHook, act } from '@testing-library/react-hooks';
import { LayerType, TrackingType, UserType } from '../../types';
import { COLOR, FEATURETYPE, PERMISSIONTYPE } from '../../constants/AppConstants';
import { useLayers, UseLayersReturnType } from '../../hooks/useLayers';
import { createLayersInitialState } from '../../modules/layers';

const layers: LayerType[] = [
  ...createLayersInitialState(),
  {
    id: '3',
    name: 'ポイント',
    type: FEATURETYPE.POINT,
    permission: 'PRIVATE',
    colorStyle: {
      colorType: 'Single',
      color: COLOR.RED,
      fieldName: 'name',
      colorRamp: 'Random',
      colorList: [],
      transparency: 1,
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
const user: UserType = {
  uid: '0',
  email: 'mizutani.takayuki@gmail.com',
  displayName: 'Takayuki Mizutani',
  photoURL: 'https://www.dummy.com/test.jpg',
};
const tracking: TrackingType = {
  layerId: '0',
  dataId: '0',
};

const projectId = '0';
const isOwner = 'true';
const isSettingProject = 'true';

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

describe('useLayers', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(layers)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(tracking)
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(isOwner)
      .mockReturnValueOnce(isSettingProject);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  let result: RenderResult<UseLayersReturnType>;

  test('changeActiveLayerを呼ぶと、アクティブの場合、非アクティブになる', () => {
    result = renderHook(() => useLayers()).result;

    expect(result.current.layers[0].active).toBe(true);
    act(() => {
      result.current.changeActiveLayer(0);
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/set',
      value: [{ ...result.current.layers[0], active: false }, ...result.current.layers.slice(1)],
    });
  });

  test('changeActiveLayerを呼ぶと、非アクティブはアクティブになり、同タイプは非アクティブになる', () => {
    result = renderHook(() => useLayers()).result;

    expect(result.current.layers[0].active).toBe(true);
    expect(result.current.layers[3].active).toBe(false);
    expect(result.current.layers[0].type).toBe(FEATURETYPE.POINT);
    expect(result.current.layers[3].type).toBe(FEATURETYPE.POINT);
    act(() => {
      result.current.changeActiveLayer(3);
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/set',
      value: [
        { ...result.current.layers[0], active: false },
        ...result.current.layers.slice(1, 3),
        { ...result.current.layers[3], active: true },
      ],
    });
  });
});
