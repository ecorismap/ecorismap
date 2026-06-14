#!/usr/bin/env node
/**
 * Web (Metro) の export 成果物(web-build/)のアセット参照を「ルート絶対パス」から
 * 「相対パス」へ書き換える。
 *
 * Expo の単一出力(output: single)は index.html / バンドルともにアセットを
 * `/_expo/...` `/assets/...` のルート絶対パスで参照する。これだとドメイン直下配信専用で、
 * `https://example.com/sub/dir/` のようなサブディレクトリへ置くと 404 になる。
 *
 * Web版はURLがディレクトリ位置から動かない(ルーティングは RootNavigationContext の
 * メモリ内 history で、window.location は変化しない)ため、相対パスにすれば
 * document base 基準で解決され、prod/dev でサブルートが異なっても単一ビルドで動作する。
 * (Apache は実ディレクトリへのアクセス時に自動でトレイリングスラッシュを付与するため、
 *  document base は常に配信ディレクトリになる。)
 *
 * 注意: app.json に experiments.baseUrl は設定しない(=ルート絶対のまま export し、ここで相対化)。
 *       ソース内の /static 参照(pdf worker / sqlite wasm)は document.baseURI 基準で解決済み。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'web-build');

if (!fs.existsSync(buildDir)) {
  console.error(`web-relative-paths: build dir not found: ${buildDir}`);
  process.exit(1);
}

const replaceAll = (s, from, to) => s.split(from).join(to);

// --- index.html ---
const indexPath = path.join(buildDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = replaceAll(html, 'href="/_expo/', 'href="_expo/');
  html = replaceAll(html, 'src="/_expo/', 'src="_expo/');
  html = replaceAll(html, 'href="/favicon', 'href="favicon');
  fs.writeFileSync(indexPath, html);
  console.log('web-relative-paths: rewrote index.html');
} else {
  console.warn('web-relative-paths: index.html not found');
}

// --- JS bundles ---
// アセット実体(/assets/...)と動的chunk(/_expo/...)の絶対パス文字列を相対化する。
// クォート直後が "/assets/" "/_expo/" のものだけを対象にし、外部URL等を巻き込まない。
const jsDir = path.join(buildDir, '_expo', 'static', 'js', 'web');
let jsCount = 0;
if (fs.existsSync(jsDir)) {
  for (const name of fs.readdirSync(jsDir)) {
    if (!name.endsWith('.js')) continue;
    const file = path.join(jsDir, name);
    let code = fs.readFileSync(file, 'utf8');
    const before = code;
    for (const q of ['"', "'"]) {
      code = replaceAll(code, `${q}/_expo/`, `${q}_expo/`);
      code = replaceAll(code, `${q}/assets/`, `${q}assets/`);
    }
    if (code !== before) {
      fs.writeFileSync(file, code);
      jsCount += 1;
    }
  }
}
console.log(`web-relative-paths: rewrote ${jsCount} JS file(s)`);

// --- 検証: 取りこぼした絶対参照が残っていないか ---
const leftovers = [];
const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
if (/(href|src)="\/(_expo|favicon)/.test(indexHtml)) leftovers.push('index.html');
if (fs.existsSync(jsDir)) {
  for (const name of fs.readdirSync(jsDir)) {
    if (!name.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(jsDir, name), 'utf8');
    if (/["']\/(_expo|assets)\//.test(code)) leftovers.push(name);
  }
}
if (leftovers.length) {
  console.error(`web-relative-paths: 絶対参照が残っています: ${leftovers.join(', ')}`);
  process.exit(1);
}
console.log('web-relative-paths: done (all asset paths are relative)');
