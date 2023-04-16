import React, { useContext, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderInstance, View } from 'react-native';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import Expo2DContext, { Expo2dContextOptions } from 'expo-2d-context';
import { setTileMapsAction } from '../../modules/tileMaps';
import { cloneDeep } from 'lodash';
import { useDispatch } from 'react-redux';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { latToTileY, lonToTileX, tileToLatLon } from '../../utils/Tile';
import { latLonToXY } from '../../utils/Coords';
import ImageResizer from '@bam.tech/react-native-image-resizer';

export const CanvasView = () => {
  const dispatch = useDispatch();
  const { gl, tileMaps, setGl, saveMapMemo, mapViewRef } = useContext(HomeContext);
  const [ctx, setCtx] = useState<Expo2DContext | null>(null);

  const offset = useRef([0, 0]);
  const { windowHeight, windowWidth, devicePixelRatio: dpr, mapRegion } = useWindow();

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          const newTileMaps = cloneDeep(tileMaps);
          newTileMaps[0].visible = false;
          dispatch(setTileMapsAction(newTileMaps));
          if (!event.nativeEvent.touches.length) return;
          offset.current = [
            event.nativeEvent.locationX - event.nativeEvent.pageX,
            event.nativeEvent.locationY - event.nativeEvent.pageY,
          ];
          if (!ctx) return;
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 3;
          ctx.beginPath();
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          if (!ctx) return;
          ctx.lineTo(
            (event.nativeEvent.pageX + offset.current[0]) * dpr,
            (event.nativeEvent.pageY + offset.current[1]) * dpr
          );
          ctx.stroke();
          ctx.flush();
        },
        onPanResponderRelease: async () => {
          gl!.endFrameEXP();
          saveMapMemo();
        },
      }),
    [ctx, dispatch, dpr, gl, saveMapMemo, tileMaps]
  );

  // eslint-disable-next-line @typescript-eslint/no-shadow
  async function loadTileImage(ctx: Expo2DContext) {
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
          mapViewRef.current
        );
        const bottomRightXY = latLonToXY(
          [tileBottomRightLatLon.lon, tileBottomRightLatLon.lat],
          mapRegion,
          { width: windowWidth, height: windowHeight },
          mapViewRef.current
        );

        const x0 = topLeftXY[0];
        const y0 = topLeftXY[1];
        const x1 = bottomRightXY[0];
        const y1 = bottomRightXY[1];
        const width = (x1 - x0) * dpr;
        const height = (y1 - y0) * dpr;
        const imagePath = `${TILE_FOLDER}/hillshademap/${zoom}/${x}/${y}`;

        const info = await FileSystem.getInfoAsync(imagePath);
        if (info.exists) {
          const resizedImage = await ImageResizer.createResizedImage(imagePath, width, height, 'PNG', 100);
          const uri = resizedImage.uri as string;

          // const new_im = await ImageManipulator.manipulateAsync(imagePath, [{ resize: { width, height } }], {
          //   compress: 1,
          //   format: ImageManipulator.SaveFormat.PNG,
          // });

          //@ts-ignore
          resizedImage.localUri = uri;
          //@ts-ignore
          ctx.drawImage(resizedImage, (800 + x0) * dpr, (800 + y0) * dpr);
          ctx.flush();
        }
      }
    }
  }

  const options: Expo2dContextOptions = {
    fastFillTesselation: true,
    maxGradStops: 128,
    renderWithOffscreenBuffer: true,
  };

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    //@ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const ctx = new Expo2DContext(gl, options);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'red';

    await loadTileImage(ctx);
    setCtx(ctx);
    setGl(gl);
  };

  return (
    <View
      style={{
        zIndex: 1,
        elevation: 1,
        position: 'absolute',
        height: windowHeight,
        width: windowWidth,
        overflow: 'hidden',
      }}
    >
      <GLView
        style={{
          width: windowWidth + 1600,
          height: windowHeight + 1600,
          transform: [{ translateX: -800 }, { translateY: -800 }],
        }}
        onContextCreate={onContextCreate}
        {...panResponder.panHandlers}
      />
    </View>
  );
};
