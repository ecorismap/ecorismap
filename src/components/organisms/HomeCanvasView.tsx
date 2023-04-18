import React, { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderInstance, View } from 'react-native';
import { COLOR, TILE_FOLDER } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import Expo2DContext, { Expo2dContextOptions } from 'expo-2d-context';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { latToTileY, lonToTileX, tileToLatLon } from '../../utils/Tile';
import { latLonToXY } from '../../utils/Coords';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as MediaLibrary from 'expo-media-library';
import { decode } from 'fast-png';
import { Buffer } from 'buffer';
import RNFS from 'react-native-fs';

export const CanvasView = () => {
  const { mapViewRef, setVisibleMapMemo } = useContext(HomeContext);
  const [gl, setGl] = useState<ExpoWebGLRenderingContext | null>(null);
  const [ctx, setCtx] = useState<Expo2DContext | null>(null);

  const drawNum = useRef(0);
  const offset = useRef([0, 0]);
  const { windowHeight, windowWidth, devicePixelRatio: dpr, mapRegion } = useWindow();

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
        const imagePath = `${TILE_FOLDER}/mapmemo/${zoom}/${x}/${y}`;

        const info = await FileSystem.getInfoAsync(imagePath);
        if (info.exists) {
          //const resizedImage = await ImageResizer.createResizedImage(imagePath, width, height, 'PNG', 100);
          //const uri = resizedImage.uri as string;

          // //permissionの確認
          // const { status } = await MediaLibrary.requestPermissionsAsync();
          // if (status === 'granted') {
          //   const asset = await MediaLibrary.createAssetAsync(uri);
          //   await MediaLibrary.createAlbumAsync('DownLoads', asset);
          //   console.log(uri);
          // }
          const resizedImage = await ImageManipulator.manipulateAsync(imagePath, [], {
            compress: 1,
            format: ImageManipulator.SaveFormat.PNG,
          });
          //@ts-ignore
          resizedImage.localUri = resizedImage.uri;
          //@ts-ignore
          ctx.drawImage(resizedImage, (800 + x0) * dpr, (800 + y0) * dpr);
          ctx.flush();
          //console.log(resizedImage);
          // const uri = imagePath;
          // const data = await RNFS.readFile(uri, 'base64');
          // const png = decode(Buffer.from(data, 'base64'));
          // const imageData = { data: png.data as Uint8ClampedArray, width: width, height: height };
          // ctx.putImageData(imageData, (800 + x0) * dpr, (800 + y0) * dpr, 0, 0, imageData.width, imageData.height);
        }
      }
    }
  }

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
        // console.log(
        //   'x:' + (800 + x0) * dpr + ' y:' + (1600 + windowHeight - (800 + y1)) * dpr,
        //   'width:' + (x1 - x0) * dpr,
        //   'height:' + (y1 - y0) * dpr,
        //   'y0:',
        //   y0
        // );
        const uri = glSnapshot.uri as string;
        // 256x256のサイズにリサイズ
        //console.log(glSnapshot.width);
        //const resizedImage = await ImageResizer.createResizedImage(glSnapshot.uri as string, 512, 512, 'PNG', 100, 0);
        //const uri = resizedImage.uri as string;

        const folder = `${TILE_FOLDER}/mapmemo/${zoom}/${x}`;
        await FileSystem.makeDirectoryAsync(folder, {
          intermediates: true,
        });
        const destinationUri = `${folder}/${y}`;
        await FileSystem.moveAsync({
          from: uri,
          to: destinationUri,
        });
      }
    }
  }, [dpr, gl, mapRegion, mapViewRef, windowHeight, windowWidth]);

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
          drawNum.current = 0;
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          if (!ctx) return;
          ctx.lineTo(
            (event.nativeEvent.pageX + offset.current[0]) * dpr,
            (event.nativeEvent.pageY + offset.current[1]) * dpr
          );
          // if (drawNum.current % 10 === 0) {
          ctx.stroke();
          ctx.flush();
          // }
          drawNum.current++;
        },
        onPanResponderRelease: async () => {
          if (!ctx) return;
          ctx.stroke();
          ctx.flush();
          gl!.endFrameEXP();
          await saveMapMemo();
          setVisibleMapMemo(false);
          setVisibleMapMemo(true);
          console.log('saveMapMemo');
        },
      }),
    [ctx, dpr, gl, saveMapMemo, setVisibleMapMemo]
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
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'red';
    await loadTileImage(ctx);
    console.log('loadTileImage');
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
