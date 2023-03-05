import { RenderResult, renderHook, act } from '@testing-library/react-hooks';
import { useMapView, UseMapViewReturnType } from '../useMapView';

import { RegionType } from '../../types';

const mapRegion: RegionType = {
  latitude: 35,
  longitude: 135,
  latitudeDelta: 0.2,
  longitudeDelta: 0.2,
  zoom: 11,
};

const mapViewRef: any = {
  animateToRegion: jest.fn(),
  animateCamera: jest.fn(),
  // getMap: () => {
  //   return { getBounds: undefined };
  // },
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

describe('useMapView', () => {
  beforeEach(() => {
    mockSelector = jest.fn().mockReturnValue(mapRegion);
    mockWindowDimensions = jest.fn().mockReturnValue({ width: 411, height: 852 });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  let result: RenderResult<UseMapViewReturnType>;

  test('zoomInを呼ぶと、deltaが1/2倍でanimateToRegionが呼ばれる', () => {
    result = renderHook(() => useMapView(mapViewRef)).result;

    expect(result.current.zoom).toBe(11);
    act(() => {
      result.current.zoomIn();
    });
    expect(mapViewRef.animateToRegion).toHaveBeenCalledWith(
      {
        latitude: 35,
        latitudeDelta: 0.1,
        longitude: 135,
        longitudeDelta: 0.1,
      },
      200
    );
  });

  test('zoomOutを呼ぶと、deltaが2倍でanimateToRegionが呼ばれる', () => {
    result = renderHook(() => useMapView(mapViewRef)).result;

    expect(result.current.zoom).toBe(11);
    act(() => {
      result.current.zoomOut();
    });
    expect(mapViewRef.animateToRegion).toHaveBeenCalledWith(
      {
        latitude: 35,
        latitudeDelta: 0.4,
        longitude: 135,
        longitudeDelta: 0.4,
      },
      200
    );
  });
});
