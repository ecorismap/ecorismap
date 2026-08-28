import {
  TRACK_PHOTO_CLUSTER_THRESHOLD_PX,
  TRACK_PHOTO_TIME_MARGIN_MS,
  clusterTrackPhotos,
  interpolateTrackPositionAtTime,
  matchPhotoTimesToTrack,
  spiderOffsets,
  spiderRadius,
} from '../trackPhoto';
import { LocationType } from '../../types';

const T0 = 1700000000000;

// 北方向へ等間隔に並ぶ軌跡を生成する（i点目 = 緯度35+0.001*i、時刻T0+intervalMs*i）
const makeTrack = (count: number, intervalMs = 10000): LocationType[] =>
  Array.from({ length: count }, (_, i) => ({
    latitude: 35 + 0.001 * i,
    longitude: 135,
    timestamp: T0 + intervalMs * i,
  }));

describe('interpolateTrackPositionAtTime', () => {
  it('2点の中間時刻で座標の中点を返す', () => {
    const track = makeTrack(2);
    const pos = interpolateTrackPositionAtTime(track, T0 + 5000);
    expect(pos).not.toBeNull();
    expect(pos!.latitude).toBeCloseTo(35.0005, 10);
    expect(pos!.longitude).toBeCloseTo(135, 10);
  });

  it('軌跡点と同時刻ならその点の座標を返す', () => {
    const track = makeTrack(5);
    const pos = interpolateTrackPositionAtTime(track, T0 + 30000);
    expect(pos!.latitude).toBeCloseTo(35.003, 10);
  });

  it('開始前でもマージン内なら先頭にクランプする', () => {
    const track = makeTrack(3);
    const pos = interpolateTrackPositionAtTime(track, T0 - TRACK_PHOTO_TIME_MARGIN_MS + 1000);
    expect(pos).toEqual({ latitude: 35, longitude: 135 });
  });

  it('終了後でもマージン内なら末尾にクランプする', () => {
    const track = makeTrack(3);
    const pos = interpolateTrackPositionAtTime(track, T0 + 20000 + TRACK_PHOTO_TIME_MARGIN_MS - 1000);
    expect(pos).toEqual({ latitude: 35.002, longitude: 135 });
  });

  it('マージン外はnull', () => {
    const track = makeTrack(3);
    expect(interpolateTrackPositionAtTime(track, T0 - TRACK_PHOTO_TIME_MARGIN_MS - 1)).toBeNull();
    expect(interpolateTrackPositionAtTime(track, T0 + 20000 + TRACK_PHOTO_TIME_MARGIN_MS + 1)).toBeNull();
  });

  it('timestampを持たない点はスキップして補間する', () => {
    const track: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: T0 },
      { latitude: 99, longitude: 99 }, // timestampなし
      { latitude: 35.001, longitude: 135, timestamp: T0 + 10000 },
    ];
    const pos = interpolateTrackPositionAtTime(track, T0 + 5000);
    expect(pos!.latitude).toBeCloseTo(35.0005, 10);
  });

  it('有効timestampが2点未満ならnull', () => {
    expect(interpolateTrackPositionAtTime([], T0)).toBeNull();
    expect(interpolateTrackPositionAtTime([{ latitude: 35, longitude: 135, timestamp: T0 }], T0)).toBeNull();
    expect(
      interpolateTrackPositionAtTime(
        [
          { latitude: 35, longitude: 135 },
          { latitude: 36, longitude: 135 },
        ],
        T0
      )
    ).toBeNull();
  });

  it('timestampが逆行する軌跡はnull（安全側）', () => {
    const track: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: T0 },
      { latitude: 35.001, longitude: 135, timestamp: T0 + 20000 },
      { latitude: 35.002, longitude: 135, timestamp: T0 + 10000 },
    ];
    expect(interpolateTrackPositionAtTime(track, T0 + 5000)).toBeNull();
  });

  it('記録の長い空白区間内も線形補間する', () => {
    const track: LocationType[] = [
      { latitude: 35, longitude: 135, timestamp: T0 },
      { latitude: 35.01, longitude: 135.01, timestamp: T0 + 60 * 60 * 1000 }, // 1時間の空白
    ];
    const pos = interpolateTrackPositionAtTime(track, T0 + 30 * 60 * 1000);
    expect(pos!.latitude).toBeCloseTo(35.005, 10);
    expect(pos!.longitude).toBeCloseTo(135.005, 10);
  });
});

describe('matchPhotoTimesToTrack', () => {
  it('複数写真を一括照合し、範囲外はnullになる', () => {
    const track = makeTrack(3);
    const results = matchPhotoTimesToTrack(track, [T0 + 5000, T0 - TRACK_PHOTO_TIME_MARGIN_MS - 1, T0 + 15000]);
    expect(results).toHaveLength(3);
    expect(results[0]!.latitude).toBeCloseTo(35.0005, 10);
    expect(results[1]).toBeNull();
    expect(results[2]!.latitude).toBeCloseTo(35.0015, 10);
  });

  it('軌跡が不正なら全てnull', () => {
    expect(matchPhotoTimesToTrack([], [T0, T0 + 1000])).toEqual([null, null]);
  });
});

describe('clusterTrackPhotos', () => {
  it('しきい値以内の写真を1つのグループにまとめる', () => {
    const clusters = clusterTrackPhotos([
      { assetId: 'a', x: 100, y: 100 },
      { assetId: 'b', x: 110, y: 100 },
      { assetId: 'c', x: 100, y: 130 },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual({ id: 'a', x: 100, y: 100, assetIds: ['a', 'b', 'c'] });
  });

  it('しきい値より離れた写真は別グループになる', () => {
    const clusters = clusterTrackPhotos([
      { assetId: 'a', x: 100, y: 100 },
      { assetId: 'b', x: 100, y: 100 + TRACK_PHOTO_CLUSTER_THRESHOLD_PX + 1 },
    ]);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('距離はグループ代表位置（先頭メンバー）と比較する', () => {
    // bはaに吸収され、cはa（代表位置）から遠いので別グループ（チェーン的な連結はしない）
    const clusters = clusterTrackPhotos(
      [
        { assetId: 'a', x: 0, y: 0 },
        { assetId: 'b', x: 30, y: 0 },
        { assetId: 'c', x: 60, y: 0 },
      ],
      40
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0].assetIds).toEqual(['a', 'b']);
    expect(clusters[1].assetIds).toEqual(['c']);
  });

  it('入力順（撮影時刻順）が同じなら決定的に同じ結果になる', () => {
    const items = [
      { assetId: 'a', x: 10, y: 10 },
      { assetId: 'b', x: 15, y: 15 },
      { assetId: 'c', x: 200, y: 200 },
    ];
    expect(clusterTrackPhotos(items)).toEqual(clusterTrackPhotos(items));
  });

  it('空入力は空配列', () => {
    expect(clusterTrackPhotos([])).toEqual([]);
  });
});

describe('spiderOffsets / spiderRadius', () => {
  it('1枚以下はオフセットなし', () => {
    expect(spiderOffsets(1)).toEqual([{ dx: 0, dy: 0 }]);
  });

  it('メンバー数ぶんのオフセットを円周上（等半径）に返す', () => {
    const count = 5;
    const offsets = spiderOffsets(count);
    expect(offsets).toHaveLength(count);
    const radius = spiderRadius(count);
    for (const { dx, dy } of offsets) {
      expect(Math.hypot(dx, dy)).toBeCloseTo(radius, 6);
    }
  });

  it('先頭は真上に配置される', () => {
    const [first] = spiderOffsets(4);
    expect(first.dx).toBeCloseTo(0, 6);
    expect(first.dy).toBeCloseTo(-spiderRadius(4), 6);
  });

  it('枚数が多いほど半径が広がり、円周上でサムネイルが重ならない', () => {
    expect(spiderRadius(20)).toBeGreaterThan(spiderRadius(6));
    // 隣接オフセット間の距離がサムネイルサイズ（36px）以上
    const offsets = spiderOffsets(20);
    const d = Math.hypot(offsets[1].dx - offsets[0].dx, offsets[1].dy - offsets[0].dy);
    expect(d).toBeGreaterThanOrEqual(36);
  });
});
