import { createContext } from 'react';
import { TileMapType, TileRegionType } from '../types';

export interface TileManagementContextType {
  // Tile download related
  downloadMode: boolean;
  downloadTileMapName: string;
  tileMaps: TileMapType[];
  savedTileSize: string;
  isDownloading: boolean;
  downloadArea: {
    id: string;
    tileMapId: string;
    coords: { latitude: number; longitude: number }[];
    centroid: { latitude: number; longitude: number };
  };
  // status（未完了）で描き分けるので TileRegionType のまま渡す
  savedArea: TileRegionType[];
  downloadProgress: string;
  selectedTileMapIds: string[];
  selectedDisplayTileMapId: string | null;
  isDownloadPossible: boolean;
  toggleTileMapSelection: (tileMapId: string) => void;
  setSelectedDisplayTileMapId: (tileMapId: string | null) => void;
  pressDownloadTiles: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressDeleteTiles: () => Promise<void>;
}

export const TileManagementContext = createContext<TileManagementContextType>({
  downloadMode: false,
  downloadTileMapName: '',
  tileMaps: [],
  savedTileSize: '0',
  isDownloading: false,
  downloadArea: {
    id: '',
    tileMapId: '',
    coords: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ],
    centroid: { latitude: 0, longitude: 0 },
  },
  savedArea: [],
  downloadProgress: '',
  selectedTileMapIds: [],
  selectedDisplayTileMapId: null,
  isDownloadPossible: false,
  toggleTileMapSelection: () => {},
  setSelectedDisplayTileMapId: () => {},
  pressDownloadTiles: async () => {},
  pressStopDownloadTiles: () => {},
  pressDeleteTiles: async () => {},
});
