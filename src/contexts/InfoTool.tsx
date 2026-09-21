import { createContext } from 'react';
import { InfoToolType } from '../types';
import { Position } from 'geojson';

export interface InfoToolContextType {
  // Info tool states
  currentInfoTool: InfoToolType;
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
  /** タップ地点のベクタタイル情報を取得してポップアップ表示する（latlon=[経度,緯度]、xy=画面座標）。3Dビューのタップからも使う */
  getInfoOfMap: (latlon: Position, xy: Position) => Promise<void>;
}

export const InfoToolContext = createContext<InfoToolContextType>({
  currentInfoTool: 'ALL_INFO',
  isInfoToolActive: false,
  vectorTileInfo: undefined,
  selectInfoTool: () => {},
  setVisibleInfoPicker: () => {},
  setInfoToolActive: () => {},
  closeVectorTileInfo: () => {},
  getInfoOfMap: async () => {},
});
