import { createContext } from 'react';
import { TileMapType } from '../types';

type MapEditContextType = {
  map: TileMapType;
  isEdited: boolean;
  isNewMap: boolean;
  pressDeleteMap: () => void;
  pressSaveMap: () => void;
  pressExportMap: () => void;
  gotoBack: () => void;
  pressImportStyle: () => void;
  changeMapName: (name: string) => void;
  changeMapURL: (url: string) => void;
  changeStyleURL: (url: string) => void;
  changeIsVector: (isVector: boolean) => void;
  changeIsGroup: (isGroup: boolean) => void;
  changeAttribution: (attribution: string) => void;
  changeTransparency: (transparency: number) => void;
  changeMinimumZ: (minimumZ: number) => void;
  changeMaximumZ: (maximumZ: number) => void;
  changeOverzoomThreshold: (overzoomThreshold: number) => void;
  changeHighResolutionEnabled: (enabled: boolean) => void;
  changeFlipY: (flipY: boolean) => void;
};

export const MapEditContext = createContext<MapEditContextType>({
  map: {} as TileMapType,
  isEdited: false,
  isNewMap: false,
  pressDeleteMap: () => {},
  pressSaveMap: () => {},
  pressExportMap: () => {},
  gotoBack: () => {},
  pressImportStyle: () => {},
  changeMapName: () => {},
  changeMapURL: () => {},
  changeStyleURL: () => {},
  changeIsVector: () => {},
  changeIsGroup: () => {},
  changeAttribution: () => {},
  changeTransparency: () => {},
  changeMinimumZ: () => {},
  changeMaximumZ: () => {},
  changeOverzoomThreshold: () => {},
  changeHighResolutionEnabled: () => {},
  changeFlipY: () => {},
});