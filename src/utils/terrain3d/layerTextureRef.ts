/**
 * レイヤテクスチャの参照カウント。
 *
 * 目的ズームのタイル画像が届くまで、子タイルは親タイル（粗ズーム）のテクスチャを
 * 借りて仮表示する。借り手は別リングのTerrainTileManagerにもいるため、
 * 所有者のタイルが破棄されてもGPUテクスチャを道連れにできない。
 * 参照が0になって初めて破棄する。
 */

export interface LayerTextureRef {
  texture: GPUTexture;
  /** このテクスチャを掴んでいるタイルスロット数。0で破棄 */
  refs: number;
}

export const createLayerTextureRef = (texture: GPUTexture): LayerTextureRef => ({ texture, refs: 1 });

export const retainLayerTexture = (ref: LayerTextureRef): LayerTextureRef => {
  ref.refs++;
  return ref;
};

export const releaseLayerTexture = (ref: LayerTextureRef | null, destroy: (texture: GPUTexture) => void): void => {
  if (ref === null) return;
  ref.refs--;
  if (ref.refs <= 0) destroy(ref.texture);
};
