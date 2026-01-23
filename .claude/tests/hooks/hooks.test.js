/**
 * Claude Codeフックのテスト
 *
 * @description
 * pre-commit、post-checkoutなどのフックの動作をテストします
 */

const path = require('path');
const fs = require('fs');
const {
  createTestSuite,
  assert,
  tempFiles,
  runCommand,
  getProjectRoot,
  getClaudeDir
} = require('../lib/test-utils');

/**
 * フックファイル存在テスト
 */
async function testHookFilesExist() {
  const suite = createTestSuite('フックファイル存在確認');

  const claudeDir = getClaudeDir();
  const hooksDir = path.join(claudeDir, 'hooks');
  const scriptsHooksDir = path.join(claudeDir, 'scripts', 'hooks');

  await suite.test('hooksディレクトリが存在する', () => {
    assert.dirExists(hooksDir);
  });

  await suite.test('hooks.jsonが存在する', () => {
    assert.fileExists(path.join(hooksDir, 'hooks.json'));
  });

  await suite.test('scripts/hooks/pre-commit.jsが存在する', () => {
    assert.fileExists(path.join(scriptsHooksDir, 'pre-commit.js'));
  });

  await suite.test('scripts/hooks/post-checkout.jsが存在する', () => {
    assert.fileExists(path.join(scriptsHooksDir, 'post-checkout.js'));
  });

  return suite;
}

/**
 * hooks.json構造テスト
 */
async function testHooksJsonStructure() {
  const suite = createTestSuite('hooks.json構造確認');

  const hooksJsonPath = path.join(getClaudeDir(), 'hooks', 'hooks.json');

  let hooksConfig;

  await suite.test('hooks.jsonが有効なJSONである', () => {
    const content = fs.readFileSync(hooksJsonPath, 'utf8');
    hooksConfig = JSON.parse(content);
    assert.ok(hooksConfig);
  });

  await suite.test('hooksプロパティが存在する', () => {
    assert.ok(hooksConfig.hooks);
  });

  await suite.test('hooksが配列である', () => {
    assert.ok(Array.isArray(hooksConfig.hooks));
  });

  await suite.test('各フックにmatcherプロパティがある', () => {
    hooksConfig.hooks.forEach((hook, index) => {
      assert.ok(
        hook.matcher !== undefined,
        `Hook ${index} is missing matcher property`
      );
    });
  });

  await suite.test('各フックにhooksプロパティがある', () => {
    hooksConfig.hooks.forEach((hook, index) => {
      assert.ok(
        hook.hooks !== undefined,
        `Hook ${index} is missing hooks property`
      );
    });
  });

  return suite;
}

/**
 * pre-commitスクリプト構文テスト
 */
async function testPreCommitScript() {
  const suite = createTestSuite('pre-commitスクリプト確認');

  const scriptPath = path.join(
    getClaudeDir(),
    'scripts',
    'hooks',
    'pre-commit.js'
  );

  await suite.test('スクリプトが構文的に正しい', () => {
    // Node.jsで構文チェック
    const result = runCommand(`node --check "${scriptPath}"`);
    assert.ok(result.success, result.error);
  });

  await suite.test('スクリプトがrequireできる', () => {
    // モジュールとしてロード可能か確認
    try {
      require(scriptPath);
      assert.ok(true);
    } catch (error) {
      // モジュールのエクスポートがない場合は許容
      if (!error.message.includes('module.exports')) {
        throw error;
      }
    }
  });

  return suite;
}

/**
 * post-checkoutスクリプト構文テスト
 */
async function testPostCheckoutScript() {
  const suite = createTestSuite('post-checkoutスクリプト確認');

  const scriptPath = path.join(
    getClaudeDir(),
    'scripts',
    'hooks',
    'post-checkout.js'
  );

  await suite.test('スクリプトが構文的に正しい', () => {
    const result = runCommand(`node --check "${scriptPath}"`);
    assert.ok(result.success, result.error);
  });

  return suite;
}

/**
 * ユーティリティスクリプトテスト
 */
async function testUtilsScript() {
  const suite = createTestSuite('ユーティリティスクリプト確認');

  const utilsPath = path.join(getClaudeDir(), 'scripts', 'lib', 'utils.js');

  await suite.test('utils.jsが存在する', () => {
    assert.fileExists(utilsPath);
  });

  await suite.test('utils.jsが構文的に正しい', () => {
    const result = runCommand(`node --check "${utilsPath}"`);
    assert.ok(result.success, result.error);
  });

  await suite.test('utils.jsがエクスポートを持つ', () => {
    const utils = require(utilsPath);
    assert.ok(typeof utils === 'object');
  });

  return suite;
}

/**
 * パッケージマネージャースクリプトテスト
 */
async function testPackageManagerScript() {
  const suite = createTestSuite('パッケージマネージャースクリプト確認');

  const pmPath = path.join(
    getClaudeDir(),
    'scripts',
    'lib',
    'package-manager.js'
  );

  await suite.test('package-manager.jsが存在する', () => {
    assert.fileExists(pmPath);
  });

  await suite.test('package-manager.jsが構文的に正しい', () => {
    const result = runCommand(`node --check "${pmPath}"`);
    assert.ok(result.success, result.error);
  });

  return suite;
}

/**
 * メインテスト実行
 */
async function runAllTests() {
  console.log('\n🧪 Claude Codeフックテスト\n');
  console.log('═'.repeat(50));

  const suites = [
    await testHookFilesExist(),
    await testHooksJsonStructure(),
    await testPreCommitScript(),
    await testPostCheckoutScript(),
    await testUtilsScript(),
    await testPackageManagerScript()
  ];

  // 結果出力
  suites.forEach(suite => suite.printResults());

  // サマリー
  console.log('\n' + '═'.repeat(50));
  console.log('📊 総合結果\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  suites.forEach(suite => {
    const summary = suite.getSummary();
    totalPassed += summary.passed;
    totalFailed += summary.failed;
    totalDuration += summary.duration;

    const status = summary.success ? '✅' : '❌';
    console.log(`  ${status} ${summary.suite}: ${summary.passed}/${summary.total}`);
  });

  console.log('\n' + '─'.repeat(50));
  console.log(
    `  合計: ${totalPassed + totalFailed} テスト | ` +
    `成功: ${totalPassed} | ` +
    `失敗: ${totalFailed} | ` +
    `時間: ${totalDuration}ms`
  );
  console.log('═'.repeat(50) + '\n');

  // クリーンアップ
  tempFiles.cleanup();

  // 終了コード
  process.exit(totalFailed > 0 ? 1 : 0);
}

// 直接実行時
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('テスト実行エラー:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };
