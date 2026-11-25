// Web: 取り込んだスタイルの読み出し（source の無いレイヤ・壊れたJSON）
import { getVectorLayerStyles } from '../vectorTileStyle';
import { parseStyleLayers } from '../vectorStyleFile';
import { db } from '../db';
import { TileMapType } from '../../types';

jest.mock('../db', () => ({ db: { pmtiles: { get: jest.fn() } } }));
const mockGetMetadata = jest.fn(async () => ({ vector_layers: [{ id: 'veg' }] }));
jest.mock('pmtiles', () => ({
  PMTiles: jest.fn(() => ({ getMetadata: mockGetMetadata })),
  Protocol: jest.fn(),
}));

const map = { id: 'P', name: 'P', url: 'pmtiles://blob:x', styleURL: 'style://a.json', transparency: 0 } as TileMapType;
const stored = (style: string) => (db.pmtiles.get as jest.Mock).mockResolvedValue({ mapId: 'P', style });

describe('getVectorLayerStyles（端末内スタイル）', () => {
  it('source の無いレイヤにも地図のソースを付ける', async () => {
    stored(JSON.stringify({ layers: [{ id: 'a', type: 'fill', 'source-layer': 'veg', paint: {} }] }));
    expect(await getVectorLayerStyles(map, {})).toMatchObject([{ id: 'P_0', source: 'P' }]);
  });

  it('background には source を付けない', async () => {
    stored(JSON.stringify({ layers: [{ id: 'b', type: 'background', paint: {} }] }));
    expect((await getVectorLayerStyles(map, {}))[0]).not.toHaveProperty('source');
  });

  it('壊れたスタイルは既定のスタイルで描く', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    stored('{broken');
    const layers = await getVectorLayerStyles(map, {});
    expect(layers.length).toBe(3);
    expect(layers[0]).toMatchObject({ source: 'P', 'source-layer': 'veg' });
    warn.mockRestore();
  });
});

describe('parseStyleLayers', () => {
  it.each([
    ['layers を持つスタイル', '{"layers":[{"id":"a"}]}', 1],
    ['配列だけ', '[{"id":"a"},{"id":"b"}]', 2],
    ['BOM 付き', '﻿{"layers":[]}', 0],
  ])('%s を受け付ける', (_, json, n) => expect(parseStyleLayers(json)).toHaveLength(n));

  it.each([
    ['壊れた JSON', '{broken'],
    ['layers なし', '{"version":8}'],
    ['null', 'null'],
    ['空', ''],
  ])('%s は受け付けない', (_, json) => expect(parseStyleLayers(json)).toBeUndefined());
});
