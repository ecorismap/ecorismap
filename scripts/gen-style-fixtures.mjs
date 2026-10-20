#!/usr/bin/env node
/**
 * ネイティブ（iOS/Android）のベクタタイル用スタイル式評価器の適合フィクスチャを生成する。
 *
 * 使い方:
 *   node scripts/gen-style-fixtures.mjs            # JSON を書き出す
 *   node scripts/gen-style-fixtures.mjs --print    # 書き出さず標準出力へ（Jest が鮮度確認に使う）
 *
 * 期待値は Web と同じ @maplibre/maplibre-gl-style-spec（createExpression / featureFilter / Color）で計算する。
 * Web が常にオラクルで、ネイティブ側のテスト（Android JUnit・iOS CLI ランナー）と
 * Jest（src/utils/__tests__/vectorStyleExpressions.fixtures.test.ts）が同じ JSON を読む。
 *
 * 出力: src/__tests__/resources/vectorStyleExpressions.json
 *
 * ケースの種類（kind）:
 *   expression : 式を propertySpec なしで評価した生の値。色は {"$color":[r,g,b,a]}（r,g,b=0〜255・非プリマルチプライ、a=0〜1）
 *   color      : 文字列を color 型として解釈した結果（CSS 色パーサの検証）
 *   filter     : featureFilter の真偽（legacy 形式と式形式の両方）
 * パース失敗・評価時例外は expectedError:true（ネイティブは「そのプロパティだけ既定値へ退避」が期待動作）。
 *
 * 注意: maplibre がパース時の静的型検査で弾くケース（例: ["==", 1, "1"]）はネイティブでは
 * 動的に評価されるため、ここには入れない（docs/VECTOR_STYLE_SUPPORT.md 参照）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Color, createExpression, featureFilter } from '@maplibre/maplibre-gl-style-spec';

const require = createRequire(import.meta.url);
const specVersion = require('@maplibre/maplibre-gl-style-spec/package.json').version;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'src', '__tests__', 'resources', 'vectorStyleExpressions.json');

const GEOMETRY_TYPE_CODE = { Point: 1, LineString: 2, Polygon: 3 };

/** 評価結果を JSON に落とす。Color は {$color:[r,g,b,a]} に正規化する */
function encodeValue(value) {
  if (value === undefined) return null;
  if (value instanceof Color) {
    const [r, g, b, a] = value.rgb;
    return { $color: [r * 255, g * 255, b * 255, a] };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`非有限の数値はフィクスチャにできない: ${value}`);
    return value;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object' && typeof value.toString === 'function' && value.constructor?.name === 'Formatted') {
    return value.toString();
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeValue(v);
    return out;
  }
  throw new Error(`未対応の値: ${JSON.stringify(value)}`);
}

function makeFeature(c) {
  const feature = { type: GEOMETRY_TYPE_CODE[c.geometryType], properties: c.properties };
  if (c.featureId !== undefined) feature.id = c.featureId;
  return feature;
}

function evalExpression(c) {
  const compiled = createExpression(c.expression);
  if (compiled.result === 'error') {
    return { expectedError: true, errorMessage: compiled.value.map((e) => e.message).join('; ') };
  }
  try {
    return { expected: encodeValue(compiled.value.evaluateWithoutErrorHandling({ zoom: c.zoom }, makeFeature(c))) };
  } catch (e) {
    return { expectedError: true, errorMessage: String(e.message ?? e) };
  }
}

function evalColorString(c) {
  const compiled = createExpression(c.expression, { type: 'color' });
  if (compiled.result === 'error') {
    return { expectedError: true, errorMessage: compiled.value.map((e) => e.message).join('; ') };
  }
  try {
    return { expected: encodeValue(compiled.value.evaluateWithoutErrorHandling({ zoom: c.zoom }, makeFeature(c))) };
  } catch (e) {
    return { expectedError: true, errorMessage: String(e.message ?? e) };
  }
}

function evalFilter(c) {
  try {
    const f = featureFilter(c.filter);
    return { expected: f.filter({ zoom: c.zoom }, makeFeature(c)) };
  } catch (e) {
    return { expectedError: true, errorMessage: String(e.message ?? e) };
  }
}

// ---------------------------------------------------------------------------
// ケース定義
// ---------------------------------------------------------------------------

const cases = [];
let seq = 0;
function add(kind, idPrefix, input, opts = {}) {
  const c = {
    id: `${idPrefix}-${String(++seq).padStart(3, '0')}`,
    kind,
    properties: opts.properties ?? {},
    geometryType: opts.geometryType ?? 'Polygon',
    zoom: opts.zoom ?? 12,
  };
  if (kind === 'filter') c.filter = input;
  else c.expression = input;
  if (opts.id !== undefined) c.featureId = opts.id;
  cases.push(c);
}
const expr = (input, opts) => add('expression', 'expr', input, opts);
const color = (input, opts) => add('color', 'color', input, opts);
const filter = (input, opts) => add('filter', 'filter', input, opts);

// --- 発端: 荒川上流_水域環境区分_枠.json の line-width / line-color（実データの属性値で全区分） ---
const ARAKAWA_LINE_COLOR = [
  'match', ['get', '区分'],
  '早瀬', '#005ce6', '淵', '#ff73df', 'ワンド・たまり', '#c500ff', '干潟', '#b2fdb7',
  '湛水域', '#cd6666', '湧水', '#ff0000', '樋門・樋管等', '#ff7f00', '#000000',
];
const ARAKAWA_LINE_WIDTH = ['match', ['get', '区分'], '樋門・樋管等', 1.3, 2.7];
for (const kubun of ['早瀬', '淵', 'ワンド・たまり', '干潟', '湛水域', '湧水', '樋門・樋管等', '不明']) {
  const properties = { 区分: kubun, 水域区分C: '1010', 表示名: kubun.slice(0, 1) };
  expr(ARAKAWA_LINE_COLOR, { properties, geometryType: 'Polygon' });
  expr(ARAKAWA_LINE_WIDTH, { properties, geometryType: 'Polygon' });
}
expr(ARAKAWA_LINE_WIDTH, { properties: {} }); // 属性なし → fallback

// --- get / has / literal / typeof ---
const P = { name: 'river', pop: 1200, flag: true, zero: 0, empty: '', neg: -3.5, big: 10000000, 'num-str': '42' };
expr(['get', 'name'], { properties: P });
expr(['get', 'pop'], { properties: P });
expr(['get', 'flag'], { properties: P });
expr(['get', 'missing'], { properties: P });
expr(['get', 'k', ['literal', { k: 'v' }]], { properties: P });
expr(['has', 'name'], { properties: P });
expr(['has', 'missing'], { properties: P });
expr(['has', 'k', ['literal', { k: 1 }]], { properties: P });
expr(['literal', [1, 'a', true, null]], { properties: P });
expr(['literal', { a: 1 }], { properties: P });
expr(['typeof', ['get', 'name']], { properties: P });
expr(['typeof', ['get', 'pop']], { properties: P });
expr(['typeof', ['get', 'flag']], { properties: P });
expr(['typeof', ['get', 'missing']], { properties: P });
expr(['typeof', ['literal', [1, 2]]], { properties: P });
expr(['typeof', ['literal', { a: 1 }]], { properties: P });
expr(['typeof', 'rgba(1,2,3,1)'], { properties: P });
expr(['typeof', ['to-color', 'red']], { properties: P });
expr(['properties'], { properties: { a: 1, b: 'x' } });
expr(['geometry-type'], { geometryType: 'Point' });
expr(['geometry-type'], { geometryType: 'LineString' });
expr(['geometry-type'], { geometryType: 'Polygon' });
expr(['id'], { id: 7 });
expr(['id'], { id: 'abc' });
expr(['id'], {});
expr(['zoom'], { zoom: 14 });
expr(['zoom'], { zoom: 9.5 });

// --- match ---
expr(['match', ['get', 'x'], 1, 'one', 2, 'two', 'other'], { properties: { x: 2 } });
expr(['match', ['get', 'x'], 1, 'one', 2, 'two', 'other'], { properties: { x: '2' } }); // 型が違えば fallback
expr(['match', ['get', 'x'], 'a', 'A', 'b', 'B', 'Z'], { properties: { x: 'b' } });
expr(['match', ['get', 'x'], ['a', 'b'], 'AB', ['c'], 'C', 'Z'], { properties: { x: 'b' } }); // 配列ラベル
expr(['match', ['get', 'x'], ['a', 'b'], 'AB', ['c'], 'C', 'Z'], { properties: { x: 'c' } });
expr(['match', ['get', 'x'], ['a', 'b'], 'AB', ['c'], 'C', 'Z'], { properties: { x: 'd' } });
expr(['match', ['get', 'x'], [1, 2, 3], 'low', [4, 5], 'high', 'none'], { properties: { x: 5 } });
expr(['match', ['get', 'x'], 'a', 'A', 'Z'], { properties: {} }); // null 入力 → fallback
expr(['match', ['get', 'x'], 'a', 'A', 'Z'], { properties: { x: true } }); // boolean 入力 → fallback
expr(['match', ['get', 'x'], 'a', ['get', 'y'], ['get', 'z']], { properties: { x: 'a', y: 'Y', z: 'Z' } }); // 出力が式
expr(['match', ['get', 'x'], 'a', ['get', 'y'], ['get', 'z']], { properties: { x: 'q', y: 'Y', z: 'Z' } });
expr(['match', ['get', 'x'], 1.5, 'half', 'none'], { properties: { x: 1.5 } });
expr(['match', ['get', 'x'], 1, 'one'], { properties: { x: 1 } }); // 引数不足 → エラー
expr(['match', ['get', 'x'], 'a', 'A', 1, 'B', 'Z'], { properties: { x: 1 } }); // ラベル型混在 → パースエラー

// --- case / coalesce ---
expr(['case', ['==', ['get', 'x'], 1], 'one', ['==', ['get', 'x'], 2], 'two', 'other'], { properties: { x: 2 } });
expr(['case', ['==', ['get', 'x'], 1], 'one', ['==', ['get', 'x'], 2], 'two', 'other'], { properties: { x: 9 } });
expr(['case', ['get', 'flag'], 'yes', 'no'], { properties: { flag: true } });
expr(['case', ['get', 'flag'], 'yes', 'no'], { properties: { flag: false } });
expr(['case', ['get', 'flag'], 'yes', 'no'], { properties: { flag: 'true' } }); // 条件が boolean でない → エラー
expr(['case', ['get', 'flag'], 'yes', 'no'], { properties: {} }); // 条件が null → エラー
expr(['case', true, 'a'], {}); // 引数不足 → エラー
expr(['coalesce', ['get', 'a'], ['get', 'b'], 'dflt'], { properties: { b: 'B' } });
expr(['coalesce', ['get', 'a'], ['get', 'b'], 'dflt'], { properties: {} });
expr(['coalesce', ['get', 'a'], ['get', 'b']], { properties: {} });
expr(['coalesce', ['get', 'a'], 0], { properties: {} });
expr(['coalesce', ['get', 'a'], false], { properties: {} });
expr(['coalesce', ['get', 'a'], ''], { properties: {} });

// --- 比較 ---
const C = { s: 'abc', n: 5, b: true, s5: '5', f: 5.0, z: 0 };
expr(['==', ['get', 'n'], 5], { properties: C });
expr(['==', ['get', 'n'], '5'], { properties: C }); // 型違い → false
expr(['==', ['get', 's5'], ['get', 'n']], { properties: C });
expr(['==', ['get', 'n'], ['get', 'f']], { properties: C });
expr(['==', ['get', 's'], 'abc'], { properties: C });
expr(['==', ['get', 'b'], true], { properties: C });
expr(['==', ['get', 'missing'], null], { properties: C });
expr(['==', ['get', 'n'], null], { properties: C });
expr(['!=', ['get', 'n'], '5'], { properties: C });
expr(['!=', ['get', 'n'], 5], { properties: C });
expr(['!=', ['get', 'missing'], null], { properties: C });
expr(['<', ['get', 'n'], 10], { properties: C });
expr(['<', ['get', 'n'], 5], { properties: C });
expr(['<=', ['get', 'n'], 5], { properties: C });
expr(['>', ['get', 'n'], 4.9], { properties: C });
expr(['>=', ['get', 'n'], 5.1], { properties: C });
expr(['<', ['get', 's'], 'abd'], { properties: C });
expr(['<', ['get', 's'], 'ab'], { properties: C });
expr(['>', ['get', 's'], 'ab'], { properties: C });
expr(['<', ['get', 'n'], '10'], { properties: C }); // 型混在 → エラー
expr(['<', ['get', 'missing'], 10], { properties: C }); // null → エラー
expr(['<', ['get', 'b'], true], { properties: C }); // boolean → エラー

// --- 論理 ---
expr(['!', ['get', 'b']], { properties: C });
expr(['!', ['get', 's']], { properties: C }); // boolean でない → エラー
expr(['all', ['==', ['get', 'n'], 5], ['==', ['get', 's'], 'abc']], { properties: C });
expr(['all', ['==', ['get', 'n'], 5], ['==', ['get', 's'], 'x']], { properties: C });
expr(['all'], { properties: C });
expr(['any', ['==', ['get', 'n'], 1], ['==', ['get', 's'], 'abc']], { properties: C });
expr(['any', ['==', ['get', 'n'], 1], ['==', ['get', 's'], 'x']], { properties: C });
expr(['any'], { properties: C });
expr(['all', ['get', 'b'], ['get', 'n']], { properties: C }); // 第2引数が boolean でない → エラー

// --- in / index-of / slice / length / at ---
expr(['in', 'a', 'banana'], {});
expr(['in', 'x', 'banana'], {});
expr(['in', ['get', 'k'], ['literal', ['a', 'b', 'c']]], { properties: { k: 'b' } });
expr(['in', ['get', 'k'], ['literal', ['a', 'b', 'c']]], { properties: { k: 'z' } });
expr(['in', 1, ['literal', [1, 2]]], {});
expr(['in', '1', ['literal', [1, 2]]], {}); // 型違い → false
expr(['in', 'a', ['get', 'missing']], {}); // haystack null → false
expr(['in', 'a', ''], {}); // 空文字 → false
expr(['in', 'な', 'さかな'], {});
expr(['index-of', 'na', 'banana'], {});
expr(['index-of', 'na', 'banana', 3], {});
expr(['index-of', 'zz', 'banana'], {});
expr(['index-of', 2, ['literal', [1, 2, 3]]], {});
expr(['index-of', 'な', 'さかな'], {});
expr(['slice', 'banana', 1, 3], {});
expr(['slice', 'banana', 2], {});
expr(['slice', 'banana', -3], {});
expr(['slice', 'さかな', 1, 2], {});
expr(['slice', ['literal', [1, 2, 3, 4]], 1, 3], {});
expr(['slice', ['get', 'missing'], 0, 1], {}); // null → エラー
expr(['length', 'banana'], {});
expr(['length', 'さかな'], {});
expr(['length', ''], {});
expr(['length', ['literal', [1, 2, 3]]], {});
expr(['length', ['get', 'missing']], {}); // null → エラー
expr(['at', 1, ['literal', ['a', 'b', 'c']]], {});
expr(['at', 5, ['literal', ['a', 'b', 'c']]], {}); // 範囲外 → エラー

// --- 文字列操作 ---
expr(['upcase', 'MixEd 123 さかな'], {});
expr(['downcase', 'MixEd 123 さかな'], {});
expr(['concat', 'a', 'b', 'c'], {});
expr(['concat', ['get', 'name'], ' (', ['get', 'pop'], ')'], { properties: P });
expr(['concat', 'x', ['get', 'missing'], 'y'], { properties: P });
expr(['concat', 'n=', 1.5, ' b=', true], {});
expr(['concat', 'c=', ['to-color', '#ff0000']], {});
expr(['concat', 'arr=', ['literal', [1, 'a']]], {});
expr(['concat'], {});

// --- to-string（JS の Number→String 書式） ---
for (const n of [
  0, 1, -1, 1.5, -1.5, 100, 255, 0.5, 0.25, 0.1, 0.30000000000000004, 1 / 3, 2 / 3, 1e7, 12345678, 1e15, 1e16,
  1234567890123456800, 1e21, 1.5e21, 1e-6, 1e-7, 2.5e-5, 1234567.891, 9007199254740993, 1.7976931348623157e308,
  4.9e-324, 5e-7, 0.000001, 1e300, 123e-20,
]) {
  expr(['to-string', n], {});
}
expr(['to-string', ['get', 'pop']], { properties: P });
expr(['to-string', ['get', 'neg']], { properties: P });
expr(['to-string', ['get', 'missing']], { properties: P });
expr(['to-string', ['get', 'flag']], { properties: P });
expr(['to-string', ['get', 'name']], { properties: P });
expr(['to-string', ['literal', [1, 'a', null, true]]], {});
expr(['to-string', ['to-color', 'rgba(10, 20, 30, 0.5)']], {});
expr(['to-string', ['to-color', '#abcdef']], {});
expr(['to-string', ['to-color', 'rgba(26, 207, 26, .73)']], {});

// --- to-number ---
for (const s of ['42', ' 12 ', '', '1e3', '-0.5', 'abc', '0x10', '12abc', '.5', '5.', '+7', '1_000', '１２', '\n3\t']) {
  expr(['to-number', s], {});
}
expr(['to-number', ['get', 'num-str']], { properties: P });
expr(['to-number', ['get', 'missing']], { properties: P }); // null → 0
expr(['to-number', ['get', 'flag']], { properties: P }); // true → 1
expr(['to-number', ['get', 'name'], ['get', 'pop']], { properties: P }); // 1つ目失敗 → 2つ目
expr(['to-number', ['get', 'name']], { properties: P }); // 全部失敗 → エラー

// --- to-boolean ---
for (const v of ['', 'a', '0', 'false', 0, 1, -1, true, false]) expr(['to-boolean', v], {});
expr(['to-boolean', ['get', 'missing']], {});
expr(['to-boolean', ['literal', []]], {});
expr(['to-boolean', ['literal', {}]], {});

// --- 算術 ---
expr(['+', 1, 2, 3.5], {});
expr(['+', ['get', 'pop'], 1], { properties: P });
expr(['+', ['get', 'name'], 1], { properties: P }); // 文字列 → エラー
expr(['-', 10, 3], {});
expr(['-', 10], {});
expr(['*', 2, 3, 4], {});
expr(['/', 7, 2], {});
expr(['%', 7, 3], {});
expr(['%', -7, 3], {});
expr(['%', 7.5, 2], {});
expr(['^', 2, 10], {});
expr(['^', 4, 0.5], {});
expr(['abs', -3.5], {});
expr(['round', 2.5], {});
expr(['round', -2.5], {});
expr(['round', 2.4999], {});
expr(['round', -0.4], {});
expr(['floor', -2.5], {});
expr(['ceil', -2.5], {});
expr(['min', 3, 1, 2], {});
expr(['max', 3, 1, 2], {});
expr(['min', ['get', 'pop'], 1000], { properties: P });
expr(['sqrt', 16], {});
expr(['ln', 1], {});
expr(['log10', 1000], {});
expr(['log2', 8], {});
expr(['pi'], {});
expr(['e'], {});
expr(['ln2'], {});
expr(['sin', 0], {});
expr(['cos', 0], {});
expr(['atan', 1], {});

// --- step / interpolate（入力がデータ・ズームの両方） ---
const STEP = ['step', ['get', 'pop'], 1, 100, 2, 1000, 3];
for (const pop of [0, 100, 500, 1000, 5000]) expr(STEP, { properties: { pop } });
expr(['step', ['zoom'], 'low', 10, 'mid', 14, 'high'], { zoom: 9 });
expr(['step', ['zoom'], 'low', 10, 'mid', 14, 'high'], { zoom: 10 });
expr(['step', ['zoom'], 'low', 10, 'mid', 14, 'high'], { zoom: 16 });
expr(['step', ['get', 'pop'], 1, 100, 2], { properties: {} }); // null 入力 → エラー
const LIN = ['interpolate', ['linear'], ['get', 'pop'], 0, 1, 1000, 11];
for (const pop of [-10, 0, 250, 1000, 2000]) expr(LIN, { properties: { pop } });
const EXP = ['interpolate', ['exponential', 2], ['zoom'], 10, 1, 14, 16];
for (const zoom of [8, 10, 11, 12, 13.5, 14, 20]) expr(EXP, { zoom });
expr(['interpolate', ['linear'], ['zoom'], 10, 1], { zoom: 20 }); // ストップ1つ
expr(['interpolate', ['linear'], ['zoom'], 10, ['number', ['get', 'a']], 20, ['number', ['get', 'b']]], { zoom: 15, properties: { a: 2, b: 4 } });
expr(['interpolate', ['linear'], ['get', 'pop'], 0, 'a', 10, 'b'], { properties: { pop: 5 } }); // 文字列出力 → パースエラー
expr(['interpolate', ['cubic-bezier', 0.42, 0, 0.58, 1], ['get', 'pop'], 0, 0, 10, 100], { properties: { pop: 5 } });
expr(['interpolate', ['linear'], ['get', 'pop'], 0, ['to-color', 'red'], 10, ['to-color', 'blue']], { properties: { pop: 5 } }); // 色補間は未対応 → ネイティブは既定値

// --- 型アサーション / rgb / to-color ---
expr(['number', ['get', 'pop']], { properties: P });
expr(['number', ['get', 'name'], ['get', 'pop']], { properties: P });
expr(['number', ['get', 'name']], { properties: P }); // エラー
expr(['string', ['get', 'name']], { properties: P });
expr(['string', ['get', 'pop']], { properties: P }); // エラー
expr(['boolean', ['get', 'flag']], { properties: P });
expr(['array', ['literal', [1, 2]]], {});
expr(['object', ['literal', { a: 1 }]], {});
expr(['rgb', 255, 128, 0], {});
expr(['rgba', 255, 128, 0, 0.5], {});
expr(['rgb', 256, 0, 0], {}); // 範囲外 → エラー
expr(['rgba', 0, 0, 0, 2], {}); // alpha 範囲外 → エラー
expr(['to-color', '#ff0000'], {});
expr(['to-color', 'not-a-color', '#00ff00'], {});
expr(['to-color', ['literal', [1, 2, 3]]], {});
expr(['to-color', ['literal', [1, 2, 3, 0.5]]], {});
expr(['to-color', 'nope'], {}); // エラー
expr(['to-rgba', ['to-color', '#336699']], {});
expr(['to-color', ['get', 'c']], { properties: { c: 'hsl(120, 100%, 50%)' } });

// --- format（文字列部分だけを連結して評価する） ---
expr(['format', 'Hello ', { 'font-scale': 0.8 }, ['get', 'name'], {}], { properties: P });
expr(['format', ['get', 'pop'], {}, ' people'], { properties: P });
expr(['format', ['get', 'missing']], { properties: P });

// --- 未知の演算子・不正な形 ---
expr(['no-such-op', 1], {});
expr(['get'], {}); // 引数不足
expr(['get', 5], {}); // キーが文字列でない
expr([], {}); // 空配列
expr(['let', 'x', 1, ['var', 'x']], {});
expr(['let', 'x', 1, 'y', ['get', 'name'], ['concat', ['var', 'y'], ['to-string', ['var', 'x']]]], { properties: P });
expr(['var', 'nope'], {}); // 未束縛 → パースエラー
expr(['feature-state', 'hover'], {});
expr(['number-format', 1234.5678, {}], {});
expr(['number-format', 1234.5678, { 'min-fraction-digits': 1, 'max-fraction-digits': 2 }], {});
expr(['number-format', 0.5, { 'min-fraction-digits': 2 }], {});
expr(['number-format', 1234567, { 'max-fraction-digits': 0 }], {});

// --- リテラル値をそのまま評価（式でない値） ---
expr('plain string', {});
expr(42, {});
expr(true, {});
expr(null, {});
expr(['literal', 'x'], {});

// --- CSS 色文字列（propertySpec color で解釈） ---
const CSS_COLOR_NAMES = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue',
  'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
  'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro',
  'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred',
  'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
  'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime',
  'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
  'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet',
  'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen', 'transparent',
];
for (const name of CSS_COLOR_NAMES) color(name, {});
for (const s of [
  '#fff', '#FFF', '#abc', '#abcd', '#ABCD', '#00ff00', '#00FF00', '#00ff0080', '#00ff00ff', '#00ff0000',
  'rgb(10,20,30)', 'rgb(10, 20, 30)', 'rgba(10,20,30,0.5)', 'rgba(10, 20, 30, .5)', 'rgba(10,20,30,50%)',
  'rgb(10 20 30)', 'rgb(10 20 30 / 0.5)', 'rgb(10 20 30 / 50%)', 'rgb(100%, 0%, 50%)', 'rgb(1.5, 2.5, 3.5)',
  'rgb(300, -10, 0)', 'rgba(0,0,0,2)', 'hsl(120, 100%, 50%)', 'hsl(120,100%,50%)', 'hsla(120, 100%, 50%, 0.3)',
  'hsl(120 100% 50%)', 'hsl(120 100% 50% / 0.3)', 'hsl(0.5turn, 50%, 50%)', 'hsl(200deg, 50%, 50%)',
  'hsl(3.14rad, 50%, 50%)', 'hsl(-30, 50%, 50%)', 'hsl(390, 50%, 50%)', 'HSL(120, 100%, 50%)', 'RGB(1,2,3)',
  'Red', 'RED', '  red  ', '#', '#12', '#12345', '#1234567', '#gggggg', 'rgb(1,2)', 'rgb(1,2,3,4,5)', 'rgb()',
  'rgba(1,2,3)', 'notacolor', '', '0x00ff00', 'rgb( 10 , 20 , 30 )', 'rgb(10,20,30)extra', 'hsl(120, 100, 50)',
  'rgb(10%,20%,30%)', 'rgba(255,255,255,1.0)', 'rgba(255,255,255,0)', 'currentColor', 'inherit',
]) {
  color(s, {});
}

// --- filter: legacy 形式 ---
const F = { class: 'river', rank: 3, name: 'A', flag: true, s3: '3' };
filter(['==', 'class', 'river'], { properties: F });
filter(['==', 'class', 'road'], { properties: F });
filter(['==', 'rank', 3], { properties: F });
filter(['==', 'rank', '3'], { properties: F }); // 厳密比較 → false
filter(['==', 's3', 3], { properties: F }); // 厳密比較 → false
filter(['==', 'missing', null], { properties: F }); // 存在しない属性は undefined で null と一致しない
filter(['!=', 'class', 'road'], { properties: F });
filter(['!=', 'class', 'river'], { properties: F });
filter(['<', 'rank', 5], { properties: F });
filter(['<', 'rank', 3], { properties: F });
filter(['<=', 'rank', 3], { properties: F });
filter(['>', 'rank', 2], { properties: F });
filter(['>=', 'rank', 4], { properties: F });
filter(['<', 'rank', '5'], { properties: F }); // 型違い → false
filter(['<', 'missing', 5], { properties: F }); // 欠損 → false
filter(['<', 'name', 'B'], { properties: F });
filter(['has', 'class'], { properties: F });
filter(['has', 'missing'], { properties: F });
filter(['!has', 'class'], { properties: F });
filter(['!has', 'missing'], { properties: F });
filter(['in', 'class', 'river', 'lake'], { properties: F });
filter(['in', 'class', 'road', 'lake'], { properties: F });
filter(['in', 'rank', 1, 2, 3], { properties: F });
filter(['in', 'rank', '3'], { properties: F }); // 厳密比較 → false
filter(['in', 'class'], { properties: F }); // 値なし → false
filter(['!in', 'class', 'road'], { properties: F });
filter(['!in', 'class', 'river'], { properties: F });
filter(['all', ['==', 'class', 'river'], ['>', 'rank', 2]], { properties: F });
filter(['all', ['==', 'class', 'river'], ['>', 'rank', 5]], { properties: F });
filter(['any', ['==', 'class', 'road'], ['>', 'rank', 2]], { properties: F });
filter(['any', ['==', 'class', 'road'], ['>', 'rank', 5]], { properties: F });
filter(['none', ['==', 'class', 'road'], ['>', 'rank', 5]], { properties: F });
filter(['none', ['==', 'class', 'river']], { properties: F });
filter(['all'], { properties: F });
filter(['any'], { properties: F });
filter(['none'], { properties: F });
filter(['==', '$type', 'Polygon'], { properties: F, geometryType: 'Polygon' });
filter(['==', '$type', 'Polygon'], { properties: F, geometryType: 'Point' });
filter(['!=', '$type', 'Point'], { properties: F, geometryType: 'LineString' });
filter(['in', '$type', 'Point', 'LineString'], { properties: F, geometryType: 'LineString' });
filter(['in', '$type', 'Point', 'LineString'], { properties: F, geometryType: 'Polygon' });
filter(['!in', '$type', 'Point'], { properties: F, geometryType: 'Polygon' });
filter(['has', '$type'], { properties: F });
filter(['==', '$id', 7], { properties: F, id: 7 });
filter(['==', '$id', 7], { properties: F, id: 8 });
filter(['==', '$id', 7], { properties: F });
filter(['has', '$id'], { properties: F, id: 7 });
filter(['has', '$id'], { properties: F });
filter(['!has', '$id'], { properties: F });
filter(['in', '$id', 1, 7], { properties: F, id: 7 });
filter(['<', '$id', 10], { properties: F, id: 7 });
filter(['all', ['in', 'class', 'river'], ['none', ['==', 'rank', 1]], ['!has', 'x']], { properties: F });
// style_sample/style3.json 相当（文字列属性の legacy ==）
filter(['==', '解析樹種ID', '01'], { properties: { 解析樹種ID: '01' } });
filter(['==', '解析樹種ID', '01'], { properties: { 解析樹種ID: 1 } });

// --- filter: 式形式 ---
filter(['==', ['get', 'class'], 'river'], { properties: F });
filter(['==', ['get', 'rank'], '3'], { properties: F });
filter(['all', ['==', ['get', 'class'], 'river'], ['>', ['get', 'rank'], 2]], { properties: F });
filter(['any', ['==', ['get', 'class'], 'x'], ['!', ['has', 'missing']]], { properties: F });
filter(['in', ['get', 'class'], ['literal', ['river', 'lake']]], { properties: F });
filter(['match', ['get', 'class'], ['river', 'lake'], true, false], { properties: F });
filter(['match', ['get', 'class'], ['road'], true, false], { properties: F });
filter(['==', ['geometry-type'], 'Point'], { properties: F, geometryType: 'Point' });
filter(['==', ['geometry-type'], 'Point'], { properties: F, geometryType: 'Polygon' });
filter(['has', 'class'], { properties: F }); // 式形式としても legacy としても同じ
filter(['>', ['get', 'rank'], ['get', 'missing']], { properties: F }); // 評価エラー → false
filter(['get', 'flag'], { properties: F }); // boolean を返す式
filter(['get', 'class'], { properties: F }); // boolean でない → エラー（描かない）
filter(['case', ['>', ['get', 'rank'], 2], true, false], { properties: F });
filter(['<', ['zoom'], 14], { properties: F, zoom: 12 });
filter(['<', ['zoom'], 14], { properties: F, zoom: 15 });
filter(true, { properties: F });
filter(false, { properties: F });
filter(null, { properties: F });
filter(['step', ['zoom'], false, 13, true], { properties: F, zoom: 12 });
filter(['step', ['zoom'], false, 13, true], { properties: F, zoom: 13 });

// ---------------------------------------------------------------------------
// 期待値を計算
// ---------------------------------------------------------------------------

const out = [];
for (const c of cases) {
  let r;
  try {
    if (c.kind === 'expression') r = evalExpression(c);
    else if (c.kind === 'color') r = evalColorString(c);
    else r = evalFilter(c);
  } catch (e) {
    // 非有限の数値など、フィクスチャに落とせない結果は除外する（生成時に警告）
    console.warn(`skip ${c.id}: ${e.message}`);
    continue;
  }
  const entry = {
    id: c.id,
    kind: c.kind,
    ...(c.kind === 'filter' ? { filter: c.filter } : { expression: c.expression }),
    properties: c.properties,
    geometryType: c.geometryType,
    zoom: c.zoom,
  };
  if (c.featureId !== undefined) entry.featureId = c.featureId;
  if (r.expectedError) {
    entry.expectedError = true;
    entry.errorMessage = r.errorMessage;
  } else {
    entry.expected = r.expected;
  }
  out.push(entry);
}

const doc = {
  generatedWith: { '@maplibre/maplibre-gl-style-spec': specVersion },
  generator: 'scripts/gen-style-fixtures.mjs',
  cases: out,
};

export function generateFixtures() {
  return doc;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes('--print')) {
  process.stdout.write(JSON.stringify(doc, null, 1) + '\n');
} else if (isMain) {
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(doc, null, 1) + '\n');
  const errors = out.filter((c) => c.expectedError).length;
  console.log(`wrote ${out.length} cases (${errors} expectedError) to ${path.relative(process.cwd(), OUT_PATH)}`);
}
