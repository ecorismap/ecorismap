#!/usr/bin/env node
/**
 * Web (Metro) ビルド用の静的アセットを public/static/ へコピーする。
 *
 * webpack 時代の CopyWebpackPlugin 相当。Metro は wasm/data を「アセット」として
 * 自動コピーしないため、HTTP 配信できるよう public/ 配下へ置く。
 *  - gdal3.js: PDF.web.ts の initGdalJs({ path: 'static' }) が /static/gdal3.* を参照
 *  - pdf.worker: PDF.web.ts の GlobalWorkerOptions.workerSrc = '/static/pdf.worker.min.mjs'
 *
 * public/static/ は生成物のため .gitignore 済み。`yarn web` / `yarn build:web` の前に実行する。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');
const destDir = path.join(root, 'public', 'static');

// [node_modules からの相対パス, コピー先ファイル名]
const assets = [
  ['gdal3.js/dist/package/gdal3.js', 'gdal3.js'],
  ['gdal3.js/dist/package/gdal3WebAssembly.wasm', 'gdal3WebAssembly.wasm'],
  ['gdal3.js/dist/package/gdal3WebAssembly.data', 'gdal3WebAssembly.data'],
  // 非min版を配信する。min版にはgeo抽出パッチ(patches/pdfjs-dist+4.5.136.patch)が当たらず、
  // PDFインポート時の地理参照(page._pageInfo.geo)取得が失敗するため。配信名は従来どおり。
  ['pdfjs-dist/build/pdf.worker.mjs', 'pdf.worker.min.mjs'],
  // SQLite.web.ts の sqlite3InitModule({ locateFile: f => `/static/${f}` }) が参照
  ['@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm', 'sqlite3.wasm'],
];

try {
  fs.mkdirSync(destDir, { recursive: true });
} catch (e) {
  console.warn(`copy-web-assets: could not create ${destDir}: ${e.message}`);
  process.exit(0);
}

for (const [rel, name] of assets) {
  const src = path.join(nodeModules, rel);
  const dest = path.join(destDir, name);
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    } else {
      console.warn(`copy-web-assets: source not found, skipping: ${rel}`);
    }
  } catch (e) {
    console.warn(`copy-web-assets: could not copy ${rel}: ${e.message}`);
  }
}
