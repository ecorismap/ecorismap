import { RenderResult, renderHook, act } from '@testing-library/react-hooks';
import { Position } from '@turf/turf';
import { useDrawObjects, UseDrawObjectsReturnType } from './useDrawObjects';

import { DrawLineType, DrawToolType, RegionType, UndoLineType } from '../types';

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
      useDrawObjects(
        drawLine,
        editingLineXY,
        undoLine,
        editingObjectIndex,
        currentDrawTool,
        isEditingObject,
        mapViewRef
      )
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
  const currentDrawTool: DrawToolType = 'FREEHAND_POLYGON';
  const isEditingObject: { current: boolean } = { current: false };
  const mapViewRef: any = {
    // animateToRegion: jest.fn(),
    // animateCamera: jest.fn(),
    // getMap: () => {
    //   return { getBounds: undefined };
    // },
  };
  const pXY = [0, 0];
  const pXY2 = [10, 10];
  const pXY3 = [100, 100];
  const pXY4 = [200, 200];
  const pXY5 = [300, 300];

  test('FREEHAND_POLYGON_LINEツールで新規ライン作成', () => {
    const expected_drawLine = {
      current: [
        {
          id: '123456789',
          latlon: [
            [134.9, 35.1],
            [134.94866180048663, 35.07655115035712],
          ],
          layerId: undefined,
          properties: ['EDIT'],
          record: undefined,
          xy: [
            [0, 0],
            [100, 100],
          ],
        },
      ],
    };
    const expected_undoLine = { current: [{ action: 'NEW', index: -1, latlon: [] }] };
    expect(result.current.isEditingObject).toStrictEqual({ current: false });
    act(() => {
      result.current.pressSvgFreehandTool(pXY);
      result.current.moveSvgFreehandTool(pXY2);
      result.current.moveSvgFreehandTool(pXY3);
      result.current.moveSvgFreehandTool(pXY4);
      result.current.moveSvgFreehandTool(pXY5);
      result.current.releaseSvgFreehandTool();
    });
    expect(result.current.isEditingObject).toStrictEqual({ current: true });
    expect(editingObjectIndex).toStrictEqual({ current: 0 });
    expect(drawLine).toStrictEqual(expected_drawLine);
    expect(undoLine).toStrictEqual(expected_undoLine);
  });

  test('離れた場所に点を打っても何もしない', () => {
    const pXYout = [5000, 5000];
    const expected_drawLine = {
      current: [
        {
          id: '123456789',
          latlon: [
            [134.9, 35.1],
            [134.94866180048663, 35.07655115035712],
          ],
          layerId: undefined,
          properties: ['EDIT'],
          record: undefined,
          xy: [
            [0, 0],
            [100, 100],
          ],
        },
      ],
    };

    act(() => {
      result.current.pressSvgFreehandTool(pXYout);
      result.current.releaseSvgFreehandTool();
    });
    expect(result.current.isEditingObject).toStrictEqual({ current: true });
    expect(editingObjectIndex).toStrictEqual({ current: 0 });
    expect(drawLine).toStrictEqual(expected_drawLine);
    // expect(undoLine).toStrictEqual(expected_undoLine);
  });
});
