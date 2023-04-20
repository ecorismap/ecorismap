import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderInstance, View } from 'react-native';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import Expo2DContext, { Expo2dContextOptions } from 'expo-2d-context';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { latToTileY, lonToTileX, tileToLatLon } from '../../utils/Tile';
import { latLonToXY } from '../../utils/Coords';
import { RegionType } from '../../types';

export const CanvasView = () => {
  const { mapViewRef, setVisibleMapMemo } = useContext(HomeContext);
  const [gl, setGl] = useState<ExpoWebGLRenderingContext | null>(null);
  const [ctx, setCtx] = useState<Expo2DContext | null>(null);
  const [tiles, setTiles] = useState<
    { x: number; y: number; z: number; topLeftXY: number[]; bottomRightXY: number[] }[]
  >([]);

  const offset = useRef([0, 0]);
  const { windowHeight, windowWidth, devicePixelRatio: dpr, mapRegion } = useWindow();
  const TILE_MAX_SIXE = 256;
  const tilesForRegion = useCallback(
    (region: RegionType) => {
      const regionTiles: {
        x: number;
        y: number;
        z: number;
        topLeftXY: number[];
        bottomRightXY: number[];
        size: number;
      }[] = [];
      const { latitude, longitude, latitudeDelta, longitudeDelta, zoom } = region;
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
          const size = bottomRightXY[0] - topLeftXY[0];

          regionTiles.push({ x: x, y: y, z: zoom, topLeftXY, bottomRightXY, size });
        }
      }

      return regionTiles;
    },
    [mapRegion, mapViewRef, windowHeight, windowWidth]
  );

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const loadTileImage = async (ctx: Expo2DContext) => {
    const regionTiles = tilesForRegion(mapRegion);

    const loadImagePromise = regionTiles.map((tile) => {
      const imagePath = `${TILE_FOLDER}/mapmemo/${tile.z}/${tile.x}/${tile.y}`;
      FileSystem.getInfoAsync(imagePath).then((info) => {
        if (!info.exists) return;
        console.log('loaded width', tile.size * dpr);
        return ImageManipulator.manipulateAsync(imagePath, [], {
          compress: 1,
          format: ImageManipulator.SaveFormat.PNG,
        }).then((image) => {
          const b = tile.size / TILE_MAX_SIXE;
          ctx!.scale(b, b);
          // console.log(ctx.width);
          //@ts-ignore
          image.localUri = image.uri;
          //@ts-ignore
          ctx.drawImage(image, (TILE_MAX_SIXE + tile.topLeftXY[0]) / b, (TILE_MAX_SIXE + tile.topLeftXY[1]) / b);
          ctx.flush();
          ctx!.scale(1 / b, 1 / b);
        });
      });
    });

    await Promise.all(loadImagePromise);
    return regionTiles;
  };

  const saveMapMemo = useCallback(async () => {
    if (!gl) return;
    const makeDirPromise = tiles.map((tile) =>
      FileSystem.makeDirectoryAsync(`${TILE_FOLDER}/mapmemo/${tile.z}/${tile.x}`, {
        intermediates: true,
      })
    );
    await Promise.all(makeDirPromise);

    const saveImagePromise = tiles.map(async (tile) => {
      const [x0, y0] = tile.topLeftXY;
      const [x1, y1] = tile.bottomRightXY;
      const width = (x1 - x0) * dpr;
      const height = (y1 - y0) * dpr;
      const x = (TILE_MAX_SIXE + x0) * dpr;
      const y = (TILE_MAX_SIXE + windowHeight - y1) * dpr; //GLViewの座標系は左下が原点なので、y座標を反転させてy1側を原点にする
      console.log('saved width', width);
      return await GLView.takeSnapshotAsync(gl, {
        format: 'png',
        rect: {
          x,
          y,
          width,
          height,
        },
      }).then((glSnapshot) => {
        ImageManipulator.manipulateAsync(
          glSnapshot.uri as string,
          [{ resize: { width: TILE_MAX_SIXE, height: TILE_MAX_SIXE } }],
          {
            compress: 1,
            format: ImageManipulator.SaveFormat.PNG,
          }
        ).then(async (image) => {
          FileSystem.moveAsync({
            from: image.uri as string,
            to: `${TILE_FOLDER}/mapmemo/${tile.z}/${tile.x}/${tile.y}`,
          });
        });
      });
    });
    await Promise.all(saveImagePromise);
  }, [dpr, gl, tiles, windowHeight]);

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          if (!ctx) return;

          if (!event.nativeEvent.touches.length) return;
          offset.current = [
            event.nativeEvent.locationX - event.nativeEvent.pageX,
            event.nativeEvent.locationY - event.nativeEvent.pageY,
          ];

          ctx.beginPath();
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          if (!ctx) return;
          ctx.lineTo(event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]);
          ctx.stroke();
          ctx.flush();
        },
        onPanResponderRelease: async () => {
          if (!ctx) return;
          ctx.stroke();
          ctx.flush();

          await saveMapMemo();

          setVisibleMapMemo(true);
        },
      }),
    [ctx, saveMapMemo, setVisibleMapMemo]
  );

  const options: Expo2dContextOptions = {
    fastFillTesselation: false,
    maxGradStops: 1,
    renderWithOffscreenBuffer: false,
  };

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    //@ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-shadow
    const ctx = new Expo2DContext(gl, options);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'red';
    ctx.scale(dpr, dpr);
    const regionTiles = await loadTileImage(ctx);

    setTiles(regionTiles);
    setCtx(ctx);
    setGl(gl);
    setVisibleMapMemo(false);
  };

  useEffect(() => {
    return function cleanup() {
      setVisibleMapMemo(true);
    };
  }, [ctx, setVisibleMapMemo]);

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
          width: windowWidth + TILE_MAX_SIXE * 2,
          height: windowHeight + TILE_MAX_SIXE * 2,
          transform: [{ translateX: -TILE_MAX_SIXE }, { translateY: -TILE_MAX_SIXE }],
        }}
        onContextCreate={onContextCreate}
        {...panResponder.panHandlers}
      />
    </View>
  );
};
