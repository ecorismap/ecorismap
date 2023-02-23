import { LayerType, TrackingType, UserType } from '../../types';
import { COLOR } from '../../constants/AppConstants';
import { useLayers } from '../../hooks/useLayers';
import { renderHook, act } from '@testing-library/react-hooks';
import { dataSet } from '../resources/dataSet';
import { settings } from '../resources/settings';
import { maps } from '../resources/maps';

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
const isSettingProject = 'true';

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
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(layers)
      .mockReturnValueOnce(dataSet)
      .mockReturnValueOnce(settings)
      .mockReturnValueOnce(maps)
      .mockReturnValueOnce(projectId)
      .mockReturnValueOnce(user)
      .mockReturnValueOnce(tracking)
      .mockReturnValueOnce(settings.role)
      .mockReturnValueOnce(isSettingProject);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  //let result: RenderResult<UseLayersReturnType>;

  test('changeActiveLayerを呼ぶと、アクティブの場合、非アクティブになる', () => {
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

  test('changeActiveLayerを呼ぶと、非アクティブはアクティブになり、同タイプは非アクティブになる', () => {
    const { result } = renderHook(() => useLayers());

    expect(result.current.layers[0].active).toBe(true);
    expect(result.current.layers[0].type).toBe('POINT');
    act(() => {
      result.current.changeActiveLayer(0);
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'layers/set',
      value: [{ ...result.current.layers[0], active: false }],
    });
  });
});
