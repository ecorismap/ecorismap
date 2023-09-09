import React, { useCallback, useMemo } from 'react';
import { useWindow } from '../../hooks/useWindow';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import Expo2DContext, { Expo2dContextOptions } from 'expo-2d-context';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { latToTileY, lonToTileX } from '../../utils/Tile';
import { TILE_FOLDER } from '../../constants/AppConstants';
import { PMTiles } from '../../utils/pmtiles';
import Pbf from 'pbf';
import VectorTile from '@mapbox/vector-tile';
import { getRandomColor } from '../../utils/Color';

interface Props {
  url: string;
  zoom: number;
}

export const VectorTiles2 = (prop: Props) => {
  const { url, zoom } = prop;
  const { mapRegion } = useWindow();
  const pmtile = useMemo(() => new PMTiles(url), [url]);

  // const meta = await p.getMetadata();
  // console.log(meta.tilestats.layers);

  const getTiles = useCallback(() => {
    const minLon = mapRegion.longitude - mapRegion.longitudeDelta / 2;
    const minLat = mapRegion.latitude - mapRegion.latitudeDelta / 2;
    const maxLon = mapRegion.longitude + mapRegion.longitudeDelta / 2;
    const maxLat = mapRegion.latitude + mapRegion.latitudeDelta / 2;
    //console.log(minLon, minLat, maxLon, maxLat);
    const minTileX = lonToTileX(minLon, zoom);
    const maxTileX = lonToTileX(maxLon, zoom);
    const minTileY = latToTileY(maxLat, zoom);
    const maxTileY = latToTileY(minLat, zoom);
    //console.log(minTileX, maxTileX, minTileY, maxTileY);
    const tiles: { x: number; y: number; z: number }[] = [];

    for (let x = minTileX; x <= maxTileX + 1; x++) {
      for (let y = minTileY; y <= maxTileY + 1; y++) {
        tiles.push({ x, y, z: zoom });
      }
    }
    console.log(tiles.length);
    return tiles;
  }, [mapRegion.latitude, mapRegion.latitudeDelta, mapRegion.longitude, mapRegion.longitudeDelta, zoom]);
  const tiles = useMemo(() => getTiles(), [getTiles]);

  return (
    <>
      {tiles.map((d) => (
        <VectorTileRenderer key={`${d.x}-${d.y}-${d.z}`} pmtile={pmtile} z={d.z} x={d.x} y={d.y} />
      ))}
    </>
  );
};

const MAPMEMO_FOLDER = `${TILE_FOLDER}/mapmemo`;
export interface TileType {
  x: number;
  y: number;
  z: number;
  topLeftXY: number[];
  bottomRightXY: number[];
  size: number;
}
interface VectorTileRendererProps {
  pmtile: PMTiles;
  z: number;
  x: number;
  y: number;
}

const VectorTileRenderer = React.memo((prop: VectorTileRendererProps) => {
  const { pmtile, z, x, y } = prop;
  // const [gl, setGl] = useState<ExpoWebGLRenderingContext | null>(null);
  // const [ctx, setCtx] = useState<Expo2DContext | null>(null);

  const { devicePixelRatio: dpr } = useWindow();
  const tileHeight = 256;
  const tileWidth = 256;

  const loadVectorTile = useCallback(
    async (tile: { x: number; y: number; z: number }) => {
      //`${MAPMEMO_FOLDER}/${z}/${x}/${y}`があれば読み込まない
      //なければpmtileから読み込む
      // const info = await FileSystem.getInfoAsync(`${MAPMEMO_FOLDER}/${z}/${x}/${y}`);
      // if (info.exists) {
      //   console.log('hit', tile.z, tile.x, tile.y);
      //   return;
      // }
      const LAYER_NAME = '北上川H30';
      const a = await pmtile.getZxy(tile.z, tile.x, tile.y);
      if (a === undefined) return;
      console.log('load pbf', tile.z, tile.x, tile.y);
      const pbf = new Pbf(a.data);
      const layer = new VectorTile.VectorTile(pbf).layers[LAYER_NAME];
      return layer;
    },
    [pmtile]
  );

  const saveMapMemo = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      try {
        //console.log('save pbf', z, x, y);

        //GLViewフォルダを作成しないと落ちる。
        //takeSnapshotAsyncのバグ？
        await FileSystem.makeDirectoryAsync(`${FileSystem.cacheDirectory}GLView`, { intermediates: true });

        await FileSystem.makeDirectoryAsync(`${MAPMEMO_FOLDER}/${z}/${x}`, {
          intermediates: true,
        });

        const glSnapshot = await GLView.takeSnapshotAsync(gl, {
          format: 'png',
          rect: {
            x: 0,
            y: 0,
            width: 256 * dpr,
            height: 256 * dpr,
          },
        });

        const image = await ImageManipulator.manipulateAsync(
          glSnapshot.uri as string,
          [{ resize: { width: 512, height: 512 } }],
          {
            compress: 1,
            format: ImageManipulator.SaveFormat.PNG,
          }
        );
        await FileSystem.moveAsync({
          from: image.uri as string,
          to: `${MAPMEMO_FOLDER}/${z}/${x}/${y}`,
        });
      } catch (e) {
        console.log(e);
        return;
      }
    },
    [dpr, x, y, z]
  );

  const getColorByCode = useCallback((code: number) => {
    if (code < 10) {
      return '#000000';
    } else if (code === 28) {
      return '#00FFFF';
    } else if (code === 10) {
      return '#FFFF00';
    } else if (code < 20) {
      return '#ff0000';
    } else if (code < 30) {
      return '#00ff00';
    } else if (code < 40) {
      return '#0000ff';
    } else if (code < 50) {
      return '#ffff00';
    } else if (code < 60) {
      return '#ff00ff';
    } else if (code < 70) {
      return '#00ffff';
    } else {
      return '#ffffff';
    }
  }, []);

  const writeVectorTile = useCallback(
    async (gl: ExpoWebGLRenderingContext, ctx: Expo2DContext, vt: VectorTile.VectorTileLayer) => {
      console.log('write pbf', z, x, y);
      ctx.clearRect(0, 0, 256 * dpr, 256 * dpr);

      for (let i = 0; i < vt.length; i++) {
        const feature = vt.feature(i);
        const type = feature.type;
        const code = Number(feature.properties['基本分類C']);
        //console.log(code);
        //console.log(`rgba(${255 - code}, ${255 - code}, ${code}, 1)`);
        //ctx.fillStyle = getRandomColor();

        // ctx.fillStyle = 'blue';
        // ctx.font = 'bold 70pt monospace';
        // ctx.fillText('Calibri', 10, 100, 1000);
        // ctx.flush();
        //console.log(feature.properties);
        //console.log(feature.type);
        const coords = feature.loadGeometry();
        if (coords[0].length < 4) continue;
        //console.log(coords.length);
        if (type === 3) {
          for (let j = 0; j < coords.length; j++) {
            ctx.beginPath();
            ctx.fillStyle = j === 0 ? getColorByCode(code) : '#00000000';
            for (let k = 0; k < coords[j].length; k++) {
              const p = coords[j][k];
              const extent = 4096;

              const x = (p.x / extent) * 256 * dpr;
              const y = (p.y / extent) * 256 * dpr;
              if (k === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
        }
      }
      ctx.flush();
      saveMapMemo(gl);
    },
    [dpr, getColorByCode, saveMapMemo, x, y, z]
  );

  const options: Expo2dContextOptions = {
    fastFillTesselation: true,
    maxGradStops: 1,
    renderWithOffscreenBuffer: true,
  };

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    //@ts-ignore

    const ctx = new Expo2DContext(gl, options);
    //await ctx.initializeText();
    //ctx.font = 'bold 70px sans-serif';
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 3;
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const vectorTile = await loadVectorTile({ x, y, z });
    if (!vectorTile) return;
    writeVectorTile(gl, ctx, vectorTile);
  };

  return (
    <GLView
      msaaSamples={0}
      style={{
        zIndex: -1,
        elevation: -1,
        position: 'absolute',
        width: tileWidth,
        height: tileHeight,
        overflow: 'hidden',
      }}
      onContextCreate={onContextCreate}
    />
  );
});
