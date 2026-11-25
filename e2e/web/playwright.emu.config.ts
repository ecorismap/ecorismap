import path from 'path';
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// ログインが要る範囲（アカウント・共有プロジェクト）の通しテスト。Firebaseエミュレータにつないで流す。
//   yarn e2e:web:emu              全部（エミュレータの起動から片付けまで行う）
//   yarn e2e:web:emu -g PROJ-2    台帳のIDで絞る
//
// 開発サーバーは、エミュレータ接続用の環境変数つきで別のポートに立てる（EXPO_PUBLIC_USE_FIREBASE_EMULATOR=1）。
// このとき暗号化（Virgil）は使わない。暗号化込みの動きは yarn testrules と実機の手動確認で確かめる。

const PORT = Number(process.env.E2E_EMU_PORT ?? 8082);

export default defineConfig({
  ...base,
  testDir: './specs-emu',
  globalSetup: path.resolve(__dirname, 'support/emuSetup.ts'),
  use: { ...base.use, baseURL: `http://localhost:${PORT}/` },
  webServer: {
    command: `yarn web --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    cwd: path.resolve(__dirname, '../..'),
    env: { EXPO_PUBLIC_USE_FIREBASE_EMULATOR: '1' },
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
