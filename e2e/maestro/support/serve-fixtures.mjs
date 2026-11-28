#!/usr/bin/env node
// ネイティブのE2E（e2e/maestro/smoke/20-maps-pmtiles.yaml・21-maps-offline.yaml）が読む地図を、Mac から配信する。
//
//   node e2e/maestro/support/serve-fixtures.mjs [ポート（既定 8765）]
//
// - /raster.pmtiles      1色（マゼンタ）のラスタ。ズーム0〜14の全タイルが同じ1枚（その場で組み立てる。
//                        e2e/web/specs/15-map-gps-pmtiles.spec.ts の buildRasterPmtiles と同じ作り）
// - /vegetation.pmtiles  ベクタ（e2e/web/fixtures/vegetation.pmtiles）
// - /tiles/{z}/{x}/{y}.png  どのタイルも同じ1色（マゼンタ）のラスタ（オフライン用のダウンロードの確認に使う。外へは通信しない）
// - /slowtiles/{z}/{x}/{y}.png  同じタイルを 0.4 秒遅らせて返す（ダウンロード中の進捗の表示を確かめられるようにする）
// Range リクエストに 206 で応え、要求を1行ずつ標準出力に出す（「GET /raster.pmtiles bytes=0-16383 -> 206」）。
// タイルの範囲（raster は 127 バイトより後ろ、vegetation は 731 バイトより後ろ）の要求が出ていれば、アプリがタイルを読んでいる。
// iOSシミュレーターからは http://localhost:8765/… 、Androidエミュレーターからは adb reverse tcp:8765 tcp:8765 のうえで同じURLで届く。
// フローからも確かめられるよう、受けた要求の一覧を返す口がある:
//   GET /_requests  これまでの要求（JSON。{ path, start, end, status } の配列。Range なしは start・end が null）
//   GET /_reset     一覧を空にする
// 止めるときは Ctrl+C。ファイルはメモリから配るので、リポジトリにも一時ディレクトリにも何も書かない。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] ?? 8765);
const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/fixtures');
const RASTER_MAX_ZOOM = 14;

/** 256pxを1色（マゼンタ）で塗ったPNG */
const magentaPng = () => {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr[8] = 8; // 8bit
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(256 * 3, Buffer.from([0xff, 0x00, 0xff]))]);
  const raw = Buffer.concat(Array.from({ length: 256 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/** ラスタのPMTiles（v3・無圧縮）。タイル番号0から連続する全タイルを、1つのエントリの run length でまとめる */
const buildRasterPmtiles = (png) => {
  const varint = (value) => {
    const bytes = [];
    let rest = value;
    while (rest >= 0x80) {
      bytes.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    bytes.push(rest);
    return bytes;
  };
  const tileCount = (4 ** (RASTER_MAX_ZOOM + 1) - 1) / 3;
  // エントリ数、タイル番号（差分）、run length、長さ、位置+1
  const directory = Buffer.from([...varint(1), ...varint(0), ...varint(tileCount), ...varint(png.length), ...varint(1)]);
  const metadata = Buffer.from('{}');
  const header = Buffer.alloc(127);
  header.write('PMTiles', 0, 'latin1');
  header[7] = 3;
  const u64 = (position, value) => header.writeBigUInt64LE(BigInt(value), position);
  const tileDataOffset = header.length + directory.length + metadata.length;
  u64(8, header.length); // ルートディレクトリ
  u64(16, directory.length);
  u64(24, header.length + directory.length); // メタデータ
  u64(32, metadata.length);
  u64(40, tileDataOffset); // リーフディレクトリ（なし）
  u64(48, 0);
  u64(56, tileDataOffset); // タイル
  u64(64, png.length);
  u64(72, tileCount);
  u64(80, 1);
  u64(88, 1);
  header[96] = 1; // clustered
  header[97] = 1; // ディレクトリ・メタデータは無圧縮
  header[98] = 1; // タイルは無圧縮
  header[99] = 2; // PNG
  header[100] = 0;
  header[101] = RASTER_MAX_ZOOM;
  header.writeInt32LE(-180 * 1e7, 102);
  header.writeInt32LE(-85 * 1e7, 106);
  header.writeInt32LE(180 * 1e7, 110);
  header.writeInt32LE(85 * 1e7, 114);
  return Buffer.concat([header, directory, metadata, png]);
};

const tilePng = magentaPng();
const files = {
  '/raster.pmtiles': buildRasterPmtiles(tilePng),
  '/vegetation.pmtiles': fs.readFileSync(path.join(FIXTURES, 'vegetation.pmtiles')),
};

const requests = [];

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': 'content-range, content-length, etag',
};

http
  .createServer((request, response) => {
    const url = (request.url ?? '').split('?')[0];
    if (url === '/_requests' || url === '/_reset') {
      if (url === '/_reset') requests.length = 0;
      response.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(JSON.stringify(requests));
      return;
    }
    const body = /^\/(slow)?tiles\/\d+\/\d+\/\d+\.png$/.test(url) ? tilePng : files[url];
    const delay = url.startsWith('/slowtiles/') ? 400 : 0;
    const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? '');
    const start = range === null ? null : Number(range[1]);
    const end = range === null || body === undefined ? null : Math.min(range[2] === '' ? body.length - 1 : Number(range[2]), body.length - 1);
    const log = (status) => {
      requests.push({ path: url, start, end, status });
      console.log(`${request.method} ${url} ${request.headers.range ?? '-'} -> ${status}`);
    };
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors).end();
      return;
    }
    if (body === undefined) {
      log(404);
      response.writeHead(404, cors).end();
      return;
    }
    const base = { ...cors, 'content-type': body === tilePng ? 'image/png' : 'application/octet-stream', 'accept-ranges': 'bytes', etag: '"e2e"' };
    if (start === null || end === null) {
      log(200);
      setTimeout(() => {
        response.writeHead(200, { ...base, 'content-length': body.length });
        response.end(request.method === 'HEAD' ? undefined : body);
      }, delay);
      return;
    }
    if (start > end) {
      log(416);
      response.writeHead(416, { ...base, 'content-range': `bytes */${body.length}` }).end();
      return;
    }
    log(206);
    response.writeHead(206, {
      ...base,
      'content-range': `bytes ${start}-${end}/${body.length}`,
      'content-length': end - start + 1,
    });
    response.end(request.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
  })
  .listen(PORT, () =>
    console.log(`配信中: http://localhost:${PORT}/raster.pmtiles , /vegetation.pmtiles , /tiles/{z}/{x}/{y}.png , /slowtiles/…`)
  );
