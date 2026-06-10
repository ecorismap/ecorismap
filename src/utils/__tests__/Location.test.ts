import {
  LocationObjectInput,
  isLocationObject,
  toLocationType,
  getLineLength,
  haversineKm,
  checkLocations,
  isLowAccuracy,
  splitTrackByAccuracy,
  addLocationsToChunks,
  checkAndStoreLocations,
  getDisplayBuffer,
  getCurrentChunkInfo,
  getTrackChunk,
  clearAllChunks,
  resetTrackLogCache,
  flushTrackLog,
  CHUNK_SIZE,
} from '../Location';
import { trackLogMMKV } from '../mmkvStorage';
import { LocationType } from '../../types';

// モジュールのモック
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getString: jest.fn(() => null),
    delete: jest.fn(),
    clearAll: jest.fn(),
    getAllKeys: jest.fn(() => []),
  })),
}));

// mmkvStorageのモック
jest.mock('../mmkvStorage', () => {
  const mockStorage: any = {};
  return {
    trackLogMMKV: {
      setTrackLog: jest.fn((data) => {
        mockStorage.tracklog = data;
      }),
      getTrackLog: jest.fn(() => mockStorage.tracklog || null),
      clearTrackLog: jest.fn(() => {
        delete mockStorage.tracklog;
      }),
      getSize: jest.fn(() => {
        return mockStorage.tracklog ? JSON.stringify(mockStorage.tracklog).length : 0;
      }),
      setCurrentLocation: jest.fn((location) => {
        mockStorage.currentLocation = location;
      }),
      getCurrentLocation: jest.fn(() => mockStorage.currentLocation || null),
      setChunk: jest.fn((key, data) => {
        mockStorage[key] = data;
      }),
      getChunk: jest.fn((key) => mockStorage[key] || null),
      removeChunk: jest.fn((key) => {
        delete mockStorage[key];
      }),
      setMetadata: jest.fn((metadata) => {
        mockStorage.metadata = metadata;
      }),
      getMetadata: jest.fn(() => mockStorage.metadata || null),
      setTrackingState: jest.fn((state) => {
        mockStorage.trackingState = state;
      }),
      getTrackingState: jest.fn(() => mockStorage.trackingState ?? 'on'),
    },
    storage: {
      set: jest.fn(),
      getString: jest.fn(),
      delete: jest.fn(),
      clearAll: jest.fn(),
      getAllKeys: jest.fn(() => []),
    },
    reduxMMKVStorage: {
      setItem: jest.fn(() => Promise.resolve(true)),
      getItem: jest.fn(() => Promise.resolve(null)),
      removeItem: jest.fn(() => Promise.resolve()),
    },
  };
});

// turfのモック
jest.mock('@turf/turf', () => ({
  lineString: jest.fn((coords) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
  })),
  length: jest.fn(() => 0.1), // 100mを返す
}));

describe('isLocationObject', () => {
  describe('return boolean', () => {
    it('return boolean', () => {
      let test = isLocationObject({ locations: [] });
      expect(test).toBe(true);
      test = isLocationObject({ location: [] });
      expect(test).toBe(false);
      test = isLocationObject(undefined);
      expect(test).toBe(false);
    });
  });
});

describe('toLocationType', () => {
  it('return LoactionType from LocationObject', () => {
    const locationObject: LocationObjectInput = {
      coords: {
        latitude: 35.6812,
        longitude: 139.7671,
        altitude: 10,
        accuracy: 5,
        altitudeAccuracy: 3,
        heading: 45,
        speed: 10,
      },
      timestamp: 1609459200000,
    };

    const result = toLocationType(locationObject);

    expect(result).toEqual({
      latitude: 35.6812,
      longitude: 139.7671,
      altitude: 10,
      accuracy: 5,
      altitudeAccuracy: 3,
      heading: 45,
      speed: 10,
      timestamp: 1609459200000,
    });
  });
});

describe('getLineLength', () => {
  it('return length(km) from locations', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: 1000000 },
      { latitude: 35.001, longitude: 135.001, timestamp: 1001000 },
    ];

    const result = getLineLength(locations);
    expect(result).toBe(0.1); // モックが返す値
  });
});

describe('haversineKm', () => {
  it('同一点は距離0', () => {
    const p: LocationType = { latitude: 35, longitude: 135 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it('既知の2点間距離（km）を返す', () => {
    // 東京駅 - 大阪駅: 約403km
    const tokyo: LocationType = { latitude: 35.681236, longitude: 139.767125 };
    const osaka: LocationType = { latitude: 34.702485, longitude: 135.495951 };
    const result = haversineKm(tokyo, osaka);
    expect(result).toBeGreaterThan(395);
    expect(result).toBeLessThan(410);
  });

  it('近距離（緯度0.001度 ≒ 111m）を正しく計算する', () => {
    const a: LocationType = { latitude: 35, longitude: 135 };
    const b: LocationType = { latitude: 35.001, longitude: 135 };
    const result = haversineKm(a, b);
    expect(result).toBeCloseTo(0.111, 2);
  });
});

describe('checkLocations', () => {
  const baseTime = Date.now();

  it('filters locations by timestamp', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime - 1000, // 古いタイムスタンプ
      },
      {
        coords: {
          latitude: 35.01,
          longitude: 135.01,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 1000, // 新しいタイムスタンプ
      },
    ];

    const result = checkLocations(baseTime, locations);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe(baseTime + 1000);
  });

  it('filters out extremely low accuracy (>100m) when starting', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 150, // 精度が極端に悪い（>100m）
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 1000,
      },
      {
        coords: {
          latitude: 35.01,
          longitude: 135.01,
          accuracy: 50, // 精度が悪いが記録される（30-100m）
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 2000,
      },
      {
        coords: {
          latitude: 35.02,
          longitude: 135.02,
          accuracy: 10, // 精度が良い
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 3000,
      },
    ];

    const result = checkLocations(0, locations); // lastTimeStamp = 0（開始時）
    expect(result).toHaveLength(2); // 50mと10mの2つが記録される
    expect(result[0].accuracy).toBe(50);
    expect(result[1].accuracy).toBe(10);
  });

  it('rejects all data when timestamp reversal detected', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 2000,
      },
      {
        coords: {
          latitude: 35.01,
          longitude: 135.01,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 1000, // タイムスタンプが逆転
      },
    ];

    const result = checkLocations(baseTime, locations);
    expect(result).toHaveLength(0);
  });

  it('accepts all valid locations when no issues', () => {
    const locations: LocationObjectInput[] = [
      {
        coords: {
          latitude: 35,
          longitude: 135,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 1000,
      },
      {
        coords: {
          latitude: 35.01,
          longitude: 135.01,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 2000,
      },
      {
        coords: {
          latitude: 35.02,
          longitude: 135.02,
          accuracy: 10,
          altitude: 0,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: baseTime + 3000,
      },
    ];

    const filtered = checkLocations(baseTime, locations);
    expect(filtered).toHaveLength(3);
    expect(filtered[0].timestamp).toBe(baseTime + 1000);
    expect(filtered[1].timestamp).toBe(baseTime + 2000);
    expect(filtered[2].timestamp).toBe(baseTime + 3000);
  });
});

describe('isLowAccuracy', () => {
  it('returns true for accuracy > 30m', () => {
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: 31 })).toBe(true);
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: 50 })).toBe(true);
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: 100 })).toBe(true);
  });

  it('returns false for accuracy <= 30m', () => {
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: 30 })).toBe(false);
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: 10 })).toBe(false);
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: 1 })).toBe(false);
  });

  it('returns false for null/undefined accuracy', () => {
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: null })).toBe(false);
    expect(isLowAccuracy({ latitude: 35, longitude: 135, accuracy: undefined })).toBe(false);
    expect(isLowAccuracy({ latitude: 35, longitude: 135 })).toBe(false);
  });
});

describe('splitTrackByAccuracy', () => {
  it('returns empty array for empty input', () => {
    expect(splitTrackByAccuracy([])).toEqual([]);
  });

  it('returns single segment for all high accuracy', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, accuracy: 10 },
      { latitude: 35.01, longitude: 135.01, accuracy: 20 },
      { latitude: 35.02, longitude: 135.02, accuracy: 30 },
    ];
    const result = splitTrackByAccuracy(locations);
    expect(result).toHaveLength(1);
    expect(result[0].isLowAccuracy).toBe(false);
    expect(result[0].coordinates).toHaveLength(3);
  });

  it('returns single segment for all low accuracy', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, accuracy: 50 },
      { latitude: 35.01, longitude: 135.01, accuracy: 70 },
      { latitude: 35.02, longitude: 135.02, accuracy: 100 },
    ];
    const result = splitTrackByAccuracy(locations);
    expect(result).toHaveLength(1);
    expect(result[0].isLowAccuracy).toBe(true);
    expect(result[0].coordinates).toHaveLength(3);
  });

  it('splits track by accuracy with overlapping points for continuity', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, accuracy: 10 }, // high
      { latitude: 35.01, longitude: 135.01, accuracy: 20 }, // high
      { latitude: 35.02, longitude: 135.02, accuracy: 50 }, // low
      { latitude: 35.03, longitude: 135.03, accuracy: 70 }, // low
      { latitude: 35.04, longitude: 135.04, accuracy: 15 }, // high
    ];
    const result = splitTrackByAccuracy(locations);
    expect(result).toHaveLength(3);

    // First segment: high accuracy
    expect(result[0].isLowAccuracy).toBe(false);
    expect(result[0].coordinates).toHaveLength(2);
    expect(result[0].coordinates[0].accuracy).toBe(10);
    expect(result[0].coordinates[1].accuracy).toBe(20);

    // Second segment: low accuracy (includes overlapping point from previous segment)
    expect(result[1].isLowAccuracy).toBe(true);
    expect(result[1].coordinates).toHaveLength(3);
    expect(result[1].coordinates[0].accuracy).toBe(20); // overlapping point
    expect(result[1].coordinates[1].accuracy).toBe(50);
    expect(result[1].coordinates[2].accuracy).toBe(70);

    // Third segment: high accuracy (includes overlapping point from previous segment)
    expect(result[2].isLowAccuracy).toBe(false);
    expect(result[2].coordinates).toHaveLength(2);
    expect(result[2].coordinates[0].accuracy).toBe(70); // overlapping point
    expect(result[2].coordinates[1].accuracy).toBe(15);
  });

  it('handles null accuracy as high accuracy', () => {
    const locations: LocationType[] = [
      { latitude: 35, longitude: 135, accuracy: null },
      { latitude: 35.01, longitude: 135.01 }, // undefined
      { latitude: 35.02, longitude: 135.02, accuracy: 10 },
    ];
    const result = splitTrackByAccuracy(locations);
    expect(result).toHaveLength(1);
    expect(result[0].isLowAccuracy).toBe(false);
    expect(result[0].coordinates).toHaveLength(3);
  });
});

describe('addLocationsToChunks (cache, incremental distance, rollover)', () => {
  const baseTime = 1_600_000_000_000;
  // 35°付近で経度を一定刻みに増やした点列を生成
  const makePoints = (n: number, startIndex = 0): LocationType[] =>
    Array.from({ length: n }, (_, k) => {
      const i = startIndex + k;
      return { latitude: 35, longitude: 135 + i * 0.0001, timestamp: baseTime + i * 1000, accuracy: 10 };
    });

  beforeEach(() => {
    clearAllChunks(); // メタデータ・チャンク・メモリ内キャッシュをリセット
  });

  it('returns updated metadata and current chunk', () => {
    const result = addLocationsToChunks(makePoints(3));
    expect(result.metadata.totalPoints).toBe(3);
    expect(result.metadata.lastChunkIndex).toBe(0);
    expect(result.chunk).toHaveLength(3);
  });

  it('accumulates distance across chunk boundaries without resetting (Cause C regression)', () => {
    const distances: number[] = [];
    const total = CHUNK_SIZE * 2 + 100; // CHUNK_SIZE(500)を2回跨ぐ
    for (let i = 0; i < total; i++) {
      const result = addLocationsToChunks(makePoints(1, i));
      distances.push(result.metadata.currentDistance);
    }

    // 各点で正の距離が加算され単調増加する
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }

    // チャンク境界(500, 1000)でリセットされない
    expect(distances[CHUNK_SIZE]).toBeGreaterThan(distances[CHUNK_SIZE - 1]);
    expect(distances[CHUNK_SIZE * 2]).toBeGreaterThan(distances[CHUNK_SIZE * 2 - 1]);

    // 累積総距離は最後のチャンクのみの距離よりはるかに大きい（旧バグでは最後のチャンク分しか出なかった）
    const lastChunkSpan = distances[total - 1] - distances[CHUNK_SIZE * 2 - 1];
    expect(distances[total - 1]).toBeGreaterThan(lastChunkSpan * 5);
  });

  it('keeps the seam point at the head of the new chunk after rollover', () => {
    const points = makePoints(CHUNK_SIZE + 1);
    addLocationsToChunks(points);

    // チャンク0は500点が保存される
    expect(getTrackChunk(0)).toHaveLength(CHUNK_SIZE);
    // 現在チャンクのインデックスは1
    expect(getCurrentChunkInfo().currentChunkIndex).toBe(1);
    // 表示バッファ先頭はつなぎ目（500番目=index CHUNK_SIZE-1 の点）
    const buffer = getDisplayBuffer();
    expect(buffer[0].timestamp).toBe(points[CHUNK_SIZE - 1].timestamp);
    // 末尾は501番目（index CHUNK_SIZE）の点
    expect(buffer[buffer.length - 1].timestamp).toBe(points[CHUNK_SIZE].timestamp);
  });

  it('throttles writes of the unfinished chunk and flushTrackLog forces a write', () => {
    (trackLogMMKV.setChunk as jest.Mock).mockClear();
    const n = 50; // CHUNK_SIZE未満（rolloverなし）
    for (let i = 0; i < n; i++) {
      addLocationsToChunks(makePoints(1, i));
    }
    // 未完成チャンク(track_chunk_0)への書き込みは点数より大幅に少ない（スロットル）
    const chunk0Writes = (trackLogMMKV.setChunk as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0] === 'track_chunk_0'
    ).length;
    expect(chunk0Writes).toBeLessThan(n);
    expect(chunk0Writes).toBeLessThanOrEqual(10);

    // flushTrackLogで強制書き込み
    (trackLogMMKV.setChunk as jest.Mock).mockClear();
    flushTrackLog();
    expect((trackLogMMKV.setChunk as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});

describe('checkAndStoreLocations (tracking state + return value)', () => {
  const baseTime = 1_600_000_000_000;
  const makeInput = (n: number, startIndex = 0): LocationObjectInput[] =>
    Array.from({ length: n }, (_, k) => {
      const i = startIndex + k;
      return { coords: { latitude: 35, longitude: 135 + i * 0.0001, accuracy: 10 }, timestamp: baseTime + i * 1000 };
    });

  beforeEach(() => {
    clearAllChunks();
    trackLogMMKV.setTrackingState('on');
  });

  it('returns null when tracking is off', () => {
    trackLogMMKV.setTrackingState('off');
    expect(checkAndStoreLocations(makeInput(1))).toBeNull();
  });

  it('stores points and returns metadata/chunk when tracking is on', () => {
    const result = checkAndStoreLocations(makeInput(3));
    expect(result).not.toBeNull();
    expect(result!.metadata.totalPoints).toBe(3);
    expect(result!.chunk).toHaveLength(3);
  });
});

describe('resetTrackLogCache', () => {
  const baseTime = 1_600_000_000_000;
  const makePoints = (n: number, startIndex = 0): LocationType[] =>
    Array.from({ length: n }, (_, k) => {
      const i = startIndex + k;
      return { latitude: 35, longitude: 135 + i * 0.0001, timestamp: baseTime + i * 1000, accuracy: 10 };
    });

  beforeEach(() => {
    clearAllChunks();
  });

  it('re-reads from MMKV after reset (headless writes MMKV in a separate context)', () => {
    addLocationsToChunks(makePoints(3));
    flushTrackLog(); // MMKVへ確定
    expect(getCurrentChunkInfo().currentChunkSize).toBe(3);

    // 別コンテキスト相当: キャッシュを破棄 → 次回アクセスはMMKVから再構築
    resetTrackLogCache();
    expect(getDisplayBuffer()).toHaveLength(3);
  });
});
