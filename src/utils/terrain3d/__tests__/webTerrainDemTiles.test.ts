import type { Map as MaplibreMap, MapSourceDataEvent } from 'maplibre-gl';
import { setWebTerrainDemTiles } from '../webTerrainDemTiles';

type Listener = (e: MapSourceDataEvent) => void;

/** setTilesの反映が非同期なmaplibreのソースの代わり。apply()で新しいURLが反映されたことを通知する */
const fakeSource = (url: string) => {
  const listeners = new Set<Listener>();
  const source = {
    tiles: [url],
    pending: null as string[] | null,
    on: (_type: string, listener: Listener) => listeners.add(listener),
    off: (_type: string, listener: Listener) => listeners.delete(listener),
    setTiles: jest.fn((tiles: string[]) => {
      source.pending = tiles;
    }),
    fire: (event: Partial<MapSourceDataEvent>) => [...listeners].forEach((listener) => listener(event as MapSourceDataEvent)),
    apply: () => {
      if (source.pending !== null) source.tiles = source.pending;
      source.fire({ dataType: 'source', sourceDataType: 'metadata' });
      source.fire({ dataType: 'source', sourceDataType: 'content', sourceDataChanged: true });
    },
    listenerCount: () => listeners.size,
  };
  return source;
};

const fakeMap = (source: ReturnType<typeof fakeSource> | undefined) => {
  const clearTiles = jest.fn();
  const triggerRepaint = jest.fn();
  const state = { source };
  const map = {
    getSource: () => state.source,
    style: { tileManagers: { rasterdem: { clearTiles } } },
    triggerRepaint,
  } as unknown as MaplibreMap;
  return { map, clearTiles, triggerRepaint, state };
};

describe('setWebTerrainDemTiles', () => {
  it('URLを差し替え、新しいURLが反映された時点でタイルを捨てて読み直させる', () => {
    const source = fakeSource('land');
    const { map, clearTiles, triggerRepaint } = fakeMap(source);
    setWebTerrainDemTiles(map, 'rasterdem', 'bathy');
    expect(source.setTiles).toHaveBeenCalledWith(['bathy']);
    // 反映されるまでは捨てない（タイルごとの通知でも捨てない）
    source.fire({ dataType: 'source' });
    expect(clearTiles).not.toHaveBeenCalled();

    source.apply();
    expect(clearTiles).toHaveBeenCalledTimes(1);
    expect(triggerRepaint).toHaveBeenCalledTimes(1);
    // 一度きり（以後の通知では捨てない）
    expect(source.listenerCount()).toBe(0);
    source.apply();
    expect(clearTiles).toHaveBeenCalledTimes(1);
  });

  it('同じURLなら何もしない。ソースが無くても落ちない', () => {
    const source = fakeSource('land');
    const { map, clearTiles } = fakeMap(source);
    setWebTerrainDemTiles(map, 'rasterdem', 'land');
    expect(source.setTiles).not.toHaveBeenCalled();
    expect(source.listenerCount()).toBe(0);
    expect(clearTiles).not.toHaveBeenCalled();
    expect(() => setWebTerrainDemTiles(fakeMap(undefined).map, 'rasterdem', 'bathy')).not.toThrow();
  });

  it('反映の前にソースが置き換わっていたら、新しいソースのタイルは捨てない', () => {
    const source = fakeSource('land');
    const { map, clearTiles, state } = fakeMap(source);
    setWebTerrainDemTiles(map, 'rasterdem', 'bathy');
    state.source = fakeSource('land');
    source.apply();
    expect(clearTiles).not.toHaveBeenCalled();
    expect(source.listenerCount()).toBe(0);
  });
});
