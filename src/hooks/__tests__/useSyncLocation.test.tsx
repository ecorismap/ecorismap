import React from 'react';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useSyncLocation, POSITION_UPLOAD_INTERVAL_MS } from '../useSyncLocation';
import * as projectStore from '../../lib/firebase/firestore';

jest.mock('../../lib/firebase/firestore', () => ({
  __esModule: true,
  uploadCurrentPosition: jest.fn(async () => ({ isOK: true, message: '' })),
  decryptProjectData: jest.fn(),
  toDate: jest.fn(),
}));
jest.mock('../../lib/firebase/firebase', () => ({
  __esModule: true,
  firestore: {},
  collection: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
}));
jest.mock('../../components/molecules/AlertAsync', () => ({
  AlertAsync: jest.fn(async () => undefined),
}));
jest.mock('../../i18n/config', () => ({ t: jest.fn((key) => key) }));

const mockUploadCurrentPosition = projectStore.uploadCurrentPosition as jest.Mock;

const location = { latitude: 35.0, longitude: 135.0 };

describe('uploadLocation', () => {
  const initialState = {
    user: { uid: 'test-user', email: 'test@example.com', displayName: 'テスト' },
    settings: { isSynced: true },
  };
  const store = configureStore({
    reducer: {
      user: (state = initialState.user) => state,
      settings: (state = initialState.settings) => state,
    } as any,
    preloadedState: initialState,
  });

  const renderWithProvider = () =>
    renderHook(() => useSyncLocation('project-1'), {
      wrapper: (props: any) => <Provider store={store}>{props.children}</Provider>,
    });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    mockUploadCurrentPosition.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('初回は即アップロードされる', async () => {
    const { result } = renderWithProvider();
    await act(async () => {
      await result.current.uploadLocation(location);
    });
    expect(mockUploadCurrentPosition).toHaveBeenCalledTimes(1);
  });

  test('60秒未満の連続呼び出しはアップロードされない', async () => {
    const { result } = renderWithProvider();
    await act(async () => {
      await result.current.uploadLocation(location);
      jest.advanceTimersByTime(POSITION_UPLOAD_INTERVAL_MS - 1000);
      await result.current.uploadLocation(location);
      await result.current.uploadLocation(location);
    });
    expect(mockUploadCurrentPosition).toHaveBeenCalledTimes(1);
  });

  test('60秒経過後は再アップロードされる', async () => {
    const { result } = renderWithProvider();
    await act(async () => {
      await result.current.uploadLocation(location);
      jest.advanceTimersByTime(POSITION_UPLOAD_INTERVAL_MS);
      await result.current.uploadLocation(location);
    });
    expect(mockUploadCurrentPosition).toHaveBeenCalledTimes(2);
  });
});
