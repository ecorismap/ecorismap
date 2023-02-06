import { createContext } from 'react';
import { TileMapItemType } from '../types';

interface MapListContextType {
  data: TileMapItemType[];
  isLoading: boolean;
  addMap: (map: TileMapItemType) => void;
  reloadMapList: () => void;
  gotoBack: () => void;
}

export const MapListContext = createContext({} as MapListContextType);
