#!/usr/bin/env node
/**
 * 海しるAPI（海上保安庁 海洋状況表示システム）から島名・海底地形名を取得し、
 * レイヤプリセットの同梱データ src/presets/data/*.json を再生成する。
 *
 * 使い方:
 *   MSIL_SUBSCRIPTION_KEY=<キー> node scripts/fetch-msil-data.js
 *
 * キーは https://portal.msil.go.jp/ の開発者ポータルで無料登録して取得する。
 * キーはコミットしないこと（環境変数からのみ読む）。
 *
 * 利用条件: 海しるの利用規約は政府標準利用規約2.0準拠（CC BY 4.0互換）。
 * 出典表記（出典: 海しる（海上保安庁））が必要。生成物にはattributionを埋め込む。
 */
const fs = require('fs');
const path = require('path');

const KEY = process.env.MSIL_SUBSCRIPTION_KEY;
if (!KEY) {
  console.error('MSIL_SUBSCRIPTION_KEY環境変数を設定してください（portal.msil.go.jpで無料登録）');
  process.exit(1);
}

const OUT_DIR = path.resolve(__dirname, '../src/presets/data');
const ATTRIBUTION = '海しる（海上保安庁）';
const PAGE_SIZE = 1000;

// ArcGIS MapServer query API。resultOffsetでページングして全件取得する
async function fetchAll(baseUrl, layerId) {
  const features = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url =
      `${baseUrl}/${layerId}/query?where=1=1&outFields=*&returnGeometry=true` +
      `&resultOffset=${offset}&resultRecordCount=${PAGE_SIZE}&f=geojson&subscription-key=${KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url.replace(KEY, '***')}`);
    const page = await res.json();
    if (!Array.isArray(page.features)) throw new Error('featuresが取得できません');
    features.push(...page.features);
    if (!page.exceededTransferLimit || page.features.length === 0) break;
  }
  return features;
}

// 座標を6桁に丸め、必要な属性だけ残す
function normalize(features, pickProps) {
  return features
    .filter((f) => f && f.geometry && f.geometry.type === 'Point')
    .map((f) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          Math.round(f.geometry.coordinates[0] * 1e6) / 1e6,
          Math.round(f.geometry.coordinates[1] * 1e6) / 1e6,
        ],
      },
      properties: pickProps(f.properties || {}),
    }));
}

function write(name, features) {
  const out = { type: 'FeatureCollection', attribution: ATTRIBUTION, features };
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(out));
  console.log(`${name}: ${features.length}件`);
}

(async () => {
  const islands = await fetchAll('https://api.msil.go.jp/island/v2/MapServer', 1);
  write(
    'msil_islands.json',
    normalize(islands, (p) => ({
      島名: p['島名'] || '',
      読み: p['読み'] || '',
      都道府県: p['都道府県'] || '',
    }))
  );

  const undersea = await fetchAll('https://api.msil.go.jp/undersea-features/v2/MapServer', 1);
  write(
    'msil_undersea_features.json',
    normalize(undersea, (p) => {
      const props = {
        海底地形名: p['海底地形名'] || '',
        かな: p['かな'] || '',
        属名: p['属名'] || '',
      };
      if (p['水深'] !== null && p['水深'] !== undefined) props['水深'] = p['水深'];
      return props;
    })
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
