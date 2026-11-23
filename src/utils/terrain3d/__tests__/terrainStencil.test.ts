import {
  MAIN_DEPTH_STENCIL_FORMAT,
  overlayRingIndices,
  overlayStencilReference,
  terrainStencilReference,
} from '../TerrainRenderer';

describe('オーバーレイを最も細かいリングの画素だけに描くステンシル（V-M3）', () => {
  it('表示描画の深度にはステンシルを持つ形式を使う', () => {
    expect(MAIN_DEPTH_STENCIL_FORMAT).toBe('depth24plus-stencil8');
  });

  it('地形のリング番号は空（クリア値0）と重ならない', () => {
    for (let r = 0; r < 8; r++) expect(terrainStencilReference(r)).toBeGreaterThan(0);
  });

  it('オーバーレイの参照値は最後に描く（最も細かい）リングの値に一致する', () => {
    for (const ringCount of [1, 2, 3, 5]) {
      expect(overlayStencilReference(ringCount)).toBe(terrainStencilReference(ringCount - 1));
    }
  });

  it('遠景リングの値とは一致しない（遠景しか見えていない画素には描かない）', () => {
    const ringCount = 3;
    const overlay = overlayStencilReference(ringCount);
    expect(terrainStencilReference(0)).not.toBe(overlay);
    expect(terrainStencilReference(1)).not.toBe(overlay);
  });

  it('リングが無いときも空の画素（0）には描かない', () => {
    expect(overlayStencilReference(0)).not.toBe(0);
  });
});

describe('オーバーレイを描くリング（望遠の扇形が近景の後に並ぶ場合）', () => {
  it('通常3D（近景が最後）では最後のリングだけに描く', () => {
    expect(overlayRingIndices([{ drawOverlay: false }, { drawOverlay: false }, { drawOverlay: true }])).toEqual([2]);
  });

  it('近景より細かい扇形が後ろに並んでも、近景の画素にも描く', () => {
    // 遠景z11, 遠景z12, 近景z13, 扇形z14, 扇形z15, 扇形z16
    const rings = [
      { drawOverlay: false },
      { drawOverlay: false },
      { drawOverlay: true },
      { drawOverlay: true },
      { drawOverlay: true },
      { drawOverlay: true },
    ];
    const indices = overlayRingIndices(rings);
    expect(indices).toEqual([2, 3, 4, 5]);
    // 近景のステンシル値が描画対象に含まれる（扇形の外の近景上のラインが消えない）
    expect(indices.map(terrainStencilReference)).toContain(terrainStencilReference(2));
    // 遠景には描かない
    expect(indices).not.toContain(0);
    expect(indices).not.toContain(1);
  });

  it('指定が無ければ従来どおり最後のリングだけに描く', () => {
    expect(overlayRingIndices([{}, {}, {}])).toEqual([2]);
    expect(overlayRingIndices([])).toEqual([0]);
  });
});
