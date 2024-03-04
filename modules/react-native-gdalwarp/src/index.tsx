import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'react-native-gdalwarp' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

const Gdalwarp = NativeModules.Gdalwarp
  ? NativeModules.Gdalwarp
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

export type warpedFileType = {
  uri: string;
  width: number;
  height: number;
  topLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
};
export function convert(uri: String): Promise<{ outputFiles: warpedFileType[] }> {
  return Gdalwarp.convert(uri);
}
