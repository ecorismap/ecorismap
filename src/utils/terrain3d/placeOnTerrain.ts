/**
 * 点を「GPUが実際に描いた地形」の高さへ寄せる反復（TerrainScene.placeOnDrawnTerrain の計算部分）。
 *
 * heightAt(y) は「高さ y に置いた点を投影した画素に見えている地形の高さ」。空・画面外など引けないときは null。
 * 点から目への視線は高さが一方向に変わるので、heightAt(y) === y になるのは、その画素に見えている地形が
 * 点そのものの場所のとき（＝点が見えているとき）だけ。点が手前の尾根に隠れていると、尾根の高さと
 * 別の斜面の高さの間を行き来して収束しない。その途中の値を使うと、隠れているはずの点が尾根の高さまで
 * 持ち上がって表示されるので、初期値（JSの標高）へ戻して遮蔽判定に任せる。
 */
export const settleOnDrawnTerrain = (
  initialY: number,
  heightAt: (y: number) => number | null,
  options: { iterations: number; epsilon: number; maxLastStep: number }
): number => {
  let y = initialY;
  let lastStep = 0;
  for (let i = 0; i < options.iterations; i++) {
    const nextY = heightAt(y);
    // 引けない（空・画面外）。稜線の点は縮小した距離バッファでは隣の画素が空になるので、
    // 直前までに寄っていればその値を採る。大きく動いた先で引けなくなったなら信用しない
    if (nextY === null) return i > 0 && lastStep <= options.maxLastStep / 2 ? y : initialY;
    lastStep = Math.abs(nextY - y);
    y = nextY;
    if (lastStep < options.epsilon) return y;
  }
  // 急斜面では反復の上限までに寄り切らないことがあるので、残りが小さければ採る
  return lastStep <= options.maxLastStep ? y : initialY;
};
