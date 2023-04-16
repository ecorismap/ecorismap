import { useDispatch, useSelector } from 'react-redux';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { TILE_FOLDER } from '../constants/AppConstants';
import * as FileSystem from 'expo-file-system';
import { latToTileY, lonToTileX, tileToLatLon } from '../utils/Tile';
import { latLonToXY } from '../utils/Coords';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { setTileMapsAction } from '../modules/tileMaps';
import { cloneDeep } from 'lodash';
import { useWindow } from './useWindow';
import { AppState } from '../modules';

export type UseMapMemoReturnType = {
  gl: ExpoWebGLRenderingContext | null;
  setGl: Dispatch<SetStateAction<ExpoWebGLRenderingContext | null>>;
  saveMapMemo: () => Promise<void>;
};

export const useMapMemo = (mapViewRef: MapView | MapRef): UseMapMemoReturnType => {
  const dispatch = useDispatch();
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const [gl, setGl] = useState<ExpoWebGLRenderingContext | null>(null);
  const { windowHeight, windowWidth, mapRegion, devicePixelRatio: dpr } = useWindow();

  const saveMapMemo = useCallback(async () => {
    //console.log(gl);
    if (!gl) return;
    const { latitude, longitude, latitudeDelta, longitudeDelta, zoom } = mapRegion;

    const topLeftLat = latitude + latitudeDelta / 2;
    const topLeftLon = longitude - longitudeDelta / 2;
    const bottomRightLat = latitude - latitudeDelta / 2;
    const bottomRightLon = longitude + longitudeDelta / 2;

    const topLeftTileX = lonToTileX(topLeftLon, zoom);
    const topLeftTileY = latToTileY(topLeftLat, zoom);
    const bottomRightTileX = lonToTileX(bottomRightLon, zoom);
    const bottomRightTileY = latToTileY(bottomRightLat, zoom);

    for (let x = topLeftTileX; x <= bottomRightTileX; x++) {
      for (let y = topLeftTileY; y <= bottomRightTileY; y++) {
        const tileTopLeftLatLon = tileToLatLon(x, y, zoom);
        const tileBottomRightLatLon = tileToLatLon(x + 1, y + 1, zoom);
        const topLeftXY = latLonToXY(
          [tileTopLeftLatLon.lon, tileTopLeftLatLon.lat],
          mapRegion,
          { width: windowWidth, height: windowHeight },
          mapViewRef
        );
        const bottomRightXY = latLonToXY(
          [tileBottomRightLatLon.lon, tileBottomRightLatLon.lat],
          mapRegion,
          { width: windowWidth, height: windowHeight },
          mapViewRef
        );

        const x0 = topLeftXY[0];
        const y0 = topLeftXY[1];
        const x1 = bottomRightXY[0];
        const y1 = bottomRightXY[1];

        // // 4. 切り抜いたタイル画像をアプリのストレージに保存

        const glSnapshot = await GLView.takeSnapshotAsync(gl, {
          format: 'png',
          rect: {
            x: (800 + x0) * dpr,
            y: (1600 + windowHeight - (800 + y0 + y1 - y0)) * dpr, //GLViewの座標系は左下が原点なので、y座標を反転させてy1側を原点にする
            width: (x1 - x0) * dpr,
            height: (y1 - y0) * dpr,
          },
        });
        console.log(
          'x:' + (800 + x0) * dpr + ' y:' + (1600 + windowHeight - (800 + y1)) * dpr,
          'width:' + (x1 - x0) * dpr,
          'height:' + (y1 - y0) * dpr,
          'y0:',
          y0
        );
        //const uri = glSnapshot.uri as string;
        // 256x256のサイズにリサイズ
        const resizedImage = await ImageResizer.createResizedImage(glSnapshot.uri as string, 512, 512, 'PNG', 100, 0);
        const uri = resizedImage.uri as string;

        const folder = `${TILE_FOLDER}/hillshademap/${zoom}/${x}`;
        await FileSystem.makeDirectoryAsync(folder, {
          intermediates: true,
        });
        const destinationUri = `${folder}/${y}`;
        console.log(destinationUri);
        await FileSystem.moveAsync({
          from: uri,
          to: destinationUri,
        });
      }
    }
    const newTileMaps = cloneDeep(tileMaps);
    newTileMaps[0].visible = true;
    dispatch(setTileMapsAction(newTileMaps));
  }, [dispatch, dpr, gl, mapRegion, mapViewRef, tileMaps, windowHeight, windowWidth]);

  return { gl, setGl, saveMapMemo } as const;
};
