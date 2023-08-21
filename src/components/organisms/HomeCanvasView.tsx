import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderInstance, Platform, View } from 'react-native';

import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import Expo2DContext, { Expo2dContextOptions } from 'expo-2d-context';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { latToTileY, lonToTileX, tileToLatLon } from '../../utils/Tile';
import { latLonToXY } from '../../utils/Coords';
import { RegionType } from '../../types';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { PMTiles } from './pmtiles';
import Pbf from 'pbf';
import VectorTile from '@mapbox/vector-tile';
import { use } from 'i18next';

export interface TileType {
  x: number;
  y: number;
  z: number;
  topLeftXY: number[];
  bottomRightXY: number[];
  size: number;
}
const MAPMEMO_FOLDER = `${TILE_FOLDER}/mapmemo`;
export const CanvasView = () => {
  const { mapViewRef, currentMapMemoTool, penColor } = useContext(HomeContext);
  const [gl, setGl] = useState<ExpoWebGLRenderingContext | null>(null);
  const [ctx, setCtx] = useState<Expo2DContext | null>(null);
  //const [tiles, setTiles] = useState<TileType[]>([]);
  const [scale, setScale] = useState(1);
  const [zIndex, setZIndex] = useState(-1);
  // const [vectorTiles, setVectorTiles] = useState<
  //   { layer: VectorTile.VectorTileLayer; z: number; x: number; y: number }[]
  // >([]);

  //const offset = useRef([0, 0]);

  const { windowWidth, windowHeight, devicePixelRatio: dpr, mapRegion } = useWindow();
  //const windowHeight = 256;
  //const windowWidth = 256;
  console.log(windowHeight);
  const trans = useCallback(
    (x: number, y: number, scale: number) => {
      //windowの座標系からGLViewのstyleのスケールを考慮した座標系に変換する
      return {
        x: ((x - (windowWidth * (1 - scale)) / 2) / scale) * dpr,
        y: ((y - (windowHeight * (1 - scale)) / 2) / scale) * dpr,
      };
    },
    [dpr, windowHeight, windowWidth]
  );

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

  // const loadTileImage = async (ctx: Expo2DContext) => {
  //   const regionTiles = tilesForRegion(mapRegion);
  //   const scale = (dpr * regionTiles[0].size) / 256;
  //   setScale(scale);

  //   const loadImagePromise = regionTiles.map((tile) => {
  //     const imagePath = `${MAPMEMO_FOLDER}/${tile.z}/${tile.x}/${tile.y}`;
  //     FileSystem.getInfoAsync(imagePath).then((info) => {
  //       if (!info.exists) return;
  //       return ImageManipulator.manipulateAsync(imagePath, [], {
  //         compress: 1,
  //         format: ImageManipulator.SaveFormat.PNG,
  //       }).then((image) => {
  //         //@ts-ignore
  //         image.localUri = image.uri;
  //         const glViewXY = trans(tile.topLeftXY[0], tile.topLeftXY[1], scale);
  //         //@ts-ignore
  //         ctx.drawImage(image, glViewXY.x, glViewXY.y);
  //         ctx.flush();
  //       });
  //     });
  //   });

  //   await Promise.all(loadImagePromise);
  //   return regionTiles;
  // };

  // const deleteZoominImage = useCallback(async (tile: TileType, level: number) => {
  //   const tasks = [];

  //   for (let i = 1; i < level; i++) {
  //     const scaleFactor = 2 ** i;
  //     for (let x = tile.x * scaleFactor; x < tile.x * scaleFactor + scaleFactor; x++) {
  //       for (let y = tile.y * scaleFactor; y < tile.y * scaleFactor + scaleFactor; y++) {
  //         const zoominTile = { x, y, z: tile.z + i };
  //         if (zoominTile.z > 22) {
  //           console.log('Zoom level 22 reached, cannot zoom in further.');
  //           break;
  //         }
  //         const imagePath = `${MAPMEMO_FOLDER}/${zoominTile.z}/${zoominTile.x}/${zoominTile.y}`;
  //         tasks.push(
  //           FileSystem.deleteAsync(imagePath, { idempotent: true }).then(() => {
  //             //console.log(`Deleted ${imagePath}`);
  //           })
  //         );
  //       }
  //     }
  //   }

  //   await Promise.all(tasks);
  // }, []);

  // const deleteZoomoutImage = useCallback(async (tile: TileType, level: number) => {
  //   const tasks = [];
  //   for (let i = 1; i < level; i++) {
  //     //tileの一つ上のズームレベルの画像を削除する
  //     const scaleFactor = 2 ** i;
  //     const zoomoutTile = {
  //       x: Math.floor(tile.x / scaleFactor),
  //       y: Math.floor(tile.y / scaleFactor),
  //       z: tile.z - i,
  //     };
  //     if (zoomoutTile.z < 0) {
  //       console.log('Zoom level 0 reached, cannot zoom out further.');
  //       break;
  //     }
  //     const imagePath = `${MAPMEMO_FOLDER}/${zoomoutTile.z}/${zoomoutTile.x}/${zoomoutTile.y}`;
  //     tasks.push(
  //       FileSystem.deleteAsync(imagePath, { idempotent: true }).then(() => {
  //         console.log(`Deleted ${imagePath}`);
  //       })
  //     );
  //   }
  //   await Promise.all(tasks);
  // }, []);

  const saveMapMemo = useCallback(
    async (vectorTiles: { layer: VectorTile.VectorTileLayer; tile: TileType }[]) => {
      //console.log(gl);
      if (!gl) return;
      //GLViewフォルダを作成しないと落ちる。
      //takeSnapshotAsyncのバグ？
      FileSystem.makeDirectoryAsync(`${FileSystem.cacheDirectory}GLView`, { intermediates: true });
      const makeDirPromise = vectorTiles.map(({ tile }) =>
        FileSystem.makeDirectoryAsync(`${MAPMEMO_FOLDER}/${tile.z}/${tile.x}`, {
          intermediates: true,
        })
      );
      await Promise.all(makeDirPromise);

      const saveImagePromise = vectorTiles.map(async ({ tile }) => {
        const [x0] = tile.topLeftXY;
        const [_, y1] = tile.bottomRightXY;
        const width = (tile.size * dpr) / scale;
        const height = (tile.size * dpr) / scale;
        const glViewXY = trans(x0, y1, scale);
        const x = glViewXY.x;
        const y = windowHeight * dpr - glViewXY.y; //GLViewの座標系は左下が原点なので、y座標を反転させてy1側を原点にする
        const glSnapshot = await GLView.takeSnapshotAsync(gl, {
          format: 'png',
          rect: {
            x,
            y,
            width,
            height,
          },
        });
        console.log('####', tile);
        console.log(x, y, width, height);
        const image = await ImageManipulator.manipulateAsync(glSnapshot.uri as string, [], {
          compress: 1,
          format: ImageManipulator.SaveFormat.PNG,
        });
        await FileSystem.moveAsync({
          from: image.uri as string,
          to: `${MAPMEMO_FOLDER}/${tile.z}/${tile.x}/${tile.y}`,
        });
        console.log(`${MAPMEMO_FOLDER}/${tile.z}/${tile.x}/${tile.y}`);
        // await deleteZoomoutImage(tile, 3);
        // await deleteZoominImage(tile, 3);
      });

      await Promise.all(saveImagePromise);
    },
    [dpr, gl, scale, trans, windowHeight]
  );

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
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 5 / scale;
      setBlendMode(gl, false);
    }
  }, [ctx, gl, scale]);

  const loadVectorTile = useCallback(async () => {
    const regionTiles = tilesForRegion(mapRegion);
    const scale_ = (dpr * regionTiles[0].size) / 256;
    setScale(scale_);
    //setTiles(regionTiles);

    const p = new PMTiles('https://www.ecoris.co.jp/map/kitakami_h30.pmtiles');
    //const meta = await p.getMetadata();
    //console.log(meta.tilestats.layers);
    const LAYER_NAME = '北上川H30';
    const vectorTilesPromise = regionTiles.map(async (tile) => {
      console.log('load pbf', tile.z, tile.x, tile.y);
      const a = await p.getZxy(tile.z, tile.x, tile.y);
      if (a === undefined) return;
      const pbf = new Pbf(a.data);
      const layer = new VectorTile.VectorTile(pbf).layers[LAYER_NAME];
      return { layer, tile };
    });
    const vectorTiles = (await Promise.all(vectorTilesPromise)).filter(
      (vectorTile): vectorTile is { layer: VectorTile.VectorTileLayer; tile: TileType } => vectorTile !== undefined
    );
    return vectorTiles;
    // setVectorTiles(layers);
  }, [dpr, mapRegion, tilesForRegion]);

  const writeVectorTile = useCallback(
    (vectorTiles: { layer: VectorTile.VectorTileLayer; tile: TileType }[]) => {
      if (!ctx) return;
      // tiles.forEach((tile) => {
      //   console.log(tile);
      //   ctx.beginPath();
      //   ctx.strokeStyle = 'white';
      //   const g = trans(tile.topLeftXY[0], tile.topLeftXY[1], scale);
      //   const width = 256;
      //   const height = 256;
      //   console.log('###', g.x, g.y, width, height);
      //   ctx.rect(g.x, g.y, width, height);
      //   ctx.stroke();
      // });
      // ctx.flush();
      // const p0 = [0, 0];
      // const p1 = [256, 256];
      // const g0 = trans(p0[0], p0[1], scale);
      // const g1 = trans(p1[0], p1[1], scale);

      // ctx.beginPath();
      // ctx.moveTo(g0.x, g0.y);
      // ctx.lineTo(g1.x, g0.y);
      // ctx.lineTo(g1.x, g1.y);
      // ctx.lineTo(g0.x, g1.y);
      // ctx.lineTo(g0.x, g0.y);
      // ctx.stroke();
      // ctx.flush();

      //console.log(layer.feature(0));
      for (const vt of vectorTiles) {
        console.log(vt.tile.x, vt.tile.y, vt.tile.z);
        for (let i = 0; i < vt.layer.length; i++) {
          const feature = vt.layer.feature(i);
          const coords = feature.toGeoJSON(vt.tile.x, vt.tile.y, vt.tile.z).geometry.coordinates;
          // console.log(coords);
          if (coords[0].length < 4) continue;
          ctx.beginPath();
          for (let k = 0; k < coords[0].length; k++) {
            const p = coords[0][k];
            const xy = latLonToXY(p, mapRegion, { width: windowWidth, height: windowHeight }, mapViewRef.current);

            //console.log(x, y);
            const g = trans(xy[0], xy[1], scale);
            //console.log(g);
            if (k === 0) {
              ctx.moveTo(g.x, g.y);
            } else {
              ctx.lineTo(g.x, g.y);
            }
          }
          ctx.stroke();

          //console.log(coords);
        }
        ctx.flush();
      }
    },
    [ctx, mapRegion, mapViewRef, scale, trans, windowHeight, windowWidth]
  );

  // const panResponder: PanResponderInstance = useMemo(
  //   () =>
  //     PanResponder.create({
  //       onStartShouldSetPanResponder: () => true,
  //       onMoveShouldSetPanResponder: () => true,
  //       onPanResponderGrant: (event: GestureResponderEvent) => {
  //         console.log('onPanResponderGrant');
  //         if (!ctx) return;
  //         setPenStyle();
  //         writeVectorTile();
  //         // if (!event.nativeEvent.touches.length) return;
  //         // if (Platform.OS === 'android') {
  //         //   //offsetがうまく取れないので、とりあえず固定値で
  //         //   offset.current = [0, 15];
  //         // }
  //         // ctx.beginPath();
  //       },
  //       onPanResponderMove: (event: GestureResponderEvent) => {
  //         if (!ctx) return;
  //         // const glXY = trans(
  //         //   event.nativeEvent.pageX + offset.current[0],
  //         //   event.nativeEvent.pageY + offset.current[1],
  //         //   scale
  //         // );

  //         // ctx.lineTo(glXY.x, glXY.y);
  //         // ctx.stroke();
  //         // ctx.flush();
  //       },
  //       onPanResponderRelease: async () => {
  //         await saveMapMemo();
  //       },
  //     }),
  //   [ctx, saveMapMemo, setPenStyle, writeVectorTile]
  // );

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
    //const regionTiles = await loadTileImage(ctx);
    //await loadVectorTile();
    setCtx(ctx);
    setGl(gl);
  };

  useEffect(() => {
    //MAPMEMO_FOLDERを削除する

    (async () => {
      //await FileSystem.deleteAsync(MAPMEMO_FOLDER, { idempotent: true });
      if (!ctx || !gl) return;
      setZIndex(1);
      const { x, y } = trans(windowWidth, windowHeight, scale);
      ctx.clearRect(0, 0, x, y);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 5 / scale;
      setBlendMode(gl, false);
      loadVectorTile().then(async (vectorTiles) => {
        writeVectorTile(vectorTiles);
        await saveMapMemo(vectorTiles);
        setZIndex(-1);
      });
    })();
  }, [mapRegion]);

  return (
    <View
      style={{
        zIndex: -1,
        elevation: -1,
        position: 'absolute',
        height: windowHeight,
        width: windowWidth,
        overflow: 'hidden',
      }}
      // {...panResponder.panHandlers}
    >
      <GLView
        msaaSamples={0}
        style={{
          width: windowWidth,
          height: windowHeight,
          transform: [{ scale: scale }],
        }}
        onContextCreate={onContextCreate}
      />
    </View>
  );
};
