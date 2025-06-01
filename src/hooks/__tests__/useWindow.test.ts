import React, { ReactNode } from 'react';
import { renderHook } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import settingsReducer, { settingsInitialState } from '../../modules/settings';
import { useWindow } from '../useWindow';

describe('useWindow', () => {
  const createTestStore = () => {
    return configureStore({
      reducer: {
        settings: settingsReducer,
      },
      preloadedState: {
        settings: {
          ...settingsInitialState,
          mapRegion: {
            latitude: 35.6,
            longitude: 139.7,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
            zoom: 10,
          },
        },
      },
    });
  };

  const wrapper = ({ children }: { children: ReactNode }) => {
    const store = createTestStore();
    // eslint-disable-next-line react/no-children-prop
    return React.createElement(Provider, { store, children });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return mapRegion from state', () => {
    const { result } = renderHook(() => useWindow(), { wrapper });

    expect(result.current.mapRegion).toEqual({
      latitude: 35.6,
      longitude: 139.7,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
      zoom: 10,
    });
  });

  it('should return window dimensions', () => {
    const { result } = renderHook(() => useWindow(), { wrapper });

    // Verify that dimensions are returned as numbers
    expect(typeof result.current.windowWidth).toBe('number');
    expect(typeof result.current.windowHeight).toBe('number');
    expect(result.current.windowWidth).toBeGreaterThan(0);
    expect(result.current.windowHeight).toBeGreaterThan(0);
    expect(typeof result.current.devicePixelRatio).toBe('number');
    expect(result.current.devicePixelRatio).toBeGreaterThan(0);
  });

  it('should return mapSize object with correct dimensions', () => {
    const { result } = renderHook(() => useWindow(), { wrapper });

    expect(result.current.mapSize).toBeDefined();
    expect(result.current.mapSize.width).toBe(result.current.windowWidth);
    expect(result.current.mapSize.height).toBe(result.current.windowHeight);
  });

  it('should determine landscape orientation correctly', () => {
    const { result } = renderHook(() => useWindow(), { wrapper });

    // isLandscape should match the width > height comparison
    const expectedLandscape = result.current.windowWidth > result.current.windowHeight;
    expect(result.current.isLandscape).toBe(expectedLandscape);
  });

  it('should return all required properties', () => {
    const { result } = renderHook(() => useWindow(), { wrapper });

    const requiredProperties = [
      'mapRegion',
      'windowHeight',
      'windowWidth',
      'isLandscape',
      'mapSize',
      'devicePixelRatio',
    ];

    requiredProperties.forEach((prop) => {
      expect(result.current).toHaveProperty(prop);
    });

    // Verify the types of returned values
    expect(result.current.mapRegion).toEqual({
      latitude: 35.6,
      longitude: 139.7,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
      zoom: 10,
    });
    expect(typeof result.current.windowWidth).toBe('number');
    expect(typeof result.current.windowHeight).toBe('number');
    expect(typeof result.current.isLandscape).toBe('boolean');
    expect(typeof result.current.devicePixelRatio).toBe('number');
    expect(result.current.mapSize).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
  });

  it('should memoize mapSize based on window dimensions', () => {
    const { result, rerender } = renderHook(() => useWindow(), { wrapper });

    const initialMapSize = result.current.mapSize;

    // Rerender without changing dimensions
    rerender();

    // mapSize object should be the same reference
    expect(result.current.mapSize).toBe(initialMapSize);
  });
});
