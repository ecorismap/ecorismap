import * as Location from 'expo-location';

export interface MockGpsConfig {
  enabled: boolean;
  scenario: 'circle' | 'line' | 'longTrack' | 'random' | 'static';
  speed: number; // m/s
  updateInterval: number; // ms
  center: {
    latitude: number;
    longitude: number;
  };
  radius?: number; // meters (for circle scenario)
  endPoint?: {
    latitude: number;
    longitude: number;
  }; // for line scenario
  pointCount?: number; // for longTrack scenario
}

export class MockGpsGenerator {
  private config: MockGpsConfig;
  private currentIndex: number = -1;
  private timeElapsed: number = 0;
  private points: Location.LocationObjectCoords[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private locationCallback: ((location: Location.LocationObject) => void) | null = null;
  private lastProgressLog: number = -1;
  private startTimestamp: number = 0;

  constructor(config: MockGpsConfig) {
    this.config = config;
    this.generatePoints();
  }

  private generatePoints() {
    switch (this.config.scenario) {
      case 'circle':
        this.generateCirclePoints();
        break;
      case 'line':
        this.generateLinePoints();
        break;
      case 'longTrack':
        this.generateLongTrackPoints();
        break;
      case 'random':
        this.generateRandomPoints();
        break;
      case 'static':
        this.generateStaticPoint();
        break;
    }
  }

  private generateCirclePoints() {
    const numPoints = 100;
    const radius = this.config.radius || 100;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const lat = this.config.center.latitude + (radius / 111320) * Math.cos(angle);
      const lon =
        this.config.center.longitude +
        (radius / (111320 * Math.cos((this.config.center.latitude * Math.PI) / 180))) * Math.sin(angle);

      this.points.push({
        latitude: lat,
        longitude: lon,
        altitude: 10 + Math.random() * 5,
        accuracy: 5 + Math.random() * 10,
        altitudeAccuracy: 3 + Math.random() * 2,
        heading: ((angle * 180) / Math.PI + 90) % 360,
        speed: this.config.speed + (Math.random() - 0.5) * 2,
      });
    }
  }

  private generateLinePoints() {
    // pointCountが設定されていればその数、なければ100ポイント生成
    const numPoints = this.config.pointCount || 100;
    const start = this.config.center;

    // 基準となる終点（100ポイントでの距離）
    const baseEnd = this.config.endPoint || {
      latitude: start.latitude + 0.01,
      longitude: start.longitude + 0.01,
    };

    // ポイント数に応じて終点を延長（100ポイントが基準）
    const distanceFactor = numPoints / 100;
    const end = {
      latitude: start.latitude + (baseEnd.latitude - start.latitude) * distanceFactor,
      longitude: start.longitude + (baseEnd.longitude - start.longitude) * distanceFactor,
    };

    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const lat = start.latitude + t * (end.latitude - start.latitude);
      const lon = start.longitude + t * (end.longitude - start.longitude);

      // 進行方向を計算
      const heading = (Math.atan2(end.longitude - start.longitude, end.latitude - start.latitude) * 180) / Math.PI;

      this.points.push({
        latitude: lat + (Math.random() - 0.5) * 0.00001,
        longitude: lon + (Math.random() - 0.5) * 0.00001,
        altitude: 10 + Math.random() * 5,
        accuracy: 5 + Math.random() * 10,
        altitudeAccuracy: 3 + Math.random() * 2,
        heading: (heading + 360) % 360,
        speed: this.config.speed + (Math.random() - 0.5) * 2,
      });
    }
  }

  private generateLongTrackPoints() {
    // 長い軌跡のテスト用: 大量のポイントを生成
    const numPoints = this.config.pointCount || 10000;
    const start = this.config.center;

    let currentLat = start.latitude;
    let currentLon = start.longitude;
    let direction = 0;

    for (let i = 0; i < numPoints; i++) {
      // ランダムに方向を変更（時々）
      if (i % 50 === 0) {
        direction = Math.random() * 360;
      }

      // 少しずつ移動
      const distance = 0.00005; // 約5m
      currentLat += distance * Math.cos((direction * Math.PI) / 180);
      currentLon += (distance * Math.sin((direction * Math.PI) / 180)) / Math.cos((currentLat * Math.PI) / 180);

      // ジグザグや曲線を追加
      const noise = Math.sin(i * 0.1) * 0.00002;

      this.points.push({
        latitude: currentLat + noise,
        longitude: currentLon + noise,
        altitude: 10 + Math.sin(i * 0.05) * 5,
        accuracy: 5 + Math.random() * 10,
        altitudeAccuracy: 3 + Math.random() * 2,
        heading: direction,
        speed: this.config.speed + Math.sin(i * 0.02) * 2,
      });
    }

  }

  private generateRandomPoints() {
    const numPoints = 200;
    const range = 0.01; // 約1km範囲

    for (let i = 0; i < numPoints; i++) {
      this.points.push({
        latitude: this.config.center.latitude + (Math.random() - 0.5) * range,
        longitude: this.config.center.longitude + (Math.random() - 0.5) * range,
        altitude: 10 + Math.random() * 50,
        accuracy: 5 + Math.random() * 20,
        altitudeAccuracy: 3 + Math.random() * 5,
        heading: Math.random() * 360,
        speed: Math.random() * this.config.speed * 2,
      });
    }
  }

  private generateStaticPoint() {
    // 静止点（精度が変動）
    for (let i = 0; i < 100; i++) {
      this.points.push({
        latitude: this.config.center.latitude + (Math.random() - 0.5) * 0.00001,
        longitude: this.config.center.longitude + (Math.random() - 0.5) * 0.00001,
        altitude: 10,
        accuracy: 5 + Math.sin(i * 0.1) * 3,
        altitudeAccuracy: 3,
        heading: 0,
        speed: 0,
      });
    }
  }

  start(callback: (location: Location.LocationObject) => void) {
    if (!this.config.enabled) {
      return;
    }

    // 既に動作中の場合はコールバックだけ更新
    if (this.intervalId) {
      this.locationCallback = callback;
      return;
    }

    this.locationCallback = callback;
    // 初回起動時のみインデックスをリセット
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
      this.timeElapsed = 0;
      this.lastProgressLog = -1;
      this.startTimestamp = Date.now();
    }

    console.log(`[MockGPS] Started: ${this.config.scenario} scenario`);

    this.intervalId = setInterval(() => {
      // 1%ごとに進捗をログ出力
      const progress = this.getProgress();
      const currentPercent = Math.floor(progress.percentage);
      if (currentPercent > this.lastProgressLog && currentPercent % 1 === 0) {
        console.log(`[MockGPS Progress] ${currentPercent}% (${progress.current}/${progress.total})`);
        this.lastProgressLog = currentPercent;
      }

      // ポイント数に達したかチェック（すべてのシナリオで有効）
      if (this.config.pointCount && this.currentIndex >= this.config.pointCount) {
        console.log(`[MockGPS] Completed: ${this.config.pointCount} points`);
        this.stop();
        return;
      }

      // 配列の終端に達したかチェック
      if (this.currentIndex >= this.points.length) {
        // 直線とlongTrackはループしない
        if (this.config.scenario === 'line' || this.config.scenario === 'longTrack') {
          console.log(`[MockGPS] Completed: ${this.currentIndex} points`);
          this.stop();
          return;
        }
        // その他のシナリオはループする
        // この場合はモジュロ演算でインデックスを循環させる
      }

      // 現在のインデックスを保持（ループ処理用）
      const actualIndex =
        this.config.scenario === 'circle' || this.config.scenario === 'random' || this.config.scenario === 'static'
          ? this.currentIndex % this.points.length
          : this.currentIndex;

      const point = this.points[actualIndex];
      // タイムスタンプを1秒ごとに進める（開始時刻 + 経過インデックス * 1000ms）
      const mockLocation: Location.LocationObject = {
        coords: point,
        timestamp: this.startTimestamp + (this.currentIndex * 1000),
        mocked: true,
      };

      if (this.locationCallback) {
        this.locationCallback(mockLocation);
      }

      this.currentIndex++; // これは累積カウント（リセットしない）
      this.timeElapsed += this.config.updateInterval;
    }, this.config.updateInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[MockGPS] Stopped');
    }
  }

  getCurrentLocation(): Location.LocationObject | null {
    // まだ開始していない場合は最初の位置を返す
    const index = this.currentIndex === -1 ? 0 : this.currentIndex;
    if (index < this.points.length) {
      const point = this.points[index];
      // 開始時刻が設定されていない場合は現在時刻を使用
      const timestamp = this.startTimestamp > 0 
        ? this.startTimestamp + (index * 1000)
        : Date.now();
      return {
        coords: point,
        timestamp: timestamp,
        mocked: true,
      };
    }
    return null;
  }

  getProgress(): { current: number; total: number; percentage: number } {
    const index = this.currentIndex === -1 ? 0 : this.currentIndex;
    // totalはpointCountが設定されている場合はそれを使用、なければpoints.length
    const total = this.config.pointCount || this.points.length;
    return {
      current: index,
      total: total,
      percentage: (index / total) * 100,
    };
  }

  // configへの読み取り専用アクセサ
  getConfig(): MockGpsConfig {
    return this.config;
  }

  // 動作中かどうかを確認
  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

// デフォルト設定
export const DEFAULT_MOCK_GPS_CONFIG: MockGpsConfig = {
  enabled: false,
  scenario: 'circle',
  speed: 5, // 5 m/s (18 km/h)
  updateInterval: 1000, // 1秒ごと
  center: {
    latitude: 35.6812, // 東京駅
    longitude: 139.7671,
  },
  radius: 500, // 500m
};

// 長い軌跡テスト用の設定
export const LONG_TRACK_TEST_CONFIG: MockGpsConfig = {
  enabled: true,
  scenario: 'longTrack',
  speed: 10, // 10 m/s (36 km/h)
  updateInterval: 1000, // 1秒ごと（Androidエミュレーター互換）
  center: {
    latitude: 35.6812,
    longitude: 139.7671,
  },
  pointCount: 50000, // 50000ポイント（約14時間の軌跡）
};
