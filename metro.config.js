const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('db');
// .wasm を import するライブラリ（@virgilsecurity/e3kit-browser 等）を
// Web でアセット(URL)として解決・出力コピーするため。Native は .wasm を import しないため無害。
config.resolver.assetExts.push('wasm');

// Web では一部モジュールを空モジュールへ解決する。
//  - Node コア(fs/http/https/url): geotiff 等の保険（webpack の resolve.fallback 相当）
//  - sqlite3-worker1-bundler-friendly.mjs: @sqlite.org/sqlite-wasm の index.mjs が
//    worker promiser を読み込み、それが new Worker(new URL('...bundler-friendly.mjs', import.meta.url))
//    を参照して Metro が解決できない。本アプリは JsStorageDb（メインスレッド）のみ使い worker は
//    実行時にも呼ばれないため空スタブで安全にバンドルを通す。
const webEmptyModules = new Set([
  'fs',
  'http',
  'https',
  'url',
  'sqlite3-worker1-bundler-friendly.mjs',
  'sqlite3-opfs-async-proxy.js',
]);
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webEmptyModules.has(moduleName)) {
    return { type: 'empty' };
  }

  const resolved = originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);

  // Web では tslib の package exports で node/import 条件が選ばれ、tslib/modules/index.js
  //（import tslib from '../tslib.js' のデフォルトimport）や tslib.es6.mjs に解決される。
  // tslib.js は __esModule=true を立てる UMD のため CJS/ESM interop で .default が undefined になり
  // 「Cannot destructure property '__extends' of 'n.default'」で起動失敗する。
  // 同一パッケージの CJS 版(tslib.js)へ向け直して回避する（Native は require 条件で元々 CJS）。
  if (
    platform === 'web' &&
    moduleName === 'tslib' &&
    resolved &&
    resolved.type === 'sourceFile' &&
    typeof resolved.filePath === 'string'
  ) {
    const m = resolved.filePath.match(/^(.*[\\/]tslib)[\\/]/);
    if (m) {
      return { ...resolved, filePath: path.join(m[1], 'tslib.js') };
    }
  }

  return resolved;
};

module.exports = config;
