import { createContext } from 'react';
import { DataType, RecordType } from '../types';

export interface DataSelectionContextType {
  // Data sets
  pointDataSet: DataType[];
  lineDataSet: DataType[];
  polygonDataSet: DataType[];

  // Selection state
  selectedRecord: { layerId: string; record: RecordType } | undefined;
  isEditingRecord: boolean;
}

export const DataSelectionContext = createContext<DataSelectionContextType>({
  pointDataSet: [],
  lineDataSet: [],
  polygonDataSet: [],
  selectedRecord: undefined,
  isEditingRecord: false,
});
