/**
 * 3D地形が使えるかの判定と、GPUデバイスの共有。
 *
 * WebGPUのバックエンドはiOS=Metal / Android=Vulkanで、Vulkan非対応のAndroid端末では
 * requestAdapterがnullを返す。その端末では3D自体を提供しない（2D地図のみ）。
 *
 * デバイスは2D⇔3Dの往復で作り直すと初期化コストがかかるためモジュールに保持し、
 * ロスト時だけ破棄して次回再取得する。
 */

let devicePromise: Promise<GPUDevice | null> | null = null;

/**
 * 地形描画用のGPUデバイス。非対応環境ではnull。
 * 同時に複数回呼ばれても実際の初期化は1回だけ。
 */
export const getTerrainDevice = (): Promise<GPUDevice | null> => {
  if (devicePromise !== null) return devicePromise;
  devicePromise = (async () => {
    try {
      // navigator.gpuはreact-native-webgpuのimport時に生える（Web版はブラウザ実装）
      if (typeof navigator === 'undefined' || navigator.gpu === undefined) return null;
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter === null) return null;
      const device = await adapter.requestDevice();
      // ロストしたら次回のgetTerrainDeviceで作り直す
      device.lost.then(() => {
        if (devicePromise !== null) devicePromise = null;
      });
      return device;
    } catch {
      return null;
    }
  })();
  return devicePromise;
};

/** 3D地形を提供できる環境か（GPUデバイスを取得できるか） */
export const isTerrain3dSupported = async (): Promise<boolean> => (await getTerrainDevice()) !== null;
