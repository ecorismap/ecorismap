#!/usr/bin/env node
/**
 * 眺望の山名表示に使う山頂データ src/presets/data/gsi_peaks.json を生成する。
 *
 * 使い方:
 *   node scripts/build-peaks-data.mjs [--cache <dir>] [--detail]
 *
 *   --cache   タイルから抜き出した結果のキャッシュ先（既定: OSの一時ディレクトリ）。
 *             途中で止まっても、再実行すれば取得済みのタイルは読み直さない
 *   --detail  z14でも山名を拾う（z11に出ない小さな峰や肩まで入る）。
 *             z14タイルは重いため、山名か高い標高点があるz11タイルの範囲だけ取る
 *
 * データの出どころ（どちらも国土地理院コンテンツ利用規約。出典表記で利用できる）:
 *   - 地理院最適化ベクトルタイル（optimal_bvmap）のAnnoレイヤ。山名と標高点・三角点
 *   - 日本の主な山岳標高（1003山）。山頂の正確な位置・標高・よみ
 *
 * ベクトルタイルの山名は「文字を置く位置」であって山頂ではない（富士山はz13で山頂から約1.4km北）。
 * そこで、1003山に載っている山はその山頂座標に置き換え、それ以外は近くの標高点・三角点の
 * うち最も高い点へ寄せる。標高点が無ければ地理院DEMの最高点へ寄せる。
 */
import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PMTiles } from 'pmtiles';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import { decode as decodePng } from 'fast-png';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, '../src/presets/data/gsi_peaks.json');
const BVMAP_URL = 'https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles';
const MOUNTAINS_CSV_URL = 'https://www.gsi.go.jp/KOKUJYOHO/MOUNTAIN/1003zan20260331.csv';
const DEM_URL = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png';
const DEM_ZOOM = 14;
const ATTRIBUTION = '国土地理院（最適化ベクトルタイル、日本の主な山岳標高）';

/** 日本の範囲（タイル走査用） */
const BBOX = { west: 122.9, south: 20.4, east: 154.0, north: 45.6 };
/** 地理院サーバーへの配慮。並列数を絞る */
const CONCURRENCY = 4;

/**
 * 山名のvt_code（optbv_featurecodes）と表示ランク。ランクは小さいほど重要で、遠くまで表示する。
 * 314〜316はz8〜10だけに出る「小縮尺で載せる山」で、そこに載る山ほど主要な山
 */
const NAME_CODES = {
  314: 1, // 山、岳、峰等（3000m以上）
  315: 2, // 山、岳、峰等（1000m以上）
  316: 3, // 山、岳、峰等（1000m未満）
  311: 3, // 山の総称（八ヶ岳・白根山など）
  312: 4, // 山、岳、峰等
  313: 5, // 尖峰、丘、塚等（z14以上）
};
/** 標高点・三角点のvt_code。vt_textに標高が入る */
const ELEV_CODES = new Set([7101, 7102, 7201, 7221]);

/** 山名の位置から山頂（標高点・三角点）を探す半径[m] */
const SNAP_RADIUS_M = Number(process.env.PEAK_SNAP_R ?? 1500);
/**
 * 山頂候補の評価で、山名の位置からの距離1mあたりに差し引く標高[m]。
 * 「高い点ほど山頂らしいが、遠い点ほど別の山の頂らしい」の釣り合い
 */
const SNAP_DISTANCE_PENALTY = Number(process.env.PEAK_SNAP_K ?? 0.3);
/** 標高点が無いときにDEMで最高点を探す半径[m] */
const DEM_SNAP_RADIUS_M = 300;
/** 同じ山名をひとつにまとめる距離[m] */
const DEDUPE_RADIUS_M = 2000;
/** 1003山と山名を照合する距離[m] */
const MATCH_1003_RADIUS_M = 3000;

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const CACHE_DIR = argValue('--cache') ?? path.join(os.tmpdir(), 'ecorismap-peaks-cache');
const DETAIL = args.includes('--detail');

// ---------- 座標ユーティリティ ----------

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
function distanceM(lon1, lat1, lon2, lat2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = toRad(lat);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}
/** タイル内のピクセル位置（小数）→ 緯度経度 */
function pixelToLonLat(z, x, y, px, py, size) {
  const n = 2 ** z;
  const lon = ((x + px / size) / n) * 360 - 180;
  const yy = (y + py / size) / n;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * yy))) * 180) / Math.PI;
  return { lon, lat };
}

/** 近傍検索用の格子インデックス（0.05°≒5km） */
class GridIndex {
  constructor(cellDeg = 0.05) {
    this.cell = cellDeg;
    this.map = new Map();
  }
  key(cx, cy) {
    return `${cx},${cy}`;
  }
  add(item) {
    const k = this.key(Math.floor(item.lon / this.cell), Math.floor(item.lat / this.cell));
    const list = this.map.get(k);
    if (list) list.push(item);
    else this.map.set(k, [item]);
  }
  near(lon, lat, radiusM) {
    const span = Math.ceil(radiusM / 111000 / this.cell / Math.cos(toRad(lat))) + 1;
    const cx = Math.floor(lon / this.cell);
    const cy = Math.floor(lat / this.cell);
    const out = [];
    for (let dx = -span; dx <= span; dx++) {
      for (let dy = -span; dy <= span; dy++) {
        const list = this.map.get(this.key(cx + dx, cy + dy));
        if (!list) continue;
        for (const item of list) {
          if (distanceM(lon, lat, item.lon, item.lat) <= radiusM) out.push(item);
        }
      }
    }
    return out;
  }
}

// ---------- 取得（キャッシュ付き） ----------

async function pool(items, worker) {
  let next = 0;
  let done = 0;
  const results = new Array(items.length);
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
      done++;
      if (done % 500 === 0) console.log(`  ${done}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
  return results;
}

async function withRetry(fn, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 4) throw new Error(`${label}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const bvmap = new PMTiles(BVMAP_URL);

/**
 * 1タイルから山名と標高点を抜き出す。結果はキャッシュする（タイルが無ければnull）。
 * @returns {{names: object[], elevs: object[]} | null}
 */
async function extractTile(z, x, y) {
  const file = path.join(CACHE_DIR, `z${z}`, `${x}_${y}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const tile = await withRetry(() => bvmap.getZxy(z, x, y), `tile ${z}/${x}/${y}`);
  let result = null;
  if (tile) {
    result = { names: [], elevs: [] };
    const layer = new VectorTile(new PbfReader(new Uint8Array(tile.data))).layers.Anno;
    for (let i = 0; layer && i < layer.length; i++) {
      const feature = layer.feature(i);
      const { vt_code: code, vt_text: text } = feature.properties;
      if (feature.type !== 1 || typeof text !== 'string') continue;
      const isName = NAME_CODES[code] !== undefined;
      if (!isName && !ELEV_CODES.has(code)) continue;
      const [lon, lat] = feature.toGeoJSON(x, y, z).geometry.coordinates;
      const p = { lon: round6(lon), lat: round6(lat), code };
      if (isName) result.names.push({ ...p, text: text.trim() });
      else {
        const ele = parseFloat(text);
        if (Number.isFinite(ele)) result.elevs.push({ ...p, ele });
      }
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result));
  return result;
}
const round6 = (v) => Math.round(v * 1e6) / 1e6;

/** 指定ズームで日本の範囲にあるタイルを全部調べる（無いタイルはnull） */
async function scanZoom(z, candidates) {
  const tiles = candidates ?? bboxTiles(z);
  console.log(`z${z}: ${tiles.length}タイルを走査`);
  const results = await pool(tiles, ({ x, y }) => extractTile(z, x, y));
  return tiles.map((t, i) => ({ ...t, z, data: results[i] })).filter((t) => t.data !== null);
}
function bboxTiles(z) {
  const nw = lonLatToTile(BBOX.west, BBOX.north, z);
  const se = lonLatToTile(BBOX.east, BBOX.south, z);
  const tiles = [];
  for (let x = nw.x; x <= se.x; x++) for (let y = nw.y; y <= se.y; y++) tiles.push({ x, y });
  return tiles;
}
function childTiles(parents, levels) {
  const k = 2 ** levels;
  const out = [];
  for (const p of parents) {
    for (let dx = 0; dx < k; dx++) for (let dy = 0; dy < k; dy++) out.push({ x: p.x * k + dx, y: p.y * k + dy });
  }
  return out;
}

// ---------- DEM ----------

const demCache = new Map();
async function loadDemTile(x, y) {
  const key = `${x}/${y}`;
  if (demCache.has(key)) return demCache.get(key);
  const file = path.join(CACHE_DIR, `dem${DEM_ZOOM}`, `${x}_${y}.bin`);
  let heights = null;
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    heights = buf.length === 0 ? null : new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  } else {
    const url = DEM_URL.replace('{z}', DEM_ZOOM).replace('{x}', x).replace('{y}', y);
    const res = await withRetry(() => fetch(url), `dem ${key}`);
    if (res.ok) {
      const png = decodePng(new Uint8Array(await res.arrayBuffer()));
      const ch = png.channels;
      heights = new Float32Array(png.width * png.height);
      for (let i = 0; i < heights.length; i++) {
        // 地理院の標高PNG: x=R*2^16+G*2^8+B。2^23は欠測、2^23超は負の標高
        const v = png.data[i * ch] * 65536 + png.data[i * ch + 1] * 256 + png.data[i * ch + 2];
        heights[i] = v === 8388608 ? NaN : (v < 8388608 ? v : v - 16777216) * 0.01;
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, heights ? Buffer.from(heights.buffer) : Buffer.alloc(0));
  }
  demCache.set(key, heights);
  if (demCache.size > 2000) demCache.delete(demCache.keys().next().value);
  return heights;
}

/** 半径内のDEM最高点。DEMが無ければnull */
async function demMaxNear(lon, lat, radiusM) {
  const size = 256;
  const n = 2 ** DEM_ZOOM;
  const dLat = radiusM / 111000;
  const dLon = dLat / Math.cos(toRad(lat));
  const fx = (lo) => ((lo + 180) / 360) * n * size;
  const fy = (la) => ((1 - Math.log(Math.tan(toRad(la)) + 1 / Math.cos(toRad(la))) / Math.PI) / 2) * n * size;
  const x0 = Math.floor(fx(lon - dLon));
  const x1 = Math.ceil(fx(lon + dLon));
  const y0 = Math.floor(fy(lat + dLat));
  const y1 = Math.ceil(fy(lat - dLat));
  let best = null;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const tx = Math.floor(gx / size);
      const ty = Math.floor(gy / size);
      const heights = await loadDemTile(tx, ty);
      if (!heights) continue;
      const h = heights[(gy - ty * size) * size + (gx - tx * size)];
      if (!Number.isFinite(h)) continue;
      const p = pixelToLonLat(DEM_ZOOM, tx, ty, gx - tx * size + 0.5, gy - ty * size + 0.5, size);
      if (distanceM(lon, lat, p.lon, p.lat) > radiusM) continue;
      if (best === null || h > best.ele) best = { lon: p.lon, lat: p.lat, ele: h };
    }
  }
  return best;
}

// ---------- 山頂補正 ----------

/**
 * 山名を山頂の標高点・三角点へ寄せる。
 *
 * 候補は「標高 − 距離×SNAP_DISTANCE_PENALTY」で評価する。ただし1つの標高点を
 * 複数の山名が取り合わないようにする（隣の高い峰に小さな峰の名前が吸い寄せられ、
 * 同じ山頂に名前が2つ並ぶのを防ぐ）。最良の候補が近い山名から順に確定させる。
 * 山の総称（八ヶ岳など）は山塊の最高点に置けばよく、他の峰の邪魔はしないので取り合いから外す
 */
async function snapToSummits(peaks, elevIndex) {
  const plans = peaks.map((p) => {
    const candidates = elevIndex
      .near(p.lon, p.lat, SNAP_RADIUS_M)
      .map((e) => {
        const d = distanceM(p.lon, p.lat, e.lon, e.lat);
        return { e, d, score: e.ele - d * SNAP_DISTANCE_PENALTY };
      })
      .sort((a, b) => b.score - a.score);
    return { p, candidates };
  });
  plans.sort((a, b) => (a.candidates[0]?.d ?? Infinity) - (b.candidates[0]?.d ?? Infinity));
  const claimed = new Set();
  const needDem = [];
  let elev = 0;
  for (const { p, candidates } of plans) {
    const shared = p.code === 311;
    const pick = candidates.find((c) => shared || !claimed.has(c.e));
    if (!pick) {
      needDem.push(p);
      continue;
    }
    if (!shared) claimed.add(pick.e);
    Object.assign(p, { lon: pick.e.lon, lat: pick.e.lat, ele: pick.e.ele });
    elev++;
  }
  let dem = 0;
  await pool(needDem, async (p) => {
    const top = await demMaxNear(p.lon, p.lat, DEM_SNAP_RADIUS_M);
    if (top) {
      Object.assign(p, { lon: top.lon, lat: top.lat, ele: top.ele });
      dem++;
    }
  });
  return { elev, dem };
}

// ---------- 1003山 ----------

/**
 * 「山名＜山頂名＞」「山名（別名）」を分解する。
 * 表示名は、同じ山名の山頂が複数あるとき（大雪山＜旭岳＞＜黒岳＞…）は山頂名、
 * ひとつだけのとき（富士山＜剣ヶ峯＞）は山名にする
 */
function parseMountainName(raw) {
  const summitMatch = raw.match(/^(.*?)＜(.*?)＞$/);
  const main = summitMatch ? summitMatch[1] : raw;
  const summit = summitMatch ? summitMatch[2] : null;
  const strip = (s) => s.replace(/（.*?）/g, '').trim();
  const aliases = new Set();
  for (const part of [main, summit]) {
    if (!part) continue;
    aliases.add(strip(part));
    for (const m of part.matchAll(/（(.*?)）/g)) aliases.add(m[1].trim());
  }
  return { main: strip(main), summit: summit ? strip(summit) : null, aliases: [...aliases].filter(Boolean) };
}

/**
 * www.gsi.go.jpはTLSの旧式の再ネゴシエーションを要求し、Nodeのfetchでは接続できない。
 * このサーバーへの取得だけ、それを許可したhttpsリクエストで行う
 */
function fetchLegacyTls(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

async function load1003() {
  const body = await withRetry(() => fetchLegacyTls(MOUNTAINS_CSV_URL), '1003山CSV');
  const text = new TextDecoder('shift_jis').decode(body);
  const rows = text.split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(','));
  const mountains = rows.map((c) => ({
    ...parseMountainName(c[2]),
    ele: parseFloat(c[4]),
    lat: parseFloat(c[7]),
    lon: parseFloat(c[8]),
  }));
  const mainCount = new Map();
  for (const m of mountains) mainCount.set(m.main, (mainCount.get(m.main) ?? 0) + 1);
  for (const m of mountains) m.display = m.summit && mainCount.get(m.main) > 1 ? m.summit : m.main;
  return mountains.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon) && Number.isFinite(m.ele));
}

// ---------- 組み立て ----------

async function main() {
  console.log(`キャッシュ: ${CACHE_DIR}`);
  // z10: 小縮尺に載る主要な山（314〜316）をランク付けに使う
  const z10 = await scanZoom(10);
  // z11: 山名（311/312）と標高点の本体。z10に実在するタイルの子だけ調べる
  const z11 = await scanZoom(11, childTiles(z10, 1));

  const elevIndex = new GridIndex();
  const rawNames = [];
  for (const t of z10) for (const n of t.data.names) rawNames.push({ ...n, zoom: 10 });
  for (const t of z11) {
    for (const n of t.data.names) rawNames.push({ ...n, zoom: 11 });
    for (const e of t.data.elevs) elevIndex.add(e);
  }

  if (DETAIL) {
    // 山名があるか、500m以上の標高点があるz11タイルの範囲だけz14を取る（全域は重すぎる）
    const mountainous = z11.filter((t) => t.data.names.length > 0 || t.data.elevs.some((e) => e.ele >= 500));
    const z14 = await scanZoom(14, childTiles(mountainous, 3));
    for (const t of z14) {
      for (const n of t.data.names) rawNames.push({ ...n, zoom: 14 });
      for (const e of t.data.elevs) elevIndex.add(e);
    }
  }
  console.log(`山名(重複込み): ${rawNames.length}`);

  // 同じ山名をまとめる。ランクは最も重要なもの、位置は最も詳細なズームのもの
  const nameIndex = new GridIndex();
  const peaks = [];
  rawNames.sort((a, b) => b.zoom - a.zoom); // 詳細なズームを先に登録して位置の基準にする
  for (const n of rawNames) {
    const rank = NAME_CODES[n.code];
    // z10の山名は文字位置が山頂から数kmずれることがあるので広めに照合する
    const radius = n.zoom === 10 ? DEDUPE_RADIUS_M * 2.5 : DEDUPE_RADIUS_M;
    const same = nameIndex.near(n.lon, n.lat, radius).find((p) => p.name === n.text);
    if (same) {
      same.rank = Math.min(same.rank, rank);
      continue;
    }
    const peak = { name: n.text, lon: n.lon, lat: n.lat, rank, code: n.code, ele: null, source: 'bvmap' };
    peaks.push(peak);
    nameIndex.add(peak);
  }
  console.log(`山名(統合後): ${peaks.length}`);

  // 山頂へ寄せる: 近くの標高点・三角点 → 無ければDEMの最高点
  const { elev: snappedElev, dem: snappedDem } = await snapToSummits(peaks, elevIndex);
  console.log(`山頂補正: 標高点 ${snappedElev} / DEM ${snappedDem} / 補正なし ${peaks.length - snappedElev - snappedDem}`);

  // 1003山で置き換える（位置の検証もここで行う）
  const mountains = await load1003();
  const errors = [];
  let added = 0;
  for (const m of mountains) {
    const match = nameIndex
      .near(m.lon, m.lat, MATCH_1003_RADIUS_M)
      .filter((p) => m.aliases.includes(p.name) || p.name === m.display)
      .sort((a, b) => distanceM(m.lon, m.lat, a.lon, a.lat) - distanceM(m.lon, m.lat, b.lon, b.lat))[0];
    if (match) {
      errors.push({ name: m.display, d: distanceM(m.lon, m.lat, match.lon, match.lat) });
      Object.assign(match, {
        name: m.display,
        lon: m.lon,
        lat: m.lat,
        ele: m.ele,
        rank: Math.min(match.rank, m.ele >= 3000 ? 1 : 2),
        source: '1003',
      });
    } else {
      const peak = { name: m.display, lon: m.lon, lat: m.lat, ele: m.ele, rank: m.ele >= 3000 ? 1 : 2, source: '1003' };
      peaks.push(peak);
      nameIndex.add(peak);
      added++;
    }
  }
  reportErrors(errors, mountains.length, added);

  // 標高が取れなかった山（DEMの範囲外など）は落とす。眺望では高さが無いと置けない。
  // 寄せた結果、同じ山名が近くに重なったもの（総称と山頂名がどちらも「富士山」など）は1つにする
  const finalIndex = new GridIndex();
  const finalPeaks = [];
  for (const p of peaks
    .filter((p) => p.ele !== null && Number.isFinite(p.ele))
    .sort((a, b) => a.rank - b.rank || b.ele - a.ele)) {
    if (finalIndex.near(p.lon, p.lat, DEDUPE_RADIUS_M).some((q) => q.name === p.name)) continue;
    finalIndex.add(p);
    finalPeaks.push(p);
  }
  const rows = finalPeaks
    .map((p) => [Math.round(p.lon * 1e5) / 1e5, Math.round(p.lat * 1e5) / 1e5, Math.round(p.ele), p.name, p.rank]);

  const out = {
    attribution: ATTRIBUTION,
    generatedAt: new Date().toISOString().slice(0, 10),
    fields: ['lon', 'lat', 'ele', 'name', 'rank'],
    rows,
  };
  const json = JSON.stringify(out);
  fs.writeFileSync(OUT_FILE, json);
  const rankCount = {};
  for (const r of rows) rankCount[r[4]] = (rankCount[r[4]] ?? 0) + 1;
  console.log(`出力: ${OUT_FILE}`);
  console.log(`  ${rows.length}件 ${(json.length / 1024).toFixed(0)}KB ランク別 ${JSON.stringify(rankCount)}`);
}

/** 1003山の山頂と、ベクトルタイルから寄せた位置とのずれ（補正方法の検証用） */
function reportErrors(errors, total, added) {
  const ds = errors.map((e) => e.d).sort((a, b) => a - b);
  const q = (r) => ds[Math.min(ds.length - 1, Math.floor(ds.length * r))] ?? NaN;
  console.log(`1003山: 照合 ${errors.length}/${total}（未照合で追加 ${added}）`);
  console.log(
    `  山頂とのずれ[m] 中央値 ${q(0.5).toFixed(0)} / 90% ${q(0.9).toFixed(0)} / 95% ${q(0.95).toFixed(0)} / 最大 ${q(1).toFixed(0)}`
  );
  const far = errors.filter((e) => e.d > 100).sort((a, b) => b.d - a.d);
  console.log(`  100m超: ${far.length}件 ${far.slice(0, 15).map((e) => `${e.name}(${e.d.toFixed(0)})`).join(' ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
