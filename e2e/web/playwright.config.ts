import os from 'os';
import path from 'path';
import { defineConfig, devices } from '@playwright/test';

// Web版の通しテスト。項目は docs/E2E_TEST_ITEMS.md の台帳と対応し、テスト名の先頭に台帳のIDを付ける。
//   yarn e2e:web                 全部
//   yarn e2e:web specs/01-boot   1ファイルだけ
//   yarn e2e:web -g LAYER-2      台帳のIDで絞る

const PORT = Number(process.env.E2E_PORT ?? 8081);

// レポート・スクリーンショット・トレースはリポジトリの外へ出す（リポジトリ内に書くとMetroが変更として拾う）
const OUT = process.env.E2E_OUT ?? path.join(os.tmpdir(), 'ecorismap-e2e-web');

export default defineConfig({
  testDir: './specs',
  outputDir: path.join(OUT, 'results'),
  // 1つの開発サーバーを相手にするので直列で流す（並列にするとMetroの初回バンドルで時間切れになりやすい）
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: path.join(OUT, 'report'), open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: `yarn web --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    cwd: path.resolve(__dirname, '../..'),
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
