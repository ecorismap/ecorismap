import { createContext } from 'react';
import { InfoToolType } from '../types';
import { Position } from 'geojson';

export interface InfoToolContextType {
  // Info tool states
  currentInfoTool: InfoToolType;
  isModalInfoToolHidden: boolean;
  isInfoToolActive: boolean;
  vectorTileInfo:
    | {
        position: Position;
        properties: { [key: string]: any }[];
      }
    | undefined;

  // Info tool actions
  selectInfoTool: (tool: InfoToolType | undefined) => void;
  setVisibleInfoPicker: (visible: boolean) => void;
  setInfoToolActive: (active: boolean) => void;
  closeVectorTileInfo: () => void;
}

export const InfoToolContext = createContext<InfoToolContextType>({
  currentInfoTool: 'ALL_INFO',
  isModalInfoToolHidden: true,
  isInfoToolActive: false,
  vectorTileInfo: undefined,
  selectInfoTool: () => {},
  setVisibleInfoPicker: () => {},
  setInfoToolActive: () => {},
  closeVectorTileInfo: () => {},
});
