import { ArrowStyleType, DataType, LayerType, RecordType } from '../../types';
import {
  generateLabel,
  getColor,
  getLineWidth,
  getLineWidthAtZoom,
  getMapMemoSymbolScaleAtZoom,
  SYMBOL_BASE_SIZE_PX,
  SYMBOL_BASE_ZOOM,
} from '../Layer';
import { escapeXml, isBrushTool, isLocationType, isLocationTypeArray } from '../General';
import { interpolateLineString, latLonObjectsToLatLonArray } from '../Coords';
import { projectAllToPixel, projectToPixel, TileFrame } from './geometry';

/**
 * PDFのSVGはタイルピクセル座標で描き、HTML側でtileScale倍に拡大して用紙に載せる。
 * 大きさ（線幅・文字・記号）は「用紙上のpx」で決めたいので、描くときにpx()でタイルピクセルへ戻す。
 * zoomは用紙の縮尺に相当する地図のズーム（getEquivalentZoom）。地図画面と同じズーム連動の計算に使う。
 */
export type SvgContext = {
  frame: TileFrame;
  tileScale: number;
  zoom: number;
};

type Pixel = { pixelX: number; pixelY: number };

const px = (ctx: SvgContext, paperPixel: number) => paperPixel / ctx.tileScale;

//白縁取り付きの文字。フチの太さも用紙上のpxで揃える
const haloText = (ctx: SvgContext, x: number, y: number, color: string, label: string) =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${px(ctx, 12)}" font-family="Arial" text-anchor="start" ` +
  `stroke="white" stroke-width="${px(ctx, 0.2)}" paint-order="stroke">${escapeXml(label)}</text>`;

/**
 * スタンプ記号（20x20のviewBox）。地図表示のStampSymbol（components/organisms/HomeStampSymbol.tsx）と同じ図形。
 * 地図側の記号を変えたらここも合わせる
 */
const KOUBI_STAR_POINTS =
  '10.00,3.67 11.57,8.51 16.66,8.51 12.54,11.49 14.11,16.33 10.00,13.34 5.89,16.33 7.46,11.49 3.34,8.51 8.43,8.51';

export const stampSymbolMarkup = (stamp: string, c: string): string | undefined => {
  switch (stamp) {
    case 'TOMARI':
      return `<circle cx="10" cy="10" r="4" stroke="#ffffffaa" stroke-width="1" fill="${c}" />`;
    case 'KARI':
      return (
        `<circle cx="10" cy="10" r="7" stroke="${c}" stroke-width="1" fill="#ffffffaa" />` +
        `<line x1="5" y1="5" x2="15" y2="15" stroke="${c}" stroke-width="1.5" />` +
        `<line x1="15" y1="5" x2="5" y2="15" stroke="${c}" stroke-width="1.5" />`
      );
    case 'HOVERING':
      return (
        `<circle cx="10" cy="10" r="7" stroke="${c}" stroke-width="1" fill="#ffffffaa" />` +
        `<text x="10" y="14" font-family="Arial" font-size="11" font-weight="bold" fill="${c}" text-anchor="middle">H</text>`
      );
    case 'VOICE':
      return (
        `<circle cx="10" cy="10" r="8" stroke="${c}" stroke-width="1" fill="#ffffffaa" />` +
        `<text x="10" y="15" font-family="Arial" font-size="11" font-weight="bold" fill="${c}" text-anchor="middle">Vo</text>`
      );
    case 'KOUBI':
      return `<polygon points="${KOUBI_STAR_POINTS}" stroke="${c}" stroke-width="0" fill="${c}" />`;
    case 'SQUARE':
      return `<rect x="4" y="4" width="12" height="12" stroke="${c}" stroke-width="2" fill="${c}" />`;
    case 'CIRCLE':
      return `<circle cx="10" cy="10" r="6" stroke="${c}" stroke-width="3" fill="${c}" />`;
    case 'TRIANGLE':
      return `<polygon points="10,3.68 2,18 18,18" stroke="${c}" stroke-width="0" fill="${c}" />`;
    default:
      return undefined;
  }
};

/**
 * ブラシ記号（20x20のviewBox）。地図表示のBrushSymbol（components/organisms/HomeBrushSymbol.tsx）と同じ図形
 */
export const brushSymbolMarkup = (strokeStyle: string, c: string): string | undefined => {
  switch (strokeStyle) {
    case 'PLUS':
      return `<path d="M5,10 L15,10" stroke="${c}" stroke-width="1.5" fill="none" />`;
    case 'CROSS':
      return `<path d="M10,10 L20,10" stroke="${c}" stroke-width="1.5" fill="none" />`;
    case 'SENKAI':
      return `<circle cx="15" cy="10" r="4" stroke="${c}" stroke-width="1.5" fill="none" />`;
    case 'SENJYOU':
      return (
        `<circle cx="15" cy="10" r="4" stroke="${c}" stroke-width="1.5" fill="none" />` +
        `<circle cx="15" cy="10" r="2" stroke="${c}" stroke-width="1.5" fill="none" />`
      );
    case 'KOUGEKI':
      return `<polygon points="10,4 20,10 10,16" stroke="${c}" stroke-width="0" fill="${c}" />`;
    case 'DISPLAY1':
      return `<path d="M4,19 L16,13 L4,7 L16,1" stroke="${c}" stroke-width="1.5" fill="none" />`;
    case 'DISPLAY2':
      return `<path d="M16,19 L16,1" stroke="${c}" stroke-width="2" stroke-dasharray="10,10" fill="none" />`;
    case 'KYUKOKA':
      return (
        `<path d="M5 7 L10 2 L15 7" stroke="${c}" stroke-width="1.5" fill="none" />` +
        `<path d="M5 12 L10 7 L15 12" stroke="${c}" stroke-width="1.5" fill="none" />` +
        `<path d="M5 17 L10 12 L15 17" stroke="${c}" stroke-width="1.5" fill="none" />`
      );
    case 'TANJI':
      return (
        `<path d="M10 10 L4 4 V16 L10 10 Z" stroke="${c}" stroke-width="0" fill="${c}" />` +
        `<path d="M10 10 L16 4 V16 L10 10 Z" stroke="${c}" stroke-width="0" fill="${c}" />`
      );
    case 'ESA':
      return `<circle cx="15" cy="10" r="2" stroke="${c}" stroke-width="1.5" fill="${c}" />`;
    case 'SUZAI':
      return `<path d="M10 10 H34" stroke="${c}" stroke-width="2" fill="${c}" />`;
    default:
      return undefined;
  }
};

//viewBoxの中心(10,10)を記録位置に合わせ、boxWidth(用紙px)の大きさで置く。回転は地図のMarker.rotationと同じ向き
const placeSymbol = (
  ctx: SvgContext,
  p: Pixel,
  markup: string,
  size: number,
  angle = 0,
  viewBox = { width: 20, height: 20 }
) => {
  const k = px(ctx, size) / viewBox.height;
  return `<g transform="translate(${p.pixelX},${p.pixelY}) rotate(${angle}) scale(${k}) translate(${-viewBox.width / 2},${
    -viewBox.height / 2
  })">${markup}</g>`;
};

export const generateStampSvg = (feature: RecordType, ctx: SvgContext, color: string, label: string) => {
  if (!isLocationTypeArray(feature.coords) || feature.coords.length === 0) return '';
  const p = projectToPixel(feature.coords[0], ctx.frame);
  const stamp = feature.field._stamp as string;
  const size = SYMBOL_BASE_SIZE_PX * getMapMemoSymbolScaleAtZoom(ctx.zoom);
  switch (stamp) {
    //数字・英字・文字はレイヤのラベル設定の値を描く（地図表示と揃える）
    case 'NUMBERS':
    case 'ALPHABETS':
    case 'TEXT': {
      if (label === '') return '';
      const isText = stamp === 'TEXT';
      const viewBox = isText ? { width: 80, height: 20 } : { width: 20, height: 20 };
      const markup = `<text x="${viewBox.width / 2}" y="${isText ? 15 : 14}" font-family="Arial" font-size="${
        isText ? 12 : 16
      }" font-weight="bold" fill="${color}" text-anchor="middle">${escapeXml(label)}</text>`;
      return placeSymbol(ctx, p, markup, size, 0, viewBox);
    }
    default: {
      const markup = stampSymbolMarkup(stamp, color);
      return markup === undefined ? '' : placeSymbol(ctx, p, markup, size);
    }
  }
};

export const generateBrushSvg = (feature: RecordType, ctx: SvgContext, color: string) => {
  if (!isLocationTypeArray(feature.coords)) return '';
  const markup = brushSymbolMarkup(String(feature.field._strokeStyle ?? ''), color);
  if (markup === undefined) return '';
  //記号の大きさと間隔は地図表示（HomeMapMemoBrush）と同じ計算
  const scale = getMapMemoSymbolScaleAtZoom(ctx.zoom);
  const intervalZoom = scale < 1 ? SYMBOL_BASE_ZOOM : ctx.zoom;
  const size = SYMBOL_BASE_SIZE_PX * scale;
  const points = interpolateLineString(latLonObjectsToLatLonArray(feature.coords), 1 / 2 ** (intervalZoom - 10));
  return points
    .map(({ coordinates, angle }) =>
      placeSymbol(
        ctx,
        projectToPixel({ latitude: coordinates[1], longitude: coordinates[0] }, ctx.frame),
        markup,
        size,
        angle
      )
    )
    .join('');
};

export const generateArrowSvg = (
  pixels: Pixel[],
  color: string,
  strokeWidth: number,
  arrowStyle: ArrowStyleType | undefined,
  ctx: SvgContext
) => {
  if (arrowStyle === 'NONE' || arrowStyle === undefined || pixels.length < 2) return '';
  const p0 = [pixels[0].pixelX, pixels[0].pixelY];
  const p1 = [pixels[1].pixelX, pixels[1].pixelY];
  const p2 = [pixels[pixels.length - 2].pixelX, pixels[pixels.length - 2].pixelY];
  const p3 = [pixels[pixels.length - 1].pixelX, pixels[pixels.length - 1].pixelY];
  // 矢印の向きを計算. 0度が北で時計回り
  const angleEnd = ((Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) * 180) / Math.PI + 360 + 90) % 360;
  const angleStart = ((Math.atan2(p0[1] - p1[1], p0[0] - p1[0]) * 180) / Math.PI + 360 + 90) % 360;

  const scale = px(ctx, Math.sqrt(Math.max(strokeWidth - 1, 0.25)));
  const size = 20 * scale;
  const scaledPath = `M${10 * scale} ${7 * scale} L${5 * scale} ${20 * scale} L${10 * scale} ${18 * scale} L${
    15 * scale
  } ${20 * scale} Z`;
  const arrowAt = (p: number[], angle: number) =>
    `<path d="${scaledPath}" fill="${color}" stroke="white" stroke-width="${px(ctx, 0.2)}" transform="translate(${
      p[0] - size / 2
    },${p[1] - size / 2}) rotate(${angle}, ${size / 2}, ${size / 2})" />`;

  let svg = arrowAt(p3, angleEnd);
  if (arrowStyle === 'ARROW_BOTH') svg += arrowAt(p0, angleStart);
  return svg;
};

export const generatePolyLineSvg = (feature: RecordType, layer: LayerType, ctx: SvgContext, color: string) => {
  if (!isLocationTypeArray(feature.coords) || feature.coords.length < 2) return '';
  //太さは地図表示と同じくズーム連動（マップメモを高ズームで描いた線が縮尺の小さいPDFで極太にならない）
  const strokeWidth = getLineWidthAtZoom(layer, feature, ctx.zoom);
  const pixels = projectAllToPixel(feature.coords, ctx.frame);
  const points = pixels.map((p) => `${p.pixelX},${p.pixelY}`).join(' ');
  const last = pixels[pixels.length - 1];
  return (
    `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="${px(ctx, strokeWidth)}" />` +
    generateArrowSvg(pixels, color, strokeWidth, feature.field._strokeStyle as ArrowStyleType | undefined, ctx) +
    haloText(ctx, last.pixelX + px(ctx, 5), last.pixelY + px(ctx, 5), color, generateLabel(layer, feature))
  );
};

//地図表示（HomeLine）と同じ振り分け: 1点はスタンプ、ブラシ指定は記号の列、それ以外は線
export const generateLineSvg = (feature: RecordType, layer: LayerType, ctx: SvgContext) => {
  if (!isLocationTypeArray(feature.coords) || feature.coords.length === 0) return '';
  const color = getColor(layer, feature);
  if (feature.coords.length === 1) return generateStampSvg(feature, ctx, color, generateLabel(layer, feature) ?? '');
  if (isBrushTool(feature.field._strokeStyle as string)) return generateBrushSvg(feature, ctx, color);
  return generatePolyLineSvg(feature, layer, ctx, color);
};

export const generatePointSvg = (feature: RecordType, layer: LayerType, ctx: SvgContext) => {
  if (!isLocationType(feature.coords)) return '';
  const color = getColor(layer, feature);
  const { pixelX, pixelY } = projectToPixel(feature.coords, ctx.frame);
  return (
    `<circle cx="${pixelX}" cy="${pixelY}" r="${px(ctx, 4)}" style="fill:${color}; stroke:white; stroke-width:${px(
      ctx,
      0.2
    )};"></circle>` + haloText(ctx, pixelX + px(ctx, 8), pixelY + px(ctx, 8), color, generateLabel(layer, feature))
  );
};

export const generatePolygonSvg = (feature: RecordType, layer: LayerType, ctx: SvgContext) => {
  if (!isLocationTypeArray(feature.coords) || feature.coords.length === 0) return '';
  const color = getColor(layer, feature);
  const strokeWidth = getLineWidth(layer, feature);
  const pixels = projectAllToPixel(feature.coords, ctx.frame);
  const toPath = (ps: Pixel[]) => 'M ' + ps.map((p) => `${p.pixelX},${p.pixelY}`).join(' L ') + ' Z';
  let d = toPath(pixels);
  if (feature.holes) {
    Object.values(feature.holes).forEach((hole) => {
      d += ' ' + toPath(projectAllToPixel(hole, ctx.frame));
    });
  }
  const last = pixels[pixels.length - 1];
  const fill = layer.colorStyle.transparency ? 'rgba(0,0,0,0)' : color;
  return (
    `<path d="${d}" fill="${fill}" stroke="${color}" stroke-width="${px(ctx, strokeWidth)}" />` +
    haloText(ctx, last.pixelX + px(ctx, 5), last.pixelY + px(ctx, 5), color, generateLabel(layer, feature))
  );
};

/**
 * 表示中のレイヤ・レコードをSVGにする。地図表示と同じく非表示レコード（visible=false）は描かず、
 * 重なり順も地図と同じ（ポリゴン→ライン→ポイントの順に上へ）にする
 */
export const generateVectorMapSvg = (dataSet: DataType[], layers: LayerType[], ctx: SvgContext) => {
  const parts: Record<'POLYGON' | 'LINE' | 'POINT', string[]> = { POLYGON: [], LINE: [], POINT: [] };
  dataSet.forEach((d) => {
    const layer = layers.find((l) => l.id === d.layerId);
    if (layer === undefined || !layer.visible) return;
    const features = d.data.filter((f) => f.visible);
    if (layer.type === 'POINT') {
      features.forEach((f) => parts.POINT.push(generatePointSvg(f, layer, ctx)));
    } else if (layer.type === 'LINE') {
      features.forEach((f) => parts.LINE.push(generateLineSvg(f, layer, ctx)));
    } else if (layer.type === 'POLYGON') {
      features.forEach((f) => parts.POLYGON.push(generatePolygonSvg(f, layer, ctx)));
    }
  });
  const { width, height } = ctx.frame;
  return (
    `<svg width="${width}px" height="${height}px" style="position: absolute; left: 0; top: 0;">` +
    parts.POLYGON.join('') +
    parts.LINE.join('') +
    parts.POINT.join('') +
    '</svg>'
  );
};
