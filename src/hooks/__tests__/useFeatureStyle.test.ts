import { renderHook } from '@testing-library/react-hooks';
import { useFeatureStyle } from '../useFeatureStyle';
import { ColorTypesType, LayerType } from '../../types';

const createLayer = (colorType: ColorTypesType): LayerType => ({
  id: 'L1',
  name: 'Layer 1',
  type: 'POINT',
  visible: true,
  active: true,
  permission: 'PRIVATE',
  colorStyle: {
    colorType,
    color: '#ff0000',
    transparency: 0.2,
    fieldName: '',
    customFieldValue: '',
    colorRamp: 'RANDOM',
    colorList: [],
    lineWidth: 1.5,
  },
  label: 'name',
  field: [],
});

// プロジェクトを開いているかどうかをテストごとに切り替える
let mockProjectId: string | undefined;

jest.mock('react-redux', () => ({
  useDispatch: () => jest.fn(),
  useSelector: (selector: (state: any) => unknown) =>
    selector({
      settings: { projectId: mockProjectId },
      dataSet: [],
      layers: [],
    }),
  shallowEqual: jest.fn(),
}));

jest.mock('../../modules/selectors', () => ({
  selectDataSetForLayer: () => [],
}));

describe('useFeatureStyle カラータイプの選択肢', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('プロジェクトを開いていないときはユーザー別を除外する', () => {
    mockProjectId = undefined;
    const { result } = renderHook(() => useFeatureStyle(createLayer('SINGLE'), false));

    expect(result.current.colorTypes).not.toContain('USER');
    expect(result.current.colorTypes).toEqual(['SINGLE', 'CATEGORIZED', 'INDIVIDUAL']);
    // ラベルは選択肢と同じ数・同じ並びであること
    expect(result.current.colorTypeLabels).toHaveLength(result.current.colorTypes.length);
  });

  test('プロジェクトを開いているときはユーザー別を含む', () => {
    mockProjectId = 'P1';
    const { result } = renderHook(() => useFeatureStyle(createLayer('SINGLE'), false));

    expect(result.current.colorTypes).toContain('USER');
    expect(result.current.colorTypeLabels).toHaveLength(result.current.colorTypes.length);
  });

  test('ユーザー別が設定済みのレイヤは、プロジェクト外でも選択肢に残す', () => {
    mockProjectId = undefined;
    const { result } = renderHook(() => useFeatureStyle(createLayer('USER'), false));

    // 選択中の値が選択肢から消えるとピッカーの表示が壊れるため残す
    expect(result.current.colorTypes).toContain('USER');
  });
});
