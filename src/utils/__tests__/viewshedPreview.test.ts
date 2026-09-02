// i18nモックを最初に設定
jest.mock('../../i18n/config', () => ({
  __esModule: true,
  default: {
    language: 'en',
    t: jest.fn((key) => key),
  },
  i18n: {
    language: 'en',
    t: jest.fn((key) => key),
  },
  t: jest.fn((key) => key),
}));

// DEM取得を伴う計算だけモックする
jest.mock('../viewshed', () => ({
  calcViewshedPolygons: jest.fn(),
  makeCircleRing: jest.fn(() => [
    { latitude: 35.1, longitude: 135.0 },
    { latitude: 35.0, longitude: 135.1 },
    { latitude: 35.1, longitude: 135.0 },
  ]),
}));

import { calcViewshedPreview } from '../viewshedPreview';
import { calcViewshedPolygons } from '../viewshed';

describe('calcViewshedPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('計算成功時は一時表示用の結果を返す（永続化しない）', async () => {
    (calcViewshedPolygons as jest.Mock).mockResolvedValue({
      polygons: [{ coords: [{ latitude: 35, longitude: 135 }], holes: {} }],
      observerElevation: 100,
    });
    const ret = await calcViewshedPreview({ latitude: 35, longitude: 135 }, 3, 2);
    expect(ret.isOK).toBe(true);
    expect(ret.result).toBeDefined();
    expect(ret.result!.observer).toEqual({ latitude: 35, longitude: 135 });
    expect(ret.result!.polygons).toHaveLength(1);
    expect(ret.result!.circleRing.length).toBeGreaterThan(0);
    expect(calcViewshedPolygons).toHaveBeenCalledWith({ latitude: 35, longitude: 135 }, 3000, 2);
  });

  it('DEM取得失敗時はisOK:falseとエラーメッセージを返す', async () => {
    (calcViewshedPolygons as jest.Mock).mockResolvedValue(null);
    const ret = await calcViewshedPreview({ latitude: 35, longitude: 135 }, 3, 2);
    expect(ret.isOK).toBe(false);
    expect(ret.message).toBe('hooks.message.failGetDem');
    expect(ret.result).toBeUndefined();
  });

  it('計算が例外を投げてもisOK:falseを返す', async () => {
    (calcViewshedPolygons as jest.Mock).mockRejectedValue(new Error('network'));
    const ret = await calcViewshedPreview({ latitude: 35, longitude: 135 }, 3, 2);
    expect(ret.isOK).toBe(false);
    expect(ret.message).toBe('hooks.message.failGetDem');
  });

  it('可視領域が空の場合はisOK:falseを返す', async () => {
    (calcViewshedPolygons as jest.Mock).mockResolvedValue({ polygons: [], observerElevation: 100 });
    const ret = await calcViewshedPreview({ latitude: 35, longitude: 135 }, 3, 2);
    expect(ret.isOK).toBe(false);
    expect(ret.message).toBe('hooks.message.failCalcViewshed');
  });
});
