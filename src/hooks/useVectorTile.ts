import { Position } from '@turf/turf';
import { useCallback, useState } from 'react';
import { latLonToXY } from '../utils/Coords';
import { latToTileY, lonToTileX } from '../utils/Tile';
import MapView, { MapPressEvent } from 'react-native-maps';
import { useWindow } from './useWindow';
import { MapRef } from 'react-map-gl';
import { fetchVectorTileInfo } from '../utils/VectorTile';
import { AppState } from '../modules';
import { useSelector } from 'react-redux';

export type UseVectorTileReturnType = {
  vectorTileInfo:
    | {
        position: Position;
        properties: string;
      }
    | undefined;
  getVectorTileInfo: (e: MapPressEvent, mapViewRef: MapView | MapRef | null, zoom: number) => Promise<void>;
  closeVectorTileInfo: () => void;
};

export const useVectorTile = (): UseVectorTileReturnType => {
  const { mapSize, mapRegion } = useWindow();
  const tileMaps = useSelector((state: AppState) => state.tileMaps);
  const [vectorTileInfo, setVectorTileInfo] = useState<
    | {
        position: Position;
        properties: string;
      }
    | undefined
  >(undefined);

  const closeVectorTileInfo = useCallback(() => {
    setVectorTileInfo(undefined);
  }, []);

  const getVectorTileInfo = useCallback(
    async (e: MapPressEvent, mapViewRef: MapView | MapRef | null, zoom: number) => {
      const latlon = [e.nativeEvent.coordinate.longitude, e.nativeEvent.coordinate.latitude];
      const position = latLonToXY(latlon, mapRegion, mapSize, mapViewRef);
      const tileX = lonToTileX(latlon[0], zoom);
      const tileY = latToTileY(latlon[1], zoom);
      let properties: { [key: string]: any } | undefined;
      for (const tileMap of tileMaps) {
        properties = await fetchVectorTileInfo(tileMap.id, latlon, { x: tileX, y: tileY, z: zoom });
        if (properties !== undefined) break;
      }
      if (properties === undefined) {
        closeVectorTileInfo();
      } else {
        const str = Object.keys(properties)
          //@ts-ignore
          .map((key) => `${key}:${properties[key]}`)
          .join('\n');
        setVectorTileInfo({ position, properties: str });
      }
    },
    [closeVectorTileInfo, mapRegion, mapSize, tileMaps]
  );

  return {
    vectorTileInfo,
    getVectorTileInfo,
    closeVectorTileInfo,
  } as const;
};
