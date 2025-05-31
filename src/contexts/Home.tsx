import React, { RefObject, createContext } from 'react';
import {
  RecordType,
  TileMapType,
  TileRegionType,
  PointDataType,
  LineDataType,
  PolygonDataType,
  UserType,
  PenWidthType,
  MapMemoToolType,
  InfoToolType,
} from '../types';

import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { Position } from 'geojson';

export interface HomeContextType {
  // Data sets
  pointDataSet: PointDataType[];
  lineDataSet: LineDataType[];
  polygonDataSet: PolygonDataType[];

  // Tile download and maps
  downloadMode: boolean;
  tileMaps: TileMapType[];
  savedTileSize: string;
  isDownloading: boolean;
  downloadArea: TileRegionType;
  savedArea: TileRegionType[];
  downloadProgress: string;
  pressDownloadTiles: () => Promise<void>;
  pressStopDownloadTiles: () => void;
  pressDeleteTiles: () => Promise<void>;

  // General states
  isOffline: boolean;
  restored: boolean;
  attribution: string;
  selectedRecord:
    | {
        layerId: string;
        record: RecordType;
      }
    | undefined;
  isLoading: boolean;
  user: UserType;
  isEditingRecord: boolean;

  // Navigation
  gotoMaps: () => void;
  gotoSettings: () => void;
  gotoLayers: () => void;
  gotoHome: () => void;

  // Map memo
  currentMapMemoTool: MapMemoToolType;
  visibleMapMemoColor: boolean;
  currentPenWidth: PenWidthType;
  penColor: string;
  penWidth: number;
  mapMemoEditingLine: Position[];
  isPencilModeActive: boolean;
  isPencilTouch: boolean | undefined;
  isUndoable: boolean;
  isRedoable: boolean;
  mapMemoLines: {
    id?: string;
    xy: Position[];
    latlon: Position[];
    strokeColor: string;
    strokeWidth: number;
    strokeStyle?: string;
    stamp?: string;
  }[];
  isModalMapMemoToolHidden: boolean;
  selectMapMemoTool: (value: MapMemoToolType | undefined) => void;
  setPenWidth: React.Dispatch<React.SetStateAction<PenWidthType>>;
  setVisibleMapMemoColor: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoPen: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoStamp: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoBrush: React.Dispatch<React.SetStateAction<boolean>>;
  setVisibleMapMemoEraser: React.Dispatch<React.SetStateAction<boolean>>;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  togglePencilMode: () => void;

  // Info tool
  currentInfoTool: InfoToolType;
  isModalInfoToolHidden: boolean;
  isInfoToolActive: boolean;
  selectInfoTool: (value: InfoToolType | undefined) => void;
  setVisibleInfoPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setInfoToolActive: React.Dispatch<React.SetStateAction<boolean>>;
  vectorTileInfo:
    | {
        position: Position;
        properties: string;
      }
    | undefined;
  closeVectorTileInfo: () => void;

  // Other
  bottomSheetRef: RefObject<BottomSheetMethods>;
  onCloseBottomSheet: () => void;
  updatePmtilesURL: () => Promise<void>;
}

export const HomeContext = createContext({} as HomeContextType);
