#!/usr/bin/env node

/**
 * post-checkout フック
 * ブランチ切り替え後の自動処理
 */

const { runCommand, fileExists, getProjectRoot } = require('../lib/utils');
const { PackageManager } = require('../lib/package-manager');
const path = require('path');

async function postCheckout() {
  const [prevHead, newHead, branchFlag] = process.argv.slice(2);

  // ブランチ切り替えの場合のみ実行（ファイルチェックアウトは除外）
  if (branchFlag !== '1') {
    return;
  }

  console.log('🔄 Post-checkout hooks running...\n');

  const pm = new PackageManager();
  const root = getProjectRoot();

  // 1. package.jsonが変更されていたら依存関係を再インストール
  try {
    const diff = runCommand(
      `git diff ${prevHead} ${newHead} --name-only`,
      { stdio: 'pipe' }
    ).toString();

    if (diff.includes('package.json') || diff.includes('yarn.lock')) {
      console.log('📦 package.json changed, installing dependencies...');
      pm.install();
      console.log('  ✓ Dependencies installed\n');
    }
  } catch {
    // 差分取得に失敗した場合は無視
  }

  // 2. ネイティブ依存関係の確認（iOS）
  const podfileLock = path.join(root, 'ios', 'Podfile.lock');
  if (fileExists(podfileLock)) {
    try {
      const diff = runCommand(
        `git diff ${prevHead} ${newHead} --name-only`,
        { stdio: 'pipe' }
      ).toString();

      if (diff.includes('Podfile')) {
        console.log('🍎 Podfile changed, you may need to run: cd ios && pod install');
      }
    } catch {
      // 無視
    }
  }

  // 3. 環境変数ファイルの確認
  const envExample = path.join(root, '.env.example');
  if (fileExists(envExample)) {
    console.log('💡 Remember to check .env files if environment variables changed.\n');
  }

  console.log('✅ Post-checkout complete.\n');
}

postCheckout().catch(err => {
  console.error('Post-checkout hook failed:', err);
  // post-checkoutは失敗してもチェックアウト自体は成功させる
  process.exit(0);
});
