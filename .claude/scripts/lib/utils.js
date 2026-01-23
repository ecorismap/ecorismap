/**
 * EcorisMap Claude Code ユーティリティ
 * クロスプラットフォーム対応のNode.jsヘルパー関数
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

/**
 * プロジェクトルートディレクトリを取得
 */
function getProjectRoot() {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      if (pkg.name === 'ecorismap') {
        return dir;
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error('Project root not found');
}

/**
 * 環境を検出（development/production）
 */
function detectEnvironment() {
  return process.env.NODE_ENV || 'development';
}

/**
 * プラットフォームを検出
 */
function detectPlatform() {
  const platform = process.platform;
  return {
    isMac: platform === 'darwin',
    isWindows: platform === 'win32',
    isLinux: platform === 'linux',
    platform
  };
}

/**
 * パッケージマネージャーを検出
 */
function detectPackageManager() {
  const root = getProjectRoot();

  if (fs.existsSync(path.join(root, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(root, 'package-lock.json'))) {
    return 'npm';
  }

  return 'yarn'; // デフォルト
}

/**
 * コマンドを実行
 */
function runCommand(command, options = {}) {
  const defaultOptions = {
    cwd: getProjectRoot(),
    stdio: 'inherit',
    shell: true
  };

  try {
    return execSync(command, { ...defaultOptions, ...options });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    throw error;
  }
}

/**
 * コマンドを非同期で実行
 */
function runCommandAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const defaultOptions = {
      cwd: getProjectRoot(),
      stdio: 'inherit',
      shell: true
    };

    const proc = spawn(command, args, { ...defaultOptions, ...options });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

/**
 * ファイルが存在するか確認
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * ディレクトリを作成（再帰的）
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * JSONファイルを読み込み
 */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Failed to read JSON: ${filePath}`);
    throw error;
  }
}

/**
 * JSONファイルを書き込み
 */
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * カバレッジ要件をチェック
 */
function checkCoverageRequirements(coverageReport) {
  const requirements = {
    'src/modules': 60,
    'src/utils': 40,
    'src/hooks': 30,
    global: 20
  };

  const results = [];

  for (const [dir, threshold] of Object.entries(requirements)) {
    const coverage = coverageReport[dir] || coverageReport.global || 0;
    const passed = coverage >= threshold;
    results.push({
      directory: dir,
      threshold,
      actual: coverage,
      passed
    });
  }

  return results;
}

/**
 * センシティブファイルのチェック
 */
function checkSensitiveFiles() {
  const sensitivePatterns = [
    '.env',
    '.env.local',
    '.env.production',
    'google-services.json',
    'GoogleService-Info.plist',
    'src/constants/APIKeys.ts'
  ];

  const root = getProjectRoot();
  const found = [];

  for (const pattern of sensitivePatterns) {
    const filePath = path.join(root, pattern);
    if (fs.existsSync(filePath)) {
      found.push(pattern);
    }
  }

  return found;
}

/**
 * Gitステータスを取得
 */
function getGitStatus() {
  try {
    const status = execSync('git status --porcelain', {
      cwd: getProjectRoot(),
      encoding: 'utf8'
    });
    return status.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 現在のブランチ名を取得
 */
function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: getProjectRoot(),
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'unknown';
  }
}

module.exports = {
  getProjectRoot,
  detectEnvironment,
  detectPlatform,
  detectPackageManager,
  runCommand,
  runCommandAsync,
  fileExists,
  ensureDir,
  readJson,
  writeJson,
  checkCoverageRequirements,
  checkSensitiveFiles,
  getGitStatus,
  getCurrentBranch
};
