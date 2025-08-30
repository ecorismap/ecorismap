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
  private currentIndex: number = 0;
  private timeElapsed: number = 0;
  private points: Location.LocationObjectCoords[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private locationCallback: ((location: Location.LocationObject) => void) | null = null;

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
      const lon = this.config.center.longitude + (radius / (111320 * Math.cos(this.config.center.latitude * Math.PI / 180))) * Math.sin(angle);
      
      this.points.push({
        latitude: lat,
        longitude: lon,
        altitude: 10 + Math.random() * 5,
        accuracy: 5 + Math.random() * 10,
        altitudeAccuracy: 3 + Math.random() * 2,
        heading: (angle * 180 / Math.PI + 90) % 360,
        speed: this.config.speed + (Math.random() - 0.5) * 2,
      });
    }
  }

  private generateLinePoints() {
    const numPoints = 100;
    const start = this.config.center;
    const end = this.config.endPoint || {
      latitude: start.latitude + 0.01,
      longitude: start.longitude + 0.01,
    };
    
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const lat = start.latitude + t * (end.latitude - start.latitude);
      const lon = start.longitude + t * (end.longitude - start.longitude);
      
      // 進行方向を計算
      const heading = Math.atan2(
        end.longitude - start.longitude,
        end.latitude - start.latitude
      ) * 180 / Math.PI;
      
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
      currentLat += distance * Math.cos(direction * Math.PI / 180);
      currentLon += distance * Math.sin(direction * Math.PI / 180) / Math.cos(currentLat * Math.PI / 180);
      
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
    
    console.log(`Generated ${numPoints} points for long track testing`);
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
      console.log('Mock GPS is disabled');
      return;
    }

    this.locationCallback = callback;
    this.currentIndex = 0;
    this.timeElapsed = 0;

    console.log(`Starting mock GPS: ${this.config.scenario} scenario with ${this.points.length} points`);

    this.intervalId = setInterval(() => {
      if (this.currentIndex >= this.points.length) {
        // ループする
        this.currentIndex = 0;
      }

      const point = this.points[this.currentIndex];
      const mockLocation: Location.LocationObject = {
        coords: point,
        timestamp: Date.now(),
        mocked: true,
      };

      if (this.locationCallback) {
        this.locationCallback(mockLocation);
      }

      this.currentIndex++;
      this.timeElapsed += this.config.updateInterval;
    }, this.config.updateInterval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Mock GPS stopped');
    }
  }

  getCurrentLocation(): Location.LocationObject | null {
    if (this.currentIndex < this.points.length) {
      const point = this.points[this.currentIndex];
      return {
        coords: point,
        timestamp: Date.now(),
        mocked: true,
      };
    }
    return null;
  }

  getProgress(): { current: number; total: number; percentage: number } {
    return {
      current: this.currentIndex,
      total: this.points.length,
      percentage: (this.currentIndex / this.points.length) * 100,
    };
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
  updateInterval: 500, // 0.5秒ごと
  center: {
    latitude: 35.6812,
    longitude: 139.7671,
  },
  pointCount: 5000, // 5000ポイント（約42分の軌跡）
};