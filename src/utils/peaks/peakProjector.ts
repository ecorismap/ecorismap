/**
 * 山名ラベルの投影の差し替え口。
 *
 * ネイティブは自作3D（TerrainScene）、Webはmaplibreで描いているが、
 * 「緯度経度→画面位置（地形に隠れていればnull）」さえ揃えれば、
 * ラベルの選定・配置・描画は共通にできる。
 */
import type { TerrainScene } from '../terrain3d/TerrainScene';
import { distanceM } from './peakData';
import { isSightBlocked } from './sightline';

export interface PeakProjector {
  /**
   * 山頂の画面位置[dp]。カメラの後ろ・画面外・地形の陰ならnull。
   * eleは山頂データの標高[m]で、視線の判定に使う（下のPEAK_SIGHT_NOTE参照）
   */
  project: (latitude: number, longitude: number, ele: number) => { x: number; y: number } | null;
  /** 描画（カメラや地形の更新）のたびに呼ばれる購読。解除関数を返す */
  subscribe: (listener: () => void) => () => void;
  /**
   * 投影し直してよいか。falseのあいだ（見回し中など）はラベルを隠す。
   * 動いている景色に古い位置のラベルが置いていかれるのを見せないため
   */
  isReady: () => boolean;
  /** 眺望の立ち位置。眺望中でなければnull */
  getViewpoint: () => { latitude: number; longitude: number } | null;
}

/**
 * PEAK_SIGHT_NOTE: 視線は「描かれた山頂の標高」と「山頂データの標高」の高い方へ引く。
 * 遠くの山はDEMが粗く、山頂付近がなだらかな台地に均されて実際より低く描かれる。
 * その低い山頂へ視線を引くと、手前の台地の縁に遮られて山名が消える（富士山で実際に起きた）。
 */

/**
 * ネイティブ。山頂は描画と同じDEMの標高に置き、遮蔽は視線上の標高で調べる。
 *
 * ポイントのように距離バッファ（projectToScreen）で遮蔽を判定すると、遠くの山頂が
 * 粗いDEMで丸く描かれたとき、自分の山体の陰と判定されて消える（富士山で実際に起きた）。
 * また距離バッファはカメラが止まった後の描画でしか撮られず、揃うまで待つ必要もあった
 */
export const createScenePeakProjector = (scene: TerrainScene): PeakProjector => {
  const sample = (latitude: number, longitude: number) => scene.sampleElevation(latitude, longitude);
  return {
    project: (latitude, longitude, ele) => {
      const eye = scene.vistaEye;
      if (eye === null) return null;
      const drawn = scene.sampleElevation(latitude, longitude);
      if (drawn === null) return null;
      // 点は描かれた山頂に置く（ラベルの引き出し線が絵の山に刺さるように）
      const screen = scene.projectWithElevation(latitude, longitude, drawn);
      if (screen === null) return null;
      const distance = distanceM(eye.latitude, eye.longitude, latitude, longitude);
      const summit = { latitude, longitude, altitude: Math.max(drawn, ele) };
      if (isSightBlocked(sample, eye, summit, distance)) return null;
      return screen;
    },
    subscribe: (listener) => scene.addFrameListener(listener),
    isReady: () => scene.cameraSettled,
    getViewpoint: () => scene.vistaEye,
  };
};
