/**
 * ネイティブ（iOS/Android）のベクタスタイル式評価器が読む適合フィクスチャの鮮度を検証する。
 *
 * フィクスチャの期待値は Web と同じ @maplibre/maplibre-gl-style-spec で生成している
 * （scripts/gen-style-fixtures.mjs）。生成器を再実行した結果と、コミット済みの JSON が
 * 一致しなければ、誰かがケースを変えたのに `node scripts/gen-style-fixtures.mjs` を
 * 実行し忘れている（またはライブラリの版が変わって期待値が動いた）。
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURE_PATH = path.join(ROOT, 'src', '__tests__', 'resources', 'vectorStyleExpressions.json');
const GENERATOR_PATH = path.join(ROOT, 'scripts', 'gen-style-fixtures.mjs');

interface FixtureCase {
  id: string;
  kind: 'expression' | 'color' | 'filter';
  expression?: unknown;
  filter?: unknown;
  properties: Record<string, unknown>;
  geometryType: string;
  zoom: number;
  expected?: unknown;
  expectedError?: boolean;
}

interface FixtureDoc {
  generatedWith: Record<string, string>;
  cases: FixtureCase[];
}

describe('vectorStyleExpressions fixtures', () => {
  const committed: FixtureDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

  it('生成器を再実行した結果とコミット済み JSON が一致する', () => {
    const stdout = execFileSync(process.execPath, [GENERATOR_PATH, '--print'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const regenerated: FixtureDoc = JSON.parse(stdout);
    expect(regenerated).toEqual(committed);
  });

  it('style-spec の版はインストール済みの版と一致する', () => {
     
    const installed = require('@maplibre/maplibre-gl-style-spec/package.json').version as string;
    expect(committed.generatedWith['@maplibre/maplibre-gl-style-spec']).toBe(installed);
  });

  it('発端の荒川上流スタイル（line-width の match 式）が含まれ、区分ごとに幅が決まる', () => {
    const widthCases = committed.cases.filter(
      (c) =>
        c.kind === 'expression' &&
        Array.isArray(c.expression) &&
        JSON.stringify(c.expression) === JSON.stringify(['match', ['get', '区分'], '樋門・樋管等', 1.3, 2.7])
    );
    expect(widthCases.length).toBeGreaterThanOrEqual(8);
    const byKubun = Object.fromEntries(widthCases.map((c) => [c.properties['区分'] ?? '(none)', c.expected]));
    expect(byKubun['樋門・樋管等']).toBe(1.3);
    expect(byKubun['早瀬']).toBe(2.7);
    expect(byKubun['(none)']).toBe(2.7);
  });

  it('各ケースは expected か expectedError のどちらか一方を持つ', () => {
    for (const c of committed.cases) {
      const hasExpected = Object.prototype.hasOwnProperty.call(c, 'expected');
      expect(hasExpected !== Boolean(c.expectedError)).toBe(true);
    }
  });
});
