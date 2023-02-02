import { RenderResult, renderHook, act } from '@testing-library/react-hooks';
import { Position } from '@turf/turf';
import { useDrawObjects, UseDrawObjectsReturnType } from '../../hooks/useDrawObjects';

import { DrawLineType, DrawToolType, RegionType, UndoLineType } from '../../types';

const mapRegion: RegionType = {
  latitude: 35,
  longitude: 135,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
  zoom: 11,
};

const mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

let mockWindowDimensions = jest.fn();
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  useWindowDimensions: () => mockWindowDimensions(),
}));
jest.mock('uuid', () => ({ v4: () => '123456789' }));

let result: RenderResult<UseDrawObjectsReturnType>;
describe('useDrawTool', () => {
  beforeAll(() => {
    mockSelector = jest.fn().mockReturnValue(mapRegion);
    mockWindowDimensions = jest.fn().mockReturnValue({ width: 411, height: 852 });
    result = renderHook(() =>
      useDrawObjects(drawLine, editingLineXY, undoLine, editingObjectIndex, currentDrawTool, isEditingObject)
    ).result;
  });

  beforeEach(() => {});

  afterEach(() => {
    //jest.resetAllMocks();
  });

  afterAll(() => {});

  const drawLine: { current: DrawLineType[] } = { current: [] };
  const editingLineXY: { current: Position[] } = { current: [] };
  const undoLine: { current: UndoLineType[] } = { current: [] };
  const editingObjectIndex = { current: -1 };
  const currentDrawTool: DrawToolType = 'PLOT_LINE';
  const isEditingObject: { current: boolean } = { current: false };

  const pXY = [0, 0];
  const pXY2 = [1, 1];
  const pXY3 = [2, 2];

  test('未編集の状態でPLOT_LINEツールで点を打つと編集開始になり、点が打たれる', () => {
    const expected_drawLine = {
      current: [
        {
          id: '123456789',
          latlon: [],
          layerId: undefined,
          properties: ['EDIT'],
          record: undefined,
          xy: [[0, 0]],
        },
      ],
    };
    const expected_undoLine = { current: [{ action: 'NEW', index: -1, latlon: [] }] };
    expect(result.current.isEditingObject).toStrictEqual({ current: false });
    act(() => {
      result.current.pressSvgPlotTool(pXY);
    });
    expect(result.current.isEditingObject).toStrictEqual({ current: true });
    expect(editingObjectIndex).toStrictEqual({ current: 0 });
    expect(drawLine).toStrictEqual(expected_drawLine);
    expect(undoLine).toStrictEqual(expected_undoLine);
  });
  test('そのままドラッグすると点が移動', () => {
    const expected_drawLine = {
      current: [
        {
          id: '123456789',
          latlon: [],
          layerId: undefined,
          properties: ['EDIT'],
          record: undefined,
          xy: [[1, 1]],
        },
      ],
    };

    act(() => {
      result.current.moveSvgPlotTool(pXY2);
    });
    expect(drawLine).toStrictEqual(expected_drawLine);
  });
  test('クリックをリリースした場所に更新される', () => {
    const expected_drawLine = {
      current: [
        {
          id: '123456789',
          latlon: [[134.90048661800486, 35.09976554487668]],
          layerId: undefined,
          properties: ['EDIT'],
          record: undefined,
          xy: [[1, 1]],
        },
      ],
    };

    act(() => {
      result.current.releaseSvgPlotTool(pXY2);
    });

    expect(drawLine).toStrictEqual(expected_drawLine);
  });
  test('PLOT_LINEツールで点を追加', () => {
    const expected_drawLine = {
      current: [
        {
          id: '123456789',
          latlon: [
            [134.90048661800486, 35.09976554487668],
            [134.90097323600975, 35.09953108907909],
          ],
          layerId: undefined,
          properties: ['EDIT'],
          record: undefined,
          xy: [
            [1, 1],
            [2, 2],
          ],
        },
      ],
    };

    const expected_undoLine = {
      current: [
        { action: 'NEW', index: -1, latlon: [] },
        { action: 'EDIT', index: 0, latlon: [[134.90048661800486, 35.09976554487668]] },
      ],
    };

    act(() => {
      result.current.pressSvgPlotTool(pXY3);
      result.current.releaseSvgPlotTool(pXY3);
    });
    expect(result.current.isEditingObject).toStrictEqual({ current: true });
    expect(editingObjectIndex).toStrictEqual({ current: 0 });
    expect(drawLine).toStrictEqual(expected_drawLine);
    expect(undoLine).toStrictEqual(expected_undoLine);
  });
  test('PLOT_LINEツールで始点をクリックで編集終了。propertiesは空になる。', () => {
    const expected_drawLine = {
      current: [
        {
          id: '123456789',
          latlon: [
            [134.90048661800486, 35.09976554487668],
            [134.90097323600975, 35.09953108907909],
          ],
          layerId: undefined,
          properties: [],
          record: undefined,
          xy: [
            [1, 1],
            [2, 2],
          ],
        },
      ],
    };

    const expected_undoLine = {
      current: [
        { action: 'NEW', index: -1, latlon: [] },
        { action: 'EDIT', index: 0, latlon: [[134.90048661800486, 35.09976554487668]] },
        {
          action: 'FINISH',
          index: 0,
          latlon: [
            [134.90048661800486, 35.09976554487668],
            [134.90097323600975, 35.09953108907909],
          ],
        },
      ],
    };

    act(() => {
      result.current.pressSvgPlotTool(pXY2);
      result.current.releaseSvgPlotTool(pXY2);
    });
    expect(result.current.isEditingObject).toStrictEqual({ current: false });
    expect(editingObjectIndex).toStrictEqual({ current: -1 });
    expect(drawLine).toStrictEqual(expected_drawLine);
    expect(undoLine).toStrictEqual(expected_undoLine);
  });
});
