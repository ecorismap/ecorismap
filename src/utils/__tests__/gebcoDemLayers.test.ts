import { colorReliefExpression, createGsjDemProtocolHandler } from '../gebcoDemLayers.web';

jest.mock('maplibre-contour', () => ({ __esModule: true, default: {} }));
jest.mock('fast-png', () => ({ encode: jest.fn() }));

describe('colorReliefExpression', () => {
  // maplibreのcolor-reliefは最上位がinterpolateでないと透明1色になり何も塗られない
  it('最上位がinterpolate式である', () => {
    expect(colorReliefExpression()[0]).toBe('interpolate');
  });

  it('NoData番兵の直前までは最高標高の色、番兵以上は透明', () => {
    const expr = colorReliefExpression();
    const stops = expr.slice(3);
    const n = stops.length;
    expect(stops[n - 2]).toBe(500000);
    expect(stops[n - 1]).toBe('rgba(0,0,0,0)');
    expect(stops[n - 4]).toBe(499999);
    expect(stops[n - 3]).toBe(stops[n - 5]);
  });
});

describe('createGsjDemProtocolHandler のキャッシュ規則', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const request = async (template: string) => {
    const handler = createGsjDemProtocolHandler();
    const url = `gsjdem://${encodeURIComponent(template)}/5/10/12`;
    await handler({ url } as Parameters<typeof handler>[0], new AbortController());
  };
  const ownCalls = (fetchMock: jest.Mock) =>
    fetchMock.mock.calls.filter(([u]) => (u as string).endsWith('/5/10/12.png')).length;

  it('5xx は覚えず、次の要求で取り直す', async () => {
    const fetchMock = jest.fn(async () => ({ ok: false, status: 503 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const template = 'https://example.com/a503/{z}/{x}/{y}.png';
    await request(template);
    await request(template);
    expect(ownCalls(fetchMock)).toBe(2);
  });

  it('404 はタイルなしとして覚える', async () => {
    const fetchMock = jest.fn(async () => ({ ok: false, status: 404 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const template = 'https://example.com/a404/{z}/{x}/{y}.png';
    await request(template);
    await request(template);
    expect(ownCalls(fetchMock)).toBe(1);
  });
});
