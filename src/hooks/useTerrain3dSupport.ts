/**
 * 3D地形表示に対応した端末かを判定するフック。
 *
 * ネイティブの3DはWebGPU（iOS=Metal / Android=Vulkan）で描くため、Vulkan非対応の
 * Android端末では提供できない。非対応端末では3Dボタン自体を出さない。
 * Webはmaplibre-glのsetTerrainで描くので判定不要。
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { isTerrain3dSupported } from '../utils/terrain3d/webgpuSupport';

export const useTerrain3dSupport = (): boolean => {
  const [supported, setSupported] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    isTerrain3dSupported()
      .then((ok) => {
        if (!cancelled) setSupported(ok);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return supported;
};
