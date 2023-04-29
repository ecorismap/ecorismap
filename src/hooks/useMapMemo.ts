import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { EraserType, MapMemoToolType, PenType } from '../types';
import { hsv2rgb } from '../utils/Color';
import * as FileSystem from 'expo-file-system';
import { MAPMEMO_FOLDER } from '../constants/AppConstants';

export type UseMapMemoReturnType = {
  visibleMapMemo: boolean;
  refreshMapMemo: boolean;
  visibleMapMemoColor: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentPen: PenType;
  currentEraser: EraserType;
  penColor: string;
  setMapMemoTool: Dispatch<SetStateAction<MapMemoToolType>>;
  setPen: Dispatch<SetStateAction<PenType>>;
  setEraser: Dispatch<SetStateAction<EraserType>>;
  setVisibleMapMemo: Dispatch<SetStateAction<boolean>>;
  setRefreshMapMemo: Dispatch<SetStateAction<boolean>>;
  setVisibleMapMemoColor: Dispatch<SetStateAction<boolean>>;
  selectPenColor: (hue: number, sat: number, val: number) => void;
  clearMapMemo: () => Promise<void>;
};

export const useMapMemo = (): UseMapMemoReturnType => {
  const [visibleMapMemo, setVisibleMapMemo] = useState(true);
  const [refreshMapMemo, setRefreshMapMemo] = useState(true);
  const [penColor, setPenColor] = useState('#000000');
  const [visibleMapMemoColor, setVisibleMapMemoColor] = useState(false);
  const [currentMapMemoTool, setMapMemoTool] = useState<MapMemoToolType>('NONE');
  const [currentPen, setPen] = useState<PenType>('PEN_MEDIUM');
  const [currentEraser, setEraser] = useState<EraserType>('ERASER_MEDIUM');

  const selectPenColor = useCallback((hue: number, sat: number, val: number) => {
    setVisibleMapMemoColor(false);
    const rgb = hsv2rgb(hue, sat, val);

    setPenColor(rgb);
  }, []);

  const clearMapMemo = useCallback(async () => {
    const { uri } = await FileSystem.getInfoAsync(MAPMEMO_FOLDER);
    if (uri) {
      await FileSystem.deleteAsync(uri);
      setRefreshMapMemo(false);
    }
  }, []);

  return {
    visibleMapMemo,
    refreshMapMemo,
    visibleMapMemoColor,
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    setVisibleMapMemo,
    setMapMemoTool,
    setPen,
    setEraser,
    setRefreshMapMemo,
    setVisibleMapMemoColor,
    selectPenColor,
    clearMapMemo,
  } as const;
};
