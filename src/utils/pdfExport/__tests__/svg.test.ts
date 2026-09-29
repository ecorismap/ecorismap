import { DataType, LayerType, RecordType } from '../../../types';
import { getTileFrame, projectToPixel } from '../geometry';
import { generateLineSvg, generatePointSvg, generateVectorMapSvg, SvgContext } from '../svg';

const center = { latitude: 35, longitude: 135 };
const region = { minLon: 134.99, minLat: 34.99, maxLon: 135.01, maxLat: 35.01 };
const ctx: SvgContext = { frame: getTileFrame(region, 16), tileScale: 2, zoom: 16 };

const layer = (props: Partial<LayerType>): LayerType => ({
  id: 'L',
  name: 'layer',
  type: 'LINE',
  permission: 'PRIVATE',
  colorStyle: {
    colorType: 'SINGLE',
    color: '#ff0000',
    fieldName: '',
    colorRamp: 'RANDOM',
    customFieldValue: '',
    colorList: [],
    transparency: 0,
    lineWidth: 3,
  },
  label: 'name',
  visible: true,
  active: true,
  field: [{ id: 'f', name: 'name', format: 'STRING' }],
  ...props,
});

const record = (props: Partial<RecordType>): RecordType =>
  ({
    id: 'r',
    userId: undefined,
    displayName: null,
    visible: true,
    redraw: false,
    coords: [center, { latitude: 35.001, longitude: 135.001 }],
    field: { name: 'label' },
    ...props,
  } as RecordType);

const strokeWidthOf = (svg: string) => Number(/<polyline[^>]*stroke-width="([\d.]+)"/.exec(svg)?.[1]);

describe('generateVectorMapSvg', () => {
  it('地図表示と同じく非表示レコードは描かない', () => {
    const dataSet: DataType[] = [
      {
        layerId: 'L',
        userId: undefined,
        data: [record({ field: { name: 'shown' } }), record({ id: 'h', visible: false, field: { name: 'hidden' } })],
      },
    ];
    const svg = generateVectorMapSvg(dataSet, [layer({})], ctx);
    expect(svg).toContain('shown');
    expect(svg).not.toContain('hidden');
  });

  it('非表示レイヤは描かない', () => {
    const dataSet: DataType[] = [{ layerId: 'L', userId: undefined, data: [record({})] }];
    expect(generateVectorMapSvg(dataSet, [layer({ visible: false })], ctx)).not.toContain('<polyline');
  });

  it('重なり順は地図と同じくポリゴン→ライン→ポイント', () => {
    const dataSet: DataType[] = [
      { layerId: 'P', userId: undefined, data: [record({ coords: center, field: { name: 'pt' } })] },
      { layerId: 'L', userId: undefined, data: [record({ field: { name: 'ln' } })] },
      {
        layerId: 'G',
        userId: undefined,
        data: [record({ coords: [center, { latitude: 35.001, longitude: 135 }, { latitude: 35, longitude: 135.001 }] })],
      },
    ];
    const layers = [layer({ id: 'P', type: 'POINT' }), layer({ id: 'L' }), layer({ id: 'G', type: 'POLYGON' })];
    const svg = generateVectorMapSvg(dataSet, layers, ctx);
    expect(svg.indexOf('<path')).toBeLessThan(svg.indexOf('<polyline'));
    expect(svg.indexOf('<polyline')).toBeLessThan(svg.indexOf('<circle'));
  });
});

describe('ラベル', () => {
  it('ラベルをエスケープする', () => {
    const svg = generateLineSvg(record({ field: { name: '<a&b>' } }), layer({}), ctx);
    expect(svg).toContain('&lt;a&amp;b&gt;');
    expect(svg).not.toContain('<a&b>');
  });

  it('ラベルのずれは用紙上で一定（地図のズームレベルの選択で変わらない）', () => {
    const f = record({ coords: center });
    const p = projectToPixel(center, ctx.frame);
    const x = (tileScale: number) =>
      Number(/<text x="([\d.]+)"/.exec(generatePointSvg(f, layer({ type: 'POINT' }), { ...ctx, tileScale }))?.[1]);
    expect((x(2) - p.pixelX) * 2).toBeCloseTo(8);
    expect((x(4) - p.pixelX) * 4).toBeCloseTo(8);
  });
});

describe('線の太さ', () => {
  it('マップメモの線は地図表示と同じくズーム連動で細くなる', () => {
    const memo = layer({ colorStyle: { ...layer({}).colorStyle, colorType: 'INDIVIDUAL', fieldName: 'color' } });
    const f = record({ field: { color: 'rgba(0,0,0,1)', _strokeWidth: 8, _zoom: 18 } });
    //描画時z18→用紙相当z16で1/4、用紙2px=タイル1px
    expect(strokeWidthOf(generateLineSvg(f, memo, ctx))).toBeCloseTo(1);
  });

  it('個別色以外のレイヤはレコードの太さではなくレイヤの太さを使う', () => {
    const f = record({ field: { name: 'a', _strokeWidth: 8 } });
    expect(strokeWidthOf(generateLineSvg(f, layer({}), ctx))).toBeCloseTo(1.5);
  });
});

describe('スタンプ・ブラシ', () => {
  it('1点の線はスタンプとして記号を描く', () => {
    const svg = generateLineSvg(record({ coords: [center], field: { _stamp: 'CIRCLE' } }), layer({}), ctx);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<polyline');
  });

  it('記号の大きさは地図と同じ基準（26px）を用紙上で使う', () => {
    const svg = generateLineSvg(record({ coords: [center], field: { _stamp: 'CIRCLE' } }), layer({}), ctx);
    //20x20のviewBoxを用紙26px=タイル13pxへ
    expect(Number(/scale\(([\d.]+)\)/.exec(svg)?.[1])).toBeCloseTo(13 / 20);
  });

  it('記号の無いスタンプや1点の矢印線でも例外にならない', () => {
    expect(generateLineSvg(record({ coords: [center], field: { _stamp: 'UNKNOWN' } }), layer({}), ctx)).toBe('');
    expect(() =>
      generateLineSvg(record({ coords: [center], field: { _strokeStyle: 'ARROW_END' } }), layer({}), ctx)
    ).not.toThrow();
  });

  it('ブラシは線に沿って記号を並べる', () => {
    const svg = generateLineSvg(record({ field: { _strokeStyle: 'PLUS' } }), layer({}), ctx);
    expect((svg.match(/<g /g) ?? []).length).toBeGreaterThan(1);
    expect(svg).not.toContain('<polyline');
  });
});
