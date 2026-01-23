/**
 * Claude Code設定テスト用ユーティリティ
 *
 * @description
 * スクリプトとフックのテストに使用するヘルパー関数群
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

/**
 * テスト結果オブジェクト
 * @typedef {Object} TestResult
 * @property {boolean} passed - テスト成功/失敗
 * @property {string} name - テスト名
 * @property {string} [message] - メッセージ
 * @property {Error} [error] - エラーオブジェクト
 * @property {number} duration - 実行時間(ms)
 */

/**
 * テストスイートを作成
 * @param {string} name - スイート名
 * @returns {Object} テストスイートオブジェクト
 */
function createTestSuite(name) {
  const results = [];
  const startTime = Date.now();

  return {
    name,
    results,

    /**
     * テストを追加実行
     * @param {string} testName - テスト名
     * @param {Function} testFn - テスト関数
     */
    async test(testName, testFn) {
      const testStart = Date.now();
      try {
        await testFn();
        results.push({
          passed: true,
          name: testName,
          duration: Date.now() - testStart
        });
      } catch (error) {
        results.push({
          passed: false,
          name: testName,
          error,
          message: error.message,
          duration: Date.now() - testStart
        });
      }
    },

    /**
     * 結果サマリーを取得
     * @returns {Object} サマリー
     */
    getSummary() {
      const passed = results.filter(r => r.passed).length;
      const failed = results.filter(r => !r.passed).length;
      return {
        suite: name,
        total: results.length,
        passed,
        failed,
        duration: Date.now() - startTime,
        success: failed === 0
      };
    },

    /**
     * 結果を出力
     */
    printResults() {
      console.log(`\n📋 ${name}`);
      console.log('━'.repeat(50));

      results.forEach(result => {
        const status = result.passed ? '✅' : '❌';
        const duration = `(${result.duration}ms)`;
        console.log(`  ${status} ${result.name} ${duration}`);
        if (!result.passed && result.message) {
          console.log(`     └─ ${result.message}`);
        }
      });

      const summary = this.getSummary();
      console.log('━'.repeat(50));
      console.log(
        `  合計: ${summary.total} | ` +
        `成功: ${summary.passed} | ` +
        `失敗: ${summary.failed} | ` +
        `時間: ${summary.duration}ms`
      );
    }
  };
}

/**
 * アサーション関数群
 */
const assert = {
  /**
   * 等価チェック
   * @param {*} actual - 実際の値
   * @param {*} expected - 期待値
   * @param {string} [message] - メッセージ
   */
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${expected}, but got ${actual}`
      );
    }
  },

  /**
   * 深い等価チェック
   * @param {*} actual - 実際の値
   * @param {*} expected - 期待値
   * @param {string} [message] - メッセージ
   */
  deepEqual(actual, expected, message = '') {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(
        message || `Expected ${expectedStr}, but got ${actualStr}`
      );
    }
  },

  /**
   * 真偽チェック
   * @param {*} value - チェック対象
   * @param {string} [message] - メッセージ
   */
  ok(value, message = '') {
    if (!value) {
      throw new Error(message || `Expected truthy value, but got ${value}`);
    }
  },

  /**
   * 偽チェック
   * @param {*} value - チェック対象
   * @param {string} [message] - メッセージ
   */
  notOk(value, message = '') {
    if (value) {
      throw new Error(message || `Expected falsy value, but got ${value}`);
    }
  },

  /**
   * 例外スロー確認
   * @param {Function} fn - テスト関数
   * @param {string|RegExp} [expected] - 期待するエラーメッセージ
   * @param {string} [message] - メッセージ
   */
  throws(fn, expected, message = '') {
    try {
      fn();
      throw new Error(message || 'Expected function to throw');
    } catch (error) {
      if (expected) {
        const matches = typeof expected === 'string'
          ? error.message.includes(expected)
          : expected.test(error.message);
        if (!matches) {
          throw new Error(
            message || `Expected error matching ${expected}, got: ${error.message}`
          );
        }
      }
    }
  },

  /**
   * ファイル存在確認
   * @param {string} filePath - ファイルパス
   * @param {string} [message] - メッセージ
   */
  fileExists(filePath, message = '') {
    if (!fs.existsSync(filePath)) {
      throw new Error(message || `File not found: ${filePath}`);
    }
  },

  /**
   * ディレクトリ存在確認
   * @param {string} dirPath - ディレクトリパス
   * @param {string} [message] - メッセージ
   */
  dirExists(dirPath, message = '') {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      throw new Error(message || `Directory not found: ${dirPath}`);
    }
  },

  /**
   * 文字列包含確認
   * @param {string} str - 対象文字列
   * @param {string} substring - 含まれるべき部分文字列
   * @param {string} [message] - メッセージ
   */
  includes(str, substring, message = '') {
    if (!str.includes(substring)) {
      throw new Error(
        message || `Expected "${str}" to include "${substring}"`
      );
    }
  },

  /**
   * 配列長チェック
   * @param {Array} arr - 対象配列
   * @param {number} length - 期待する長さ
   * @param {string} [message] - メッセージ
   */
  length(arr, length, message = '') {
    if (arr.length !== length) {
      throw new Error(
        message || `Expected array length ${length}, but got ${arr.length}`
      );
    }
  }
};

/**
 * 一時ファイル/ディレクトリ管理
 */
const tempFiles = {
  created: [],

  /**
   * 一時ファイル作成
   * @param {string} content - ファイル内容
   * @param {string} [ext] - 拡張子
   * @returns {string} ファイルパス
   */
  create(content, ext = '.tmp') {
    const tmpDir = path.join(__dirname, '..', '.tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const filePath = path.join(tmpDir, `test-${Date.now()}${ext}`);
    fs.writeFileSync(filePath, content);
    this.created.push(filePath);
    return filePath;
  },

  /**
   * 一時ディレクトリ作成
   * @returns {string} ディレクトリパス
   */
  createDir() {
    const tmpDir = path.join(__dirname, '..', '.tmp', `dir-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    this.created.push(tmpDir);
    return tmpDir;
  },

  /**
   * クリーンアップ
   */
  cleanup() {
    this.created.forEach(p => {
      try {
        if (fs.existsSync(p)) {
          if (fs.statSync(p).isDirectory()) {
            fs.rmSync(p, { recursive: true });
          } else {
            fs.unlinkSync(p);
          }
        }
      } catch (e) {
        console.warn(`Failed to cleanup: ${p}`);
      }
    });
    this.created = [];
  }
};

/**
 * コマンド実行ヘルパー
 * @param {string} command - コマンド
 * @param {Object} [options] - オプション
 * @returns {Object} 実行結果
 */
function runCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      encoding: 'utf8',
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 30000,
      ...options
    });
    return { success: true, output: result, error: null };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message
    };
  }
}

/**
 * プロジェクトルートパスを取得
 * @returns {string} プロジェクトルートパス
 */
function getProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('Project root not found');
}

/**
 * Claude設定ディレクトリパスを取得
 * @returns {string} .claudeディレクトリパス
 */
function getClaudeDir() {
  return path.join(getProjectRoot(), '.claude');
}

module.exports = {
  createTestSuite,
  assert,
  tempFiles,
  runCommand,
  getProjectRoot,
  getClaudeDir
};
