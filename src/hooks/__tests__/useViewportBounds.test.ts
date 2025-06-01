import { renderHook } from '@testing-library/react-hooks';
import { useViewportBounds } from '../useViewportBounds';
import { RegionType } from '../../types';

describe('useViewportBounds', () => {
  it('should return null bounds when mapRegion is undefined', () => {
    const { result } = renderHook(() => useViewportBounds(undefined as unknown as RegionType));
    expect(result.current.bounds).toBeNull();
  });

  it('should return null bounds when mapRegion has no latitude', () => {
    const mapRegion = {
      longitude: 139.7,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    } as RegionType;

    const { result } = renderHook(() => useViewportBounds(mapRegion));
    expect(result.current.bounds).toBeNull();
  });

  it('should return null bounds when mapRegion has no longitude', () => {
    const mapRegion = {
      latitude: 35.6,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    } as RegionType;

    const { result } = renderHook(() => useViewportBounds(mapRegion));
    expect(result.current.bounds).toBeNull();
  });

  it('should calculate correct bounds for valid mapRegion', () => {
    const mapRegion: RegionType = {
      latitude: 35.6,
      longitude: 139.7,
      latitudeDelta: 0.2,
      longitudeDelta: 0.3,
      zoom: 10,
    };

    const { result } = renderHook(() => useViewportBounds(mapRegion));

    expect(result.current.bounds?.northEast.latitude).toBeCloseTo(35.7);
    expect(result.current.bounds?.northEast.longitude).toBeCloseTo(139.85);
    expect(result.current.bounds?.southWest.latitude).toBeCloseTo(35.5);
    expect(result.current.bounds?.southWest.longitude).toBeCloseTo(139.55);
  });

  it('should update bounds when mapRegion changes', () => {
    const initialRegion: RegionType = {
      latitude: 35.6,
      longitude: 139.7,
      latitudeDelta: 0.2,
      longitudeDelta: 0.3,
      zoom: 10,
    };

    const { result, rerender } = renderHook(({ mapRegion }) => useViewportBounds(mapRegion), {
      initialProps: { mapRegion: initialRegion },
    });

    expect(result.current.bounds?.northEast.latitude).toBeCloseTo(35.7);
    expect(result.current.bounds?.northEast.longitude).toBeCloseTo(139.85);
    expect(result.current.bounds?.southWest.latitude).toBeCloseTo(35.5);
    expect(result.current.bounds?.southWest.longitude).toBeCloseTo(139.55);

    const updatedRegion: RegionType = {
      latitude: 40.0,
      longitude: 140.0,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
      zoom: 12,
    };

    rerender({ mapRegion: updatedRegion });

    expect(result.current.bounds?.northEast.latitude).toBeCloseTo(40.05);
    expect(result.current.bounds?.northEast.longitude).toBeCloseTo(140.05);
    expect(result.current.bounds?.southWest.latitude).toBeCloseTo(39.95);
    expect(result.current.bounds?.southWest.longitude).toBeCloseTo(139.95);
  });

  it('should handle extreme coordinates correctly', () => {
    const mapRegion: RegionType = {
      latitude: -90,
      longitude: 180,
      latitudeDelta: 10,
      longitudeDelta: 20,
      zoom: 5,
    };

    const { result } = renderHook(() => useViewportBounds(mapRegion));

    expect(result.current.bounds).toEqual({
      northEast: {
        latitude: -85,
        longitude: 190,
      },
      southWest: {
        latitude: -95,
        longitude: 170,
      },
    });
  });
});
