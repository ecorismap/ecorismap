import { renderHook } from '@testing-library/react-hooks';
import { useFeatureStyle } from '../useFeatureStyle';
import { ColorTypesType, LayerType } from '../../types';

const createLayer = (
  colorType: ColorTypesType,
  type: LayerType['type'] = 'POINT',
  toolPalette?: LayerType['toolPalette']
): LayerType => ({
  id: 'L1',
  name: 'Layer 1',
  type,
  toolPalette,
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

//飛翔図パレットは組織アカウント限定のため有効にしておく
jest.mock('../useFeatureFlags', () => ({
  useFeatureFlags: () => ({ hisyouTool: true, mapPresets: true, layerPresets: true }),
}));

describe('useFeatureStyle カラータイプの選択肢', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('プロジェクトを開いていないときはユーザー別を除外する', () => {
    mockProjectId = undefined;
    const { result } = renderHook(() => useFeatureStyle(createLayer('SINGLE'), false));

    expect(result.current.colorTypes).not.toContain('USER');
    expect(result.current.colorTypes).toEqual(['SINGLE', 'CATEGORIZED']);
    // ラベルは選択肢と同じ数・同じ並びであること
    expect(result.current.colorTypeLabels).toHaveLength(result.current.colorTypes.length);
  });

  test('用途が飛翔図・植生図のレイヤだけ個別を選べる', () => {
    mockProjectId = 'P1';
    const hisyou = renderHook(() => useFeatureStyle(createLayer('SINGLE', 'LINE', 'HISYOU'), false));
    const vegetation = renderHook(() => useFeatureStyle(createLayer('SINGLE', 'POLYGON', 'VEGETATION'), false));

    expect(hisyou.result.current.colorTypes).toContain('INDIVIDUAL');
    expect(vegetation.result.current.colorTypes).toContain('INDIVIDUAL');
  });

  test('用途が未設定のレイヤは個別を選べない（色を書き込む経路が無くフォールバック色になるため）', () => {
    mockProjectId = 'P1';
    const point = renderHook(() => useFeatureStyle(createLayer('SINGLE', 'POINT'), false));
    const line = renderHook(() => useFeatureStyle(createLayer('SINGLE', 'LINE'), false));
    const polygon = renderHook(() => useFeatureStyle(createLayer('SINGLE', 'POLYGON'), false));

    expect(point.result.current.colorTypes).not.toContain('INDIVIDUAL');
    expect(line.result.current.colorTypes).not.toContain('INDIVIDUAL');
    expect(polygon.result.current.colorTypes).not.toContain('INDIVIDUAL');
  });

  test('個別が設定済みのレイヤは選択肢に残す（切り替えれば消える）', () => {
    mockProjectId = undefined;
    const { result } = renderHook(() => useFeatureStyle(createLayer('INDIVIDUAL', 'POINT'), false));

    // 選択中の値が選択肢から消えるとピッカーの表示が壊れるため残す
    expect(result.current.colorTypes).toContain('INDIVIDUAL');
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
