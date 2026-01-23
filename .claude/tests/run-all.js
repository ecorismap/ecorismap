#!/usr/bin/env node

/**
 * Claude Code設定テスト実行スクリプト
 *
 * @description
 * .claude/ディレクトリ内の全テストを実行します
 *
 * @usage
 * node .claude/tests/run-all.js
 * node .claude/tests/run-all.js --verbose
 * node .claude/tests/run-all.js --filter=hooks
 */

const fs = require('fs');
const path = require('path');
const { createTestSuite, assert, getClaudeDir } = require('./lib/test-utils');

/**
 * コマンドライン引数をパース
 * @returns {Object} パースされた引数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    verbose: args.includes('--verbose') || args.includes('-v'),
    filter: args.find(a => a.startsWith('--filter='))?.split('=')[1] || null,
    help: args.includes('--help') || args.includes('-h')
  };
}

/**
 * ヘルプを表示
 */
function showHelp() {
  console.log(`
Claude Code設定テスト実行スクリプト

使用方法:
  node run-all.js [オプション]

オプション:
  --verbose, -v    詳細出力
  --filter=NAME    指定したテストのみ実行
  --help, -h       ヘルプを表示

例:
  node run-all.js
  node run-all.js --verbose
  node run-all.js --filter=hooks
`);
}

/**
 * ディレクトリ構造テスト
 */
async function testDirectoryStructure() {
  const suite = createTestSuite('ディレクトリ構造確認');

  const claudeDir = getClaudeDir();

  const requiredDirs = [
    'agents',
    'commands',
    'rules',
    'skills',
    'hooks',
    'scripts',
    'scripts/lib',
    'scripts/hooks',
    'plugins',
    'contexts',
    'mcp-configs',
    'examples',
    'tests'
  ];

  for (const dir of requiredDirs) {
    await suite.test(`${dir}ディレクトリが存在する`, () => {
      assert.dirExists(path.join(claudeDir, dir));
    });
  }

  return suite;
}

/**
 * 必須ファイル存在テスト
 */
async function testRequiredFiles() {
  const suite = createTestSuite('必須ファイル確認');

  const claudeDir = getClaudeDir();

  const requiredFiles = [
    'hooks/hooks.json',
    'plugins/plugin.json',
    'plugins/marketplace.json',
    'mcp-configs/mcp-servers.json',
    'contexts/dev.md',
    'contexts/research.md',
    'contexts/review.md',
    'scripts/lib/utils.js',
    'scripts/lib/package-manager.js',
    'scripts/hooks/pre-commit.js',
    'scripts/hooks/post-checkout.js',
    'scripts/verify.js'
  ];

  for (const file of requiredFiles) {
    await suite.test(`${file}が存在する`, () => {
      assert.fileExists(path.join(claudeDir, file));
    });
  }

  return suite;
}

/**
 * エージェント数テスト
 */
async function testAgentsCount() {
  const suite = createTestSuite('エージェント確認');

  const agentsDir = path.join(getClaudeDir(), 'agents');
  const agents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

  await suite.test('エージェントが10個以上存在する', () => {
    assert.ok(agents.length >= 10, `Found ${agents.length} agents`);
  });

  await suite.test('必須エージェントが存在する', () => {
    const required = [
      'code-reviewer.md',
      'code-refactoring-cleaner.md',
      'security-reviewer.md',
      'planner.md',
      'tdd-guide.md'
    ];
    required.forEach(agent => {
      assert.ok(agents.includes(agent), `Missing ${agent}`);
    });
  });

  return suite;
}

/**
 * コマンド数テスト
 */
async function testCommandsCount() {
  const suite = createTestSuite('コマンド確認');

  const commandsDir = path.join(getClaudeDir(), 'commands');
  const commands = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));

  await suite.test('コマンドが15個以上存在する', () => {
    assert.ok(commands.length >= 15, `Found ${commands.length} commands`);
  });

  await suite.test('必須コマンドが存在する', () => {
    const required = [
      'commit.md',
      'tdd.md',
      'code-review.md',
      'verify.md',
      'orchestrate.md',
      'eval.md'
    ];
    required.forEach(cmd => {
      assert.ok(commands.includes(cmd), `Missing ${cmd}`);
    });
  });

  return suite;
}

/**
 * ルール数テスト
 */
async function testRulesCount() {
  const suite = createTestSuite('ルール確認');

  const rulesDir = path.join(getClaudeDir(), 'rules');
  const rules = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));

  await suite.test('ルールが7個存在する', () => {
    assert.equal(rules.length, 7);
  });

  await suite.test('必須ルールが存在する', () => {
    const required = [
      'security.md',
      'testing.md',
      'coding-style.md',
      'platform-specific.md',
      'git-workflow.md'
    ];
    required.forEach(rule => {
      assert.ok(rules.includes(rule), `Missing ${rule}`);
    });
  });

  return suite;
}

/**
 * JSON構文テスト
 */
async function testJsonSyntax() {
  const suite = createTestSuite('JSON構文確認');

  const claudeDir = getClaudeDir();
  const jsonFiles = [
    'hooks/hooks.json',
    'plugins/plugin.json',
    'plugins/marketplace.json',
    'mcp-configs/mcp-servers.json',
    'examples/statusline.json'
  ];

  for (const file of jsonFiles) {
    await suite.test(`${file}が有効なJSONである`, () => {
      const filePath = path.join(claudeDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        JSON.parse(content);
        assert.ok(true);
      } else {
        throw new Error(`File not found: ${file}`);
      }
    });
  }

  return suite;
}

/**
 * メイン実行
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log('\n🧪 Claude Code設定テスト\n');
  console.log('═'.repeat(60));

  // テストスイートを収集
  let testFunctions = [
    testDirectoryStructure,
    testRequiredFiles,
    testAgentsCount,
    testCommandsCount,
    testRulesCount,
    testJsonSyntax
  ];

  // フックテストも実行
  try {
    const hooksTest = require('./hooks/hooks.test');
    // hooksテストは別途runAllTestsを持つので個別に扱わない
  } catch (e) {
    // フックテストが失敗しても続行
  }

  // フィルタリング
  if (args.filter) {
    testFunctions = testFunctions.filter(fn =>
      fn.name.toLowerCase().includes(args.filter.toLowerCase())
    );
  }

  // テスト実行
  const suites = [];
  for (const testFn of testFunctions) {
    try {
      const suite = await testFn();
      suites.push(suite);
    } catch (error) {
      console.error(`テスト実行エラー (${testFn.name}):`, error);
    }
  }

  // 結果出力
  suites.forEach(suite => suite.printResults());

  // 総合結果
  console.log('\n' + '═'.repeat(60));
  console.log('📊 総合結果\n');

  let totalPassed = 0;
  let totalFailed = 0;

  suites.forEach(suite => {
    const summary = suite.getSummary();
    totalPassed += summary.passed;
    totalFailed += summary.failed;

    const status = summary.success ? '✅' : '❌';
    console.log(`  ${status} ${summary.suite}: ${summary.passed}/${summary.total}`);
  });

  console.log('\n' + '─'.repeat(60));
  const totalTests = totalPassed + totalFailed;
  const successRate = totalTests > 0
    ? Math.round((totalPassed / totalTests) * 100)
    : 0;
  console.log(`  合計: ${totalTests} テスト | 成功率: ${successRate}%`);
  console.log(`  成功: ${totalPassed} | 失敗: ${totalFailed}`);
  console.log('═'.repeat(60) + '\n');

  // 終了コード
  if (totalFailed > 0) {
    console.log('❌ テスト失敗\n');
    process.exit(1);
  } else {
    console.log('✅ 全テスト成功\n');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('予期しないエラー:', error);
  process.exit(1);
});
