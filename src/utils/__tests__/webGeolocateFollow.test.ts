import type { JumpToOptions, Map as MaplibreMap } from 'maplibre-gl';
import { FollowViewState, isSyncOfFollowViewState, keepGeolocateFollowOnViewStateSync } from '../webGeolocateFollow';

const VIEW: FollowViewState = {
  longitude: 140.8851,
  latitude: 38.2631,
  zoom: 15,
  bearing: 0,
  pitch: 0,
  padding: { top: 0, bottom: 0, left: 0, right: 0 },
};

describe('isSyncOfFollowViewState', () => {
  it('追従の移動が求めた表示範囲と同じ行き先なら、その反映とみなす', () => {
    expect(isSyncOfFollowViewState({ center: { lng: 140.8851, lat: 38.2631 }, zoom: 15 }, VIEW)).toBe(true);
    expect(isSyncOfFollowViewState({ center: [140.8851, 38.2631] }, VIEW)).toBe(true);
    expect(isSyncOfFollowViewState({ zoom: 15 }, VIEW)).toBe(true);
    expect(isSyncOfFollowViewState({ bearing: 0, pitch: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } }, VIEW)).toBe(
      true
    );
  });

  it('行き先が違えば反映ではない（データへのジャンプなどでは、これまでどおり追従が外れる）', () => {
    expect(isSyncOfFollowViewState({ center: { lng: 140.9, lat: 38.2631 }, zoom: 15 }, VIEW)).toBe(false);
    expect(isSyncOfFollowViewState({ center: { lng: 140.8851, lat: 38.2631 }, zoom: 14 }, VIEW)).toBe(false);
    expect(isSyncOfFollowViewState({ bearing: 10 }, VIEW)).toBe(false);
    expect(isSyncOfFollowViewState({ pitch: 30 }, VIEW)).toBe(false);
    expect(isSyncOfFollowViewState({ padding: { top: 10, bottom: 0, left: 0, right: 0 } }, VIEW)).toBe(false);
  });

  it('直近の移動が追従でないとき、行き先の指定が無いとき、表示範囲以外の指定があるときは反映ではない', () => {
    expect(isSyncOfFollowViewState({ center: { lng: 140.8851, lat: 38.2631 } }, null)).toBe(false);
    expect(isSyncOfFollowViewState({}, VIEW)).toBe(false);
    expect(isSyncOfFollowViewState({ center: { lng: 140.8851, lat: 38.2631 }, elevation: 100 }, VIEW)).toBe(false);
  });
});

describe('keepGeolocateFollowOnViewStateSync', () => {
  const setup = (follow: () => FollowViewState | null) => {
    const original = jest.fn();
    const map = { jumpTo: original } as unknown as MaplibreMap;
    keepGeolocateFollowOnViewStateSync(map, follow);
    return { map, original };
  };
  const sync: JumpToOptions = { center: { lng: 140.8851, lat: 38.2631 }, zoom: 15 };

  it('追従の移動の反映にだけ、GeolocateControlの印を付ける', () => {
    const { map, original } = setup(() => VIEW);
    map.jumpTo(sync);
    expect(original).toHaveBeenLastCalledWith(sync, { geolocateSource: true });
    map.jumpTo({ center: [141, 39] });
    expect(original).toHaveBeenLastCalledWith({ center: [141, 39] }, undefined);
    map.jumpTo({ center: [141, 39] }, { foo: 1 });
    expect(original).toHaveBeenLastCalledWith({ center: [141, 39] }, { foo: 1 });
  });

  it('直近の移動が追従でなければ印を付けない', () => {
    const { map, original } = setup(() => null);
    map.jumpTo(sync);
    expect(original).toHaveBeenLastCalledWith(sync, undefined);
  });

  it('同じ地図に二度掛けても、包むのは一度だけ', () => {
    const { map, original } = setup(() => VIEW);
    const wrapped = map.jumpTo;
    keepGeolocateFollowOnViewStateSync(map, () => VIEW);
    expect(map.jumpTo).toBe(wrapped);
    map.jumpTo(sync);
    expect(original).toHaveBeenCalledTimes(1);
  });
});
