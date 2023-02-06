import { createContext } from 'react';

import { TileMapType } from '../types';

interface MapsContextType {
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
}

export const MapsContext = createContext({} as MapsContextType);
