import { shouldLeaveVistaForJump } from '../externalCameraMove';

describe('眺望中のジャンプ（V-L3）', () => {
  const center = { latitude: 35.36, longitude: 138.72 };
  it('眺望中に中心を伴う移動が来たら眺望を解く', () => {
    expect(shouldLeaveVistaForJump(true, { center })).toBe(true);
  });
  it('中心を伴わない（ズームだけ等）なら眺望のまま', () => {
    expect(shouldLeaveVistaForJump(true, {})).toBe(false);
  });
  it('眺望中でなければ何もしない', () => {
    expect(shouldLeaveVistaForJump(false, { center })).toBe(false);
  });
});
