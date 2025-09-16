import { createContext } from 'react';

import { TileMapType } from '../types';

export interface MapsContextType {
  progress: string;
  isLoading: boolean;
  isOffline: boolean;
  maps: TileMapType[];
  filterdMaps: TileMapType[];
  changeVisible: (visible: boolean, tileMap: TileMapType) => void;
  pressToggleOnline: () => void;
  pressDownloadMap: (item: TileMapType) => void;
  pressDeleteMap: (tileMap: TileMapType) => void;
  gotoMapEdit: (editTileMap: TileMapType | null) => void;
  gotoMapList: () => void;
  pressImportMaps: () => Promise<void>;
  pressExportMaps: () => Promise<void>;
  jumpToBoundary: (tileMap: TileMapType) => void;
  pressImportStyle: (tileMap: TileMapType) => Promise<void>;
  changeExpand: (expanded: boolean, tileMap: TileMapType) => void;
  pressMapOrder: (tileMap: TileMapType, direction: 'up' | 'down') => void;
  updateMapOrder: (data: TileMapType[], from: number, to: number) => void;
  onDragBegin: (tileMap: TileMapType) => void;
  pressExportMap: (tileMap: TileMapType) => Promise<void>;
}

export const MapsContext = createContext({} as MapsContextType);
