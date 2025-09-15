import { useCallback, useState } from 'react';
import { latToTileY, lonToTileX } from '../utils/Tile';
import { fetchVectorTileInfo } from '../utils/VectorTile';
import { RootState } from '../store';
import { useSelector } from 'react-redux';
import { Position } from 'geojson';

export type UseVectorTileReturnType = {
  vectorTileInfo:
    | {
        position: Position;
        properties: { [key: string]: any }[];
      }
    | undefined;
  getVectorTileInfo: (
    latlon: number[],
    zoom: number
  ) => Promise<
    {
      [key: string]: any;
    }[]
  >;
  openVectorTileInfo: (
    properties: {
      [key: string]: any;
    }[],
    position: Position
  ) => void;
  closeVectorTileInfo: () => void;
};

export const useVectorTile = (): UseVectorTileReturnType => {
  const tileMaps = useSelector((state: RootState) => state.tileMaps);
  const [vectorTileInfo, setVectorTileInfo] = useState<
    | {
        position: Position;
        properties: { [key: string]: any }[];
      }
    | undefined
  >(undefined);

  const closeVectorTileInfo = useCallback(() => {
    setVectorTileInfo(undefined);
  }, []);

  const getVectorTileInfo = useCallback(
    async (latlon: number[], zoom: number) => {
      const properties: { [key: string]: any }[] = [];
      const maxZoomLevelsToCheck = 4; // 最大4レベル下まで検索
      
      // 現在のズームレベルから順に低いズームレベルまで検索
      for (let currentZoom = zoom; currentZoom >= Math.max(zoom - maxZoomLevelsToCheck, 1); currentZoom--) {
        const tileX = lonToTileX(latlon[0], currentZoom);
        const tileY = latToTileY(latlon[1], currentZoom);
        
        for (const tileMap of tileMaps) {
          if (!(tileMap.visible && (tileMap.url.includes('pmtiles') || tileMap.url.includes('.pbf')))) continue;
          
          const propertyList = await fetchVectorTileInfo(tileMap.id, latlon, { x: tileX, y: tileY, z: currentZoom });
          properties.push(...propertyList);
        }
        
        // 何か情報が見つかったら検索を終了
        if (properties.length > 0) {
          break;
        }
      }
      
      return properties;
    },
    [tileMaps]
  );

  const openVectorTileInfo = useCallback((properties: { [key: string]: any }[], position: Position) => {
    if (properties.length === 0) {
      setVectorTileInfo(undefined);
      return;
    }
    setVectorTileInfo({ position, properties });
  }, []);

  return {
    vectorTileInfo,
    getVectorTileInfo,
    openVectorTileInfo,
    closeVectorTileInfo,
  } as const;
};
