import { createContext } from 'react';

import { TileMapType } from '../types';

interface MapsContextType {
  progress: string;
  isLoading: boolean;
  isOffline: boolean;
  maps: TileMapType[];
  editedMap: TileMapType;
  isMapEditorOpen: boolean;
  changeVisible: (visible: boolean, index: number) => void;
  changeMapOrder: (index: number) => void;
  pressToggleOnline: () => void;
  pressDownloadMap: (item: TileMapType) => void;
  pressDeleteMap: (tileMap: TileMapType) => void;
  pressOpenEditMap: (editTileMap: TileMapType | null) => void;
  pressEditMapOK: (newTileMap: TileMapType) => void;
  pressEditMapCancel: () => void;
  gotoMapList: () => void;
  pressImportMaps: () => Promise<void>;
  pressExportMaps: () => Promise<void>;
  jumpToBoundary: (tileMap: TileMapType) => void;
  pressImportStyle: (tileMap: TileMapType) => Promise<void>;
  changeExpand: (expanded: boolean, index: number) => void;
}

export const MapsContext = createContext({} as MapsContextType);
