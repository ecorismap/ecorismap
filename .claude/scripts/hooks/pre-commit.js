#!/usr/bin/env node

/**
 * pre-commit フック
 * コミット前の自動チェック
 */

const { runCommand, checkSensitiveFiles, getGitStatus } = require('../lib/utils');
const { PackageManager } = require('../lib/package-manager');

async function preCommit() {
  console.log('🔍 Pre-commit checks starting...\n');

  const pm = new PackageManager();
  const errors = [];
  const warnings = [];

  // 1. センシティブファイルチェック
  console.log('📋 Checking for sensitive files...');
  const sensitiveFiles = checkSensitiveFiles();
  const stagedFiles = getGitStatus().filter(line => line.startsWith('A') || line.startsWith('M'));

  for (const file of sensitiveFiles) {
    if (stagedFiles.some(staged => staged.includes(file))) {
      errors.push(`センシティブファイルがステージされています: ${file}`);
    }
  }

  // 2. TypeScript型チェック
  console.log('📋 Running type check...');
  try {
    pm.typeCheck();
    console.log('  ✓ Type check passed\n');
  } catch {
    errors.push('TypeScript型チェックに失敗しました');
  }

  // 3. ESLintチェック
  console.log('📋 Running lint...');
  try {
    pm.lint();
    console.log('  ✓ Lint passed\n');
  } catch {
    errors.push('ESLintチェックに失敗しました');
  }

  // 4. console.log検出
  console.log('📋 Checking for console.log statements...');
  try {
    const result = runCommand(
      'grep -r "console\\.log" src/ --include="*.ts" --include="*.tsx" || true',
      { stdio: 'pipe' }
    );
    if (result && result.toString().trim()) {
      warnings.push('console.logが検出されました。本番コードから削除してください。');
    } else {
      console.log('  ✓ No console.log found\n');
    }
  } catch {
    // grep で見つからない場合はエラーにならない
  }

  // 5. 結果出力
  console.log('\n========================================');
  console.log('        Pre-commit Results');
  console.log('========================================\n');

  if (errors.length > 0) {
    console.log('❌ Errors:');
    errors.forEach(e => console.log(`  - ${e}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(w => console.log(`  - ${w}`));
    console.log('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All checks passed!\n');
  }

  // エラーがあればコミットを中止
  if (errors.length > 0) {
    console.log('❌ Commit aborted due to errors.\n');
    process.exit(1);
  }
}

preCommit().catch(err => {
  console.error('Pre-commit hook failed:', err);
  process.exit(1);
});
