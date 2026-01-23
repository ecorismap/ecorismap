#!/usr/bin/env node

/**
 * 検証スクリプト
 * /verify コマンドの実装
 */

const {
  runCommand,
  checkSensitiveFiles,
  getGitStatus,
  getCurrentBranch
} = require('./lib/utils');
const { PackageManager } = require('./lib/package-manager');

const MODES = {
  quick: ['typeCheck'],
  full: ['build', 'typeCheck', 'lint', 'test', 'consoleLogs', 'sensitiveFiles', 'gitStatus'],
  'pre-commit': ['typeCheck', 'lint', 'consoleLogs', 'sensitiveFiles'],
  'pre-pr': ['build', 'typeCheck', 'lint', 'test', 'consoleLogs', 'sensitiveFiles', 'gitStatus', 'coverage']
};

async function verify(mode = 'full') {
  console.log('========================================');
  console.log('        EcorisMap Verification');
  console.log('========================================\n');
  console.log(`Mode: ${mode}`);
  console.log(`Branch: ${getCurrentBranch()}\n`);

  const pm = new PackageManager();
  const checks = MODES[mode] || MODES.full;
  const results = {};

  // ビルド確認
  if (checks.includes('build')) {
    console.log('🔨 Build check...');
    try {
      pm.build('web');
      results.build = { status: 'PASS' };
      console.log('  ✓ Build passed\n');
    } catch {
      results.build = { status: 'FAIL' };
      console.log('  ✗ Build failed\n');
    }
  }

  // 型チェック
  if (checks.includes('typeCheck')) {
    console.log('📋 Type check...');
    try {
      pm.typeCheck();
      results.typeCheck = { status: 'PASS' };
      console.log('  ✓ Type check passed\n');
    } catch {
      results.typeCheck = { status: 'FAIL' };
      console.log('  ✗ Type check failed\n');
    }
  }

  // リント
  if (checks.includes('lint')) {
    console.log('📋 Lint check...');
    try {
      pm.lint();
      results.lint = { status: 'PASS' };
      console.log('  ✓ Lint passed\n');
    } catch {
      results.lint = { status: 'FAIL' };
      console.log('  ✗ Lint failed\n');
    }
  }

  // テスト
  if (checks.includes('test')) {
    console.log('🧪 Running tests...');
    try {
      pm.test();
      results.tests = { status: 'PASS' };
      console.log('  ✓ Tests passed\n');
    } catch {
      results.tests = { status: 'FAIL' };
      console.log('  ✗ Tests failed\n');
    }
  }

  // カバレッジ
  if (checks.includes('coverage')) {
    console.log('📊 Coverage check...');
    try {
      pm.test({ coverage: true });
      results.coverage = { status: 'PASS' };
      console.log('  ✓ Coverage check passed\n');
    } catch {
      results.coverage = { status: 'FAIL' };
      console.log('  ✗ Coverage check failed\n');
    }
  }

  // console.log検出
  if (checks.includes('consoleLogs')) {
    console.log('🔍 Checking for console.log...');
    try {
      const result = runCommand(
        'grep -r "console\\.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
        { stdio: 'pipe' }
      );
      const output = result ? result.toString().trim() : '';
      if (output) {
        results.consoleLogs = { status: 'WARN', count: output.split('\n').length };
        console.log(`  ⚠ Found ${results.consoleLogs.count} console.log statements\n`);
      } else {
        results.consoleLogs = { status: 'PASS' };
        console.log('  ✓ No console.log found\n');
      }
    } catch {
      results.consoleLogs = { status: 'PASS' };
    }
  }

  // センシティブファイル
  if (checks.includes('sensitiveFiles')) {
    console.log('🔒 Checking sensitive files...');
    const sensitive = checkSensitiveFiles();
    const staged = getGitStatus().filter(line => line.startsWith('A') || line.startsWith('M'));
    const stagedSensitive = sensitive.filter(f => staged.some(s => s.includes(f)));

    if (stagedSensitive.length > 0) {
      results.sensitiveFiles = { status: 'FAIL', files: stagedSensitive };
      console.log(`  ✗ Sensitive files staged: ${stagedSensitive.join(', ')}\n`);
    } else {
      results.sensitiveFiles = { status: 'PASS' };
      console.log('  ✓ No sensitive files staged\n');
    }
  }

  // Gitステータス
  if (checks.includes('gitStatus')) {
    console.log('📝 Git status...');
    const status = getGitStatus();
    results.gitStatus = {
      status: 'INFO',
      uncommitted: status.length
    };
    console.log(`  ℹ ${status.length} uncommitted changes\n`);
  }

  // 結果サマリー
  console.log('========================================');
  console.log('        Verification Report');
  console.log('========================================\n');

  for (const [check, result] of Object.entries(results)) {
    const icon = result.status === 'PASS' ? '✓' :
                 result.status === 'FAIL' ? '✗' :
                 result.status === 'WARN' ? '⚠' : 'ℹ';
    console.log(`${icon} ${check}: ${result.status}`);
  }

  const hasFailures = Object.values(results).some(r => r.status === 'FAIL');
  console.log('\n========================================');
  console.log(`PR Ready: ${hasFailures ? 'NO' : 'YES'}`);
  console.log('========================================\n');

  process.exit(hasFailures ? 1 : 0);
}

const mode = process.argv[2] || 'full';
verify(mode).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
