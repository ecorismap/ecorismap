import { RegionType } from '../../../types';
import { createInteractionSyncGate, getTerrain3DRegion, setTerrain3DRegionProvider } from '../regionSyncStore';

const region = (latitude: number): RegionType => ({
  latitude,
  longitude: 138,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
  zoom: 15,
});

describe('regionSyncStore（V-M7）', () => {
  it('3Dが無ければnull、登録中は最新のカメラ位置を返す', () => {
    expect(getTerrain3DRegion()).toBeNull();
    let lat = 35;
    const unregister = setTerrain3DRegionProvider(() => region(lat));
    expect(getTerrain3DRegion()?.latitude).toBe(35);
    lat = 36; // 間引きで未同期の移動も読める
    expect(getTerrain3DRegion()?.latitude).toBe(36);
    unregister();
    expect(getTerrain3DRegion()).toBeNull();
  });

  it('古い登録の解除は新しい登録を消さない', () => {
    const unregisterOld = setTerrain3DRegionProvider(() => region(1));
    const unregisterNew = setTerrain3DRegionProvider(() => region(2));
    unregisterOld();
    expect(getTerrain3DRegion()?.latitude).toBe(2);
    unregisterNew();
  });
});

describe('createInteractionSyncGate（V-M7 ジェスチャ中のdispatch抑止）', () => {
  it('操作中の同期は保留し、指を離したときに1回だけ同期させる', () => {
    const gate = createInteractionSyncGate();
    expect(gate.shouldDefer(false, true)).toBe(true);
    expect(gate.takePending(true)).toBe(false); // まだ別の指が残っている
    expect(gate.takePending(false)).toBe(true);
    expect(gate.takePending(false)).toBe(false);
  });

  it('指を離した時点の同期（force）と操作外の同期は通す', () => {
    const gate = createInteractionSyncGate();
    expect(gate.shouldDefer(true, true)).toBe(false);
    expect(gate.shouldDefer(false, false)).toBe(false);
  });

  it('保留の後に同期できたら、離したときに重ねて同期しない', () => {
    const gate = createInteractionSyncGate();
    gate.shouldDefer(false, true);
    gate.markSynced();
    expect(gate.takePending(false)).toBe(false);
  });

  it('取り消した後追い同期は保留として残る', () => {
    const gate = createInteractionSyncGate();
    gate.markPending();
    expect(gate.takePending(false)).toBe(true);
  });
});
