/**
 * Web版のPDF出力でPMTiles・pbfを画像にする（PDF.web.tsからのみ使う）。
 * 印刷用ウィンドウは別documentなので、画像はdataURLで渡す。
 * pmtiles://プロトコルは地図表示（Home.web.tsx）がmaplibreへ登録済みのものを使う
 */
import maplibregl, { StyleSpecification } from 'maplibre-gl';
import * as pmtiles from 'pmtiles';
import { TileMapType } from '../../types';
import { TileSignaturesType, withTileSignature } from '../TileSignature';
import { getPmtilesSource, getVectorLayerStyles, VECTOR_GLYPHS_URL } from '../vectorTileStyle';
import { getVectorChunkView, PdfTileRequest } from './tiles';

const MIME_TYPES: { [type: number]: string } = {
  [pmtiles.TileType.Png]: 'image/png',
  [pmtiles.TileType.Jpeg]: 'image/jpeg',
  [pmtiles.TileType.Webp]: 'image/webp',
  [pmtiles.TileType.Avif]: 'image/avif',
};

//地図が1チャンクを描き終わるまでの上限。超えたら描けた分で進める（全体は止めない）
const VECTOR_RENDER_TIMEOUT_MS = 30000;
//描画の解像度。モバイル（512pxで描いたタイルを256px枠に貼る）とそろえる
const VECTOR_PIXEL_RATIO = 2;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * ラスタPMTilesのタイル画像を取り出す読み込み関数を作る。アーカイブは地図ごとに1回だけ開く
 */
export const createRasterPmtileLoader = (signatures: TileSignaturesType) => {
  const archives = new Map<string, { pmtile: pmtiles.PMTiles; mimeType: Promise<string> }>();
  const open = (map: TileMapType) => {
    let archive = archives.get(map.id);
    if (archive === undefined) {
      const pmtile = new pmtiles.PMTiles(withTileSignature(map.url, signatures).replace('pmtiles://', ''));
      const mimeType = pmtile.getHeader().then((header) => MIME_TYPES[header.tileType] ?? 'image/png');
      archive = { pmtile, mimeType };
      archives.set(map.id, archive);
    }
    return archive;
  };
  return async (tile: PdfTileRequest): Promise<string | undefined> => {
    try {
      const { pmtile, mimeType } = open(tile.map);
      const response = await pmtile.getZxy(tile.z, tile.x, tile.y);
      if (response === undefined) return undefined;
      return await blobToDataUrl(new Blob([response.data], { type: await mimeType }));
    } catch (e) {
      // 1タイルの取得失敗でPDF全体の生成を止めない
      return undefined;
    }
  };
};

//maplibreの非公開状態。ラベル配置は1フレームあたりの時間で区切って進むため、終わったかを見る
const isPlacementPending = (map: maplibregl.Map) =>
  (map as unknown as { _placementDirty?: boolean })._placementDirty === true;

/**
 * タイルとラベル配置が揃うまで同期描画（redraw）を繰り返す。
 * maplibre任せの描画ループ（idleイベント）はrequestAnimationFrameに頼るため、フレームを待たずに描く。
 * タイルの読み込みはredrawが要求し、届いたら'data'イベントで次の描画に進む
 */
const renderUntilLoaded = async (map: maplibregl.Map) => {
  const deadline = Date.now() + VECTOR_RENDER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    map.redraw();
    if (map.loaded() && map.areTilesLoaded() && !isPlacementPending(map)) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        map.off('data', done);
        resolve();
      };
      const timer = setTimeout(done, 200);
      map.on('data', done);
    });
  }
};

/**
 * 1つのベクタ地図の分割画像を、画面外に置いた非表示のmaplibreで順に描いて切り抜く。
 * スタイルは地図表示と同じもの（vectorTileStyle.ts）を使う。
 * 分割の境目は周囲を余分に描いてから切り抜くので、境目にかかるラベルも両側で描かれる。
 * ただしラベルの配置は描く範囲ごとに決まるため、境目付近で片側だけ位置がずれる・消えることはあり得る
 */
const renderVectorMapChunks = async (
  map: TileMapType,
  chunks: PdfTileRequest[],
  frameOrigin: { x: number; y: number },
  signatures: TileSignaturesType,
  renderWindow: Window
): Promise<(string | undefined)[]> => {
  const source = getPmtilesSource(map, signatures);
  const layers = await getVectorLayerStyles(map, signatures);
  if (source === undefined || layers.length === 0 || chunks.length === 0) return chunks.map(() => undefined);

  const first = getVectorChunkView(chunks[0], frameOrigin);
  //地図は前面にあるウィンドウ（印刷用ウィンドウ）の中に置く。印刷用ウィンドウが前面に出ると地図のタブは
  //非表示になり、ブラウザがそのタブのrequestAnimationFrameを止める。maplibreはスタイルやソースの読み込み開始を
  //置かれたウィンドウのrequestAnimationFrameで待つため、地図のタブに置くと読み込みが始まらず何も描かれない
  const renderDocument = renderWindow.document;
  const container = renderDocument.createElement('div');
  container.style.cssText = `position: fixed; left: -100000px; top: 0; width: ${first.size}px; height: ${first.size}px;`;
  renderDocument.body.appendChild(container);
  const style: StyleSpecification = {
    version: 8,
    glyphs: VECTOR_GLYPHS_URL,
    sources: { [map.id]: source },
    layers,
  };
  const maplibreMap = new maplibregl.Map({
    container,
    style,
    center: first.center,
    zoom: first.zoom,
    interactive: false,
    attributionControl: false,
    pixelRatio: VECTOR_PIXEL_RATIO,
    fadeDuration: 0,
    //描画後にキャンバスを読み出すため
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  try {
    const results: (string | undefined)[] = [];
    for (const chunk of chunks) {
      const view = getVectorChunkView(chunk, frameOrigin);
      maplibreMap.jumpTo({ center: view.center, zoom: view.zoom });
      await renderUntilLoaded(maplibreMap);
      results.push(cropCanvas(maplibreMap.getCanvas(), view.size, view.crop));
    }
    return results;
  } catch (e) {
    console.error('renderVectorMapChunks', e);
    return chunks.map(() => undefined);
  } finally {
    maplibreMap.remove();
    container.remove();
  }
};

const cropCanvas = (
  canvas: HTMLCanvasElement,
  cssSize: number,
  crop: { left: number; top: number; width: number; height: number }
) => {
  //maxCanvasSizeを超えるとmaplibreが解像度を下げるので、実際の比率で切り抜く
  const ratio = canvas.width / cssSize;
  const output = document.createElement('canvas');
  output.width = Math.round(crop.width * ratio);
  output.height = Math.round(crop.height * ratio);
  const context = output.getContext('2d');
  if (context === null) return undefined;
  context.drawImage(
    canvas,
    crop.left * ratio,
    crop.top * ratio,
    output.width,
    output.height,
    0,
    0,
    output.width,
    output.height
  );
  return output.toDataURL('image/png');
};

/**
 * ベクタ地図の分割画像（listPdfTilesが並べたもの）を描く。地図ごとにまとめて描き、入力と同じ順で返す
 */
export const renderVectorChunks = async (
  chunks: PdfTileRequest[],
  frameOrigin: { x: number; y: number },
  signatures: TileSignaturesType,
  renderWindow: Window
): Promise<(string | undefined)[]> => {
  const results = new Array<string | undefined>(chunks.length);
  const mapIds = [...new Set(chunks.map((c) => c.map.id))];
  for (const mapId of mapIds) {
    const indexes = chunks.flatMap((c, i) => (c.map.id === mapId ? [i] : []));
    //スタイル取得や地図の作成に失敗しても、その地図を欠けさせるだけでPDF全体は止めない
    const rendered = await renderVectorMapChunks(
      chunks[indexes[0]].map,
      indexes.map((i) => chunks[i]),
      frameOrigin,
      signatures,
      renderWindow
    ).catch((e) => {
      console.error('renderVectorChunks', e);
      return indexes.map(() => undefined);
    });
    indexes.forEach((chunkIndex, k) => (results[chunkIndex] = rendered[k]));
  }
  return results;
};
