import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderInstance, View } from 'react-native';
import { MAPMEMO_FOLDER } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import Expo2DContext, { Expo2dContextOptions } from 'expo-2d-context';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { latToTileY, lonToTileX, tileToLatLon } from '../../utils/Tile';
import { latLonToXY } from '../../utils/Coords';
import { RegionType } from '../../types';

export interface TileType {
  x: number;
  y: number;
  z: number;
  topLeftXY: number[];
  bottomRightXY: number[];
  size: number;
}

export const CanvasView = () => {
  const { mapViewRef, currentMapMemoTool, penColor, setRefreshMapMemo } = useContext(HomeContext);
  const [gl, setGl] = useState<ExpoWebGLRenderingContext | null>(null);
  const [ctx, setCtx] = useState<Expo2DContext | null>(null);
  const [tiles, setTiles] = useState<TileType[]>([]);

  const offset = useRef([0, 0]);

  const { windowHeight, windowWidth, devicePixelRatio: dpr, mapRegion } = useWindow();
  const TILE_MAX_SIXE = 512;
  const tilesForRegion = useCallback(
    (region: RegionType) => {
      const regionTiles: TileType[] = [];
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
      const imagePath = `${MAPMEMO_FOLDER}/${tile.z}/${tile.x}/${tile.y}`;
      FileSystem.getInfoAsync(imagePath).then((info) => {
        if (!info.exists) return;
        return ImageManipulator.manipulateAsync(imagePath, [], {
          compress: 1,
          format: ImageManipulator.SaveFormat.PNG,
        }).then((image) => {
          //@ts-ignore
          image.localUri = image.uri;
          //@ts-ignore
          ctx.drawImage(image, (TILE_MAX_SIXE + tile.topLeftXY[0]) * dpr, (TILE_MAX_SIXE + tile.topLeftXY[1]) * dpr);
          ctx.flush();
        });
      });
    });

    await Promise.all(loadImagePromise);
    return regionTiles;
  };

  const saveZoomoutImage = useCallback(async (tile: TileType) => {
    if (tile.z === 0) {
      console.log('Zoom level 0 reached, cannot zoom out further.');
      return;
    }
    //tileの一つ上のズームレベルの画像を保存する
    //画像は256*256の全面半透明のグレーで塗りつぶす
    const zoomoutTile = { x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2), z: tile.z - 1 };
    const imagePath = `${MAPMEMO_FOLDER}/${zoomoutTile.z}/${zoomoutTile.x}/${zoomoutTile.y}`;
    const base64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const image = await ImageManipulator.manipulateAsync(base64Image, [{ resize: { width: 512, height: 512 } }], {
      compress: 1,
      format: ImageManipulator.SaveFormat.PNG,
    });
    console.log(`${MAPMEMO_FOLDER}/${zoomoutTile.z}/${zoomoutTile.x}`);
    await FileSystem.makeDirectoryAsync(`${MAPMEMO_FOLDER}/${zoomoutTile.z}/${zoomoutTile.x}`, {
      intermediates: true,
    });
    await FileSystem.moveAsync({
      from: image.uri as string,
      to: imagePath,
    });
  }, []);

  const saveMapMemo = useCallback(async () => {
    //console.log(gl);
    if (!gl) return;
    //const tiles = tilesForRegion(mapRegion);

    const makeDirPromise = tiles.map((tile) =>
      FileSystem.makeDirectoryAsync(`${MAPMEMO_FOLDER}/${tile.z}/${tile.x}`, {
        intermediates: true,
      })
    );
    await Promise.all(makeDirPromise);

    const saveImagePromise = tiles.map(async (tile) => {
      const [x0] = tile.topLeftXY;
      const [_, y1] = tile.bottomRightXY;
      const width = tile.size * dpr;
      const height = tile.size * dpr;
      //console.log('width:', width, 'height:', height);
      const x = (TILE_MAX_SIXE + x0) * dpr;
      const y = (TILE_MAX_SIXE + windowHeight - y1) * dpr; //GLViewの座標系は左下が原点なので、y座標を反転させてy1側を原点にする
      return await GLView.takeSnapshotAsync(gl, {
        format: 'png',
        rect: {
          x,
          y,
          width,
          height,
        },
      }).then((glSnapshot) => {
        ImageManipulator.manipulateAsync(glSnapshot.uri as string, [], {
          compress: 1,
          format: ImageManipulator.SaveFormat.PNG,
        }).then((image) => {
          FileSystem.moveAsync({
            from: image.uri as string,
            to: `${MAPMEMO_FOLDER}/${tile.z}/${tile.x}/${tile.y}`,
          });
          //saveZoomoutImage(tile);
        });
      });
    });
    await Promise.all(saveImagePromise);
  }, [dpr, gl, saveZoomoutImage, tiles, windowHeight]);

  // eslint-disable-next-line @typescript-eslint/no-shadow
  const setBlendMode = (gl: ExpoWebGLRenderingContext, eraser: boolean) => {
    if (eraser) {
      gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
  };

  const setPenStyle = useCallback(() => {
    if (ctx && gl) {
      ctx.strokeStyle = penColor;
      switch (currentMapMemoTool) {
        case 'PEN_THICK':
          ctx.lineWidth = 20;
          setBlendMode(gl, false);
          break;
        case 'PEN_MEDIUM':
          ctx.lineWidth = 10;
          setBlendMode(gl, false);
          break;
        case 'PEN_THIN':
          ctx.lineWidth = 5;
          setBlendMode(gl, false);
          break;
        case 'ERASER_THICK':
          ctx.lineWidth = 30;
          setBlendMode(gl, true);
          break;
        case 'ERASER_MEDIUM':
          ctx.lineWidth = 10;
          setBlendMode(gl, true);
          break;
        case 'ERASER_THIN':
          ctx.lineWidth = 5;
          setBlendMode(gl, true);
          break;
        default:
          break;
      }
    }
  }, [ctx, currentMapMemoTool, gl, penColor]);

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          if (!ctx) return;
          setPenStyle();
          if (!event.nativeEvent.touches.length) return;
          offset.current = [
            event.nativeEvent.locationX - event.nativeEvent.pageX,
            event.nativeEvent.locationY - event.nativeEvent.pageY,
          ];
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
          if (!ctx) return;
          ctx.stroke();
          ctx.flush();

          await saveMapMemo();
        },
      }),
    [ctx, dpr, saveMapMemo, setPenStyle]
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
    const regionTiles = await loadTileImage(ctx);
    setRefreshMapMemo(false);
    //console.log('loadTileImage');
    setTiles(regionTiles);
    setCtx(ctx);
    setGl(gl);
  };

  useEffect(() => {
    return function cleanup() {
      setRefreshMapMemo(true);
    };
  }, [setRefreshMapMemo]);

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
