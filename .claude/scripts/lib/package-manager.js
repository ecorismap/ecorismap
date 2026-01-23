/**
 * パッケージマネージャーユーティリティ
 * yarn/npm/pnpm の抽象化レイヤー
 */

const { detectPackageManager, runCommand, getProjectRoot } = require('./utils');

class PackageManager {
  constructor() {
    this.manager = detectPackageManager();
    this.root = getProjectRoot();
  }

  /**
   * 依存関係をインストール
   */
  install() {
    const commands = {
      yarn: 'yarn install',
      npm: 'npm install',
      pnpm: 'pnpm install'
    };
    return runCommand(commands[this.manager]);
  }

  /**
   * パッケージを追加
   */
  add(packages, options = {}) {
    const pkgList = Array.isArray(packages) ? packages.join(' ') : packages;
    const dev = options.dev ? '-D' : '';

    const commands = {
      yarn: `yarn add ${dev} ${pkgList}`,
      npm: `npm install ${options.dev ? '--save-dev' : '--save'} ${pkgList}`,
      pnpm: `pnpm add ${dev} ${pkgList}`
    };
    return runCommand(commands[this.manager]);
  }

  /**
   * パッケージを削除
   */
  remove(packages) {
    const pkgList = Array.isArray(packages) ? packages.join(' ') : packages;

    const commands = {
      yarn: `yarn remove ${pkgList}`,
      npm: `npm uninstall ${pkgList}`,
      pnpm: `pnpm remove ${pkgList}`
    };
    return runCommand(commands[this.manager]);
  }

  /**
   * スクリプトを実行
   */
  run(script, args = '') {
    const commands = {
      yarn: `yarn ${script} ${args}`,
      npm: `npm run ${script} -- ${args}`,
      pnpm: `pnpm ${script} ${args}`
    };
    return runCommand(commands[this.manager]);
  }

  /**
   * テストを実行
   */
  test(options = {}) {
    let script = 'test';
    if (options.coverage) {
      script = 'test:coverage';
    }
    if (options.watch) {
      return this.run(script, '--watch');
    }
    return this.run(script);
  }

  /**
   * リントを実行
   */
  lint(options = {}) {
    if (options.fix) {
      return this.run('lint', '--fix');
    }
    return this.run('lint');
  }

  /**
   * 型チェックを実行
   */
  typeCheck() {
    return runCommand('npx tsc --noEmit');
  }

  /**
   * ビルドを実行
   */
  build(platform = 'web') {
    const scripts = {
      web: 'build:web',
      ios: 'ios',
      android: 'android'
    };
    return this.run(scripts[platform] || scripts.web);
  }

  /**
   * 開発サーバーを起動
   */
  start(platform = 'start') {
    const scripts = {
      start: 'start',
      ios: 'ios',
      android: 'android',
      web: 'web'
    };
    return this.run(scripts[platform] || scripts.start);
  }

  /**
   * Firebaseエミュレータを起動
   */
  startEmulator() {
    return this.run('emu');
  }

  /**
   * エミュレータ付きテストを実行
   */
  testWithEmulator() {
    return this.run('testemu');
  }
}

module.exports = { PackageManager };
