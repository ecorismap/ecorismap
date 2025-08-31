/**
 * メモリ監視用ユーティリティ
 * クラッシュ原因特定のためのメモリ使用量追跡
 */

// JavaScriptヒープメモリ使用量をログ出力
export const logMemoryUsage = (label: string): void => {
  // ブラウザまたはReact Native環境でperformance.memoryが利用可能な場合
  if (typeof window !== 'undefined' && (window as any).performance?.memory) {
    const memory = (window as any).performance.memory;
    const used = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
    const total = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
    const limit = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
    
    console.log(`[Memory ${label}]`, {
      usedJSHeapSize: `${used} MB`,
      totalJSHeapSize: `${total} MB`,
      jsHeapSizeLimit: `${limit} MB`,
      usage: `${((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(1)}%`
    });
  } else {
    // React Native環境 - 代替情報を表示
    if (global && (global as any).nativePerformanceNow) {
      // React Native の場合、タイムスタンプのみ表示
      console.log(`[Perf ${label}] at ${Date.now()}`);
    }
    // メモリAPIが使えない場合はログを出さない
  }
};

// オブジェクトのサイズを推定（JSON文字列の長さベース）
export const getObjectSize = (obj: any): number => {
  try {
    const jsonString = JSON.stringify(obj);
    return jsonString.length;
  } catch (error) {
    console.error('[Memory] Failed to calculate object size:', error);
    return 0;
  }
};

// オブジェクトサイズを読みやすい形式で表示
export const logObjectSize = (label: string, obj: any): void => {
  const sizeInBytes = getObjectSize(obj);
  
  if (sizeInBytes < 1024) {
    console.log(`[Size ${label}] ${sizeInBytes} bytes`);
  } else if (sizeInBytes < 1024 * 1024) {
    console.log(`[Size ${label}] ${(sizeInBytes / 1024).toFixed(2)} KB`);
  } else {
    console.log(`[Size ${label}] ${(sizeInBytes / 1024 / 1024).toFixed(2)} MB`);
  }
};

// チャンクデータの統計情報をログ出力
export const logChunkStats = (
  chunkIndex: number,
  chunkSize: number,
  totalChunks: number,
  totalPoints: number
): void => {
  console.log(`[ChunkStats]`, {
    currentChunk: chunkIndex,
    currentChunkSize: chunkSize,
    totalChunks: totalChunks,
    totalPoints: totalPoints,
    avgPointsPerChunk: totalChunks > 0 ? Math.floor(totalPoints / totalChunks) : 0
  });
};

// パフォーマンス計測用タイマー
export class PerformanceTimer {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = Date.now();
  }

  log(operation: string): void {
    const elapsed = Date.now() - this.startTime;
    console.log(`[Perf ${this.label}] ${operation}: ${elapsed}ms`);
  }

  reset(): void {
    this.startTime = Date.now();
  }
}

// メモリリーク検出用のトラッカー
export class MemoryLeakTracker {
  private measurements: Array<{ timestamp: number; usage: number }> = [];
  private maxMeasurements = 100;

  track(label: string): void {
    if (typeof window !== 'undefined' && (window as any).performance?.memory) {
      const memory = (window as any).performance.memory;
      const usage = memory.usedJSHeapSize;
      
      this.measurements.push({
        timestamp: Date.now(),
        usage: usage
      });

      // 最大数を超えたら古いデータを削除
      if (this.measurements.length > this.maxMeasurements) {
        this.measurements.shift();
      }

      // メモリ使用量が継続的に増加しているかチェック
      if (this.measurements.length >= 10) {
        const recent = this.measurements.slice(-10);
        const trend = this.calculateTrend(recent);
        
        if (trend > 0.5) { // 50%以上の増加傾向
          console.warn(`[MemoryLeak ${label}] Possible memory leak detected! Trend: +${(trend * 100).toFixed(1)}%`);
        }
      }
    }
  }

  private calculateTrend(measurements: Array<{ timestamp: number; usage: number }>): number {
    if (measurements.length < 2) return 0;
    
    const first = measurements[0].usage;
    const last = measurements[measurements.length - 1].usage;
    
    return (last - first) / first;
  }

  reset(): void {
    this.measurements = [];
  }
}