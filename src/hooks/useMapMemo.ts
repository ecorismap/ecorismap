import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EraserType, LineRecordType, MapMemoToolType, PenType } from '../types';
import { useWindow } from './useWindow';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { Position } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { latLonObjectsToLatLonArray, latlonArrayToLatLonObjects, xyArrayToLatLonArray } from '../utils/Coords';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { GestureResponderEvent } from 'react-native';
import lineIntersect from '@turf/line-intersect';
import * as turf from '@turf/helpers';
import { addRecordsAction, setRecordSetAction } from '../modules/dataSet';
import { hsv2rgbaString } from '../utils/Color';
import { useRecord } from './useRecord';
import { updateLayerAction } from '../modules/layers';

export type UseMapMemoReturnType = {
  visibleMapMemoColor: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentPen: PenType;
  currentEraser: EraserType;
  penColor: string;
  penWidth: number;
  mapMemoEditingLine: MutableRefObject<Position[]>;
  editableMapMemo: boolean;
  isPencilModeActive: boolean;
  isUndoable: boolean;
  isRedoable: boolean;
  mapMemoLines: {
    xy: Position[];
    latlon: Position[];
    strokeColor: string;
    strokeWidth: number;
  }[];
  setMapMemoTool: Dispatch<SetStateAction<MapMemoToolType>>;
  setPen: Dispatch<SetStateAction<PenType>>;
  setEraser: Dispatch<SetStateAction<EraserType>>;
  setVisibleMapMemoColor: Dispatch<SetStateAction<boolean>>;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  clearMapMemoHistory: () => void;
  onPanResponderGrantMapMemo: (event: GestureResponderEvent) => void;
  onPanResponderMoveMapMemo: (event: GestureResponderEvent) => void;
  onPanResponderReleaseMapMemo: (isPinch?: boolean) => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  changeColorTypeToIndividual: () => boolean;
  clearMapMemoEditingLine: () => void;
  setPencilModeActive: Dispatch<SetStateAction<boolean>>;
};
export type HistoryType = {
  operation: string;
  data: LineRecordType | { idx: number; line: LineRecordType }[];
};

export const useMapMemo = (mapViewRef: MapView | MapRef | null): UseMapMemoReturnType => {
  const dispatch = useDispatch();
  const { mapSize, mapRegion } = useWindow();
  const layers = useSelector((state: AppState) => state.layers);
  const [history, setHistory] = useState<HistoryType[]>([]);
  const [future, setFuture] = useState<HistoryType[]>([]);
  const [penColor, setPenColor] = useState('rgba(0,0,0,0.7)');
  const [visibleMapMemoColor, setVisibleMapMemoColor] = useState(false);
  const [currentMapMemoTool, setMapMemoTool] = useState<MapMemoToolType>('NONE');
  const [currentPen, setPen] = useState<PenType>('PEN_MEDIUM');
  const [currentEraser, setEraser] = useState<EraserType>('ERASER');
  const [, setRedraw] = useState('');
  const [isPencilModeActive, setPencilModeActive] = useState(false);
  const mapMemoEditingLine = useRef<Position[]>([]);
  const [mapMemoLines, setMapMemoLines] = useState<
    { xy: Position[]; latlon: Position[]; strokeColor: string; strokeWidth: number }[]
  >([]);

  const offset = useRef([0, 0]);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const MAX_HISTORY = 10;
  const timer = useRef<NodeJS.Timeout | undefined>(undefined);

  const { generateRecord } = useRecord();
  const activeMemoLayer = useMemo(
    () => layers.find((layer) => layer.type === 'LINE' && layer.active && layer.visible),
    [layers]
  );
  const activeMemoRecordSet = useMemo(
    () => dataSet.find(({ layerId }) => layerId === activeMemoLayer?.id),
    [dataSet, activeMemoLayer]
  );
  const memoLines = useMemo(
    () => (activeMemoRecordSet ? (activeMemoRecordSet.data as LineRecordType[]) : ([] as LineRecordType[])),
    [activeMemoRecordSet]
  );

  const editableMapMemo = useMemo(() => activeMemoLayer !== undefined, [activeMemoLayer]);
  const penWidth = useMemo(() => {
    return currentMapMemoTool === 'PEN_THIN'
      ? 2
      : currentMapMemoTool === 'PEN_MEDIUM'
      ? 5
      : currentMapMemoTool === 'PEN_THICK'
      ? 10
      : 1;
  }, [currentMapMemoTool]);

  const isUndoable = useMemo(() => history.length > 0, [history]);
  const isRedoable = useMemo(() => future.length > 0, [future]);

  const saveMapMemo = useCallback(
    (newMapMemoLines: { xy: Position[]; latlon: Position[]; strokeColor: string; strokeWidth: number }[]) => {
      if (newMapMemoLines.length === 0) return;
      const newHistoryItems: { operation: string; data: LineRecordType }[] = [];

      const newRecords = newMapMemoLines.map((line) => {
        const lineLatLon = latlonArrayToLatLonObjects(line.latlon);
        const newRecord = generateRecord('LINE', activeMemoLayer!, memoLines, lineLatLon) as LineRecordType;
        newRecord.field._strokeWidth = line.strokeWidth;
        newRecord.field._strokeColor = line.strokeColor;
        newRecord.field._zoom = mapRegion.zoom;
        newHistoryItems.push({ operation: 'add', data: newRecord });
        return newRecord;
      });
      dispatch(addRecordsAction({ ...activeMemoRecordSet!, data: newRecords }));
      setHistory((prev) => [...(prev.length === MAX_HISTORY ? prev.slice(1) : prev), ...newHistoryItems]);
      setFuture([]);
      setMapMemoLines([]);
    },
    [activeMemoLayer, activeMemoRecordSet, dispatch, generateRecord, mapRegion, memoLines]
  );

  const clearMapMemoEditingLine = useCallback(() => {
    mapMemoEditingLine.current = [];
  }, []);

  const onPanResponderGrantMapMemo = useCallback((event: GestureResponderEvent) => {
    if (timer) {
      clearTimeout(timer.current);
    }
    offset.current = [
      event.nativeEvent.locationX - event.nativeEvent.pageX,
      event.nativeEvent.locationY - event.nativeEvent.pageY,
    ];
  }, []);

  const onPanResponderMoveMapMemo = useCallback((event: GestureResponderEvent) => {
    if (!event.nativeEvent.touches.length) return;
    const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];
    mapMemoEditingLine.current = [...mapMemoEditingLine.current, pXY];
    setRedraw(uuidv4());
  }, []);

  const onPanResponderReleaseMapMemo = useCallback(() => {
    //const smoothedXY = smoothingByBezier(mapMemoEditingLine.current);
    //const simplifiedXY = simplify(smoothedXY);
    const simplifiedXY = [...mapMemoEditingLine.current];
    if (simplifiedXY.length === 0) {
      clearMapMemoEditingLine();
      setFuture([]);
      return;
    } else if (simplifiedXY.length === 1) {
      simplifiedXY.push([simplifiedXY[0][0] + 0.0000001, simplifiedXY[0][1] + 0.0000001]);
    }

    if (currentMapMemoTool.includes('PEN')) {
      const newMapMemoLines = [
        ...mapMemoLines,
        {
          xy: simplifiedXY,
          latlon: xyArrayToLatLonArray(simplifiedXY, mapRegion, mapSize, mapViewRef),
          strokeColor: penColor,
          strokeWidth: penWidth,
        },
      ];

      setMapMemoLines(newMapMemoLines);
      clearMapMemoEditingLine();
      timer.current = setTimeout(() => {
        saveMapMemo(newMapMemoLines);
      }, 1000);
    } else if (currentMapMemoTool.includes('ERASER')) {
      const lineLatLonArray = xyArrayToLatLonArray(simplifiedXY, mapRegion, mapSize, mapViewRef);
      const deleteLine = [] as { idx: number; line: LineRecordType }[];
      const newDrawLine = [] as LineRecordType[];
      memoLines.forEach((line, idx) => {
        const lineArray = latLonObjectsToLatLonArray(line.coords);
        if (lineIntersect(turf.lineString(lineArray), turf.lineString(lineLatLonArray)).features.length > 0) {
          deleteLine.push({ idx, line });
        } else {
          newDrawLine.push(line);
        }
      });
      setHistory((prev) => [
        ...(prev.length === MAX_HISTORY ? prev.slice(1) : prev),
        { operation: 'remove', data: deleteLine },
      ]);
      setFuture([]);
      clearMapMemoEditingLine();
      dispatch(setRecordSetAction({ ...activeMemoRecordSet!, data: newDrawLine }));
    }
  }, [
    activeMemoRecordSet,
    clearMapMemoEditingLine,
    currentMapMemoTool,
    dispatch,
    mapMemoLines,
    mapRegion,
    mapSize,
    mapViewRef,
    memoLines,
    penColor,
    penWidth,
    saveMapMemo,
  ]);

  const selectPenColor = useCallback((hue: number, sat: number, val: number, alpha: number) => {
    setVisibleMapMemoColor(false);
    const rgbaString = hsv2rgbaString(hue, sat, val, alpha);
    setPenColor(rgbaString);
  }, []);

  const clearMapMemoHistory = useCallback(() => {
    setHistory([]);
    setFuture([]);
  }, []);

  const pressUndoMapMemo = useCallback(() => {
    if (history.length === 0) return;
    const lastOperation = history[history.length - 1];
    setFuture([...future, lastOperation]);
    setHistory(history.slice(0, history.length - 1));
    if (lastOperation.operation === 'add') {
      dispatch(
        setRecordSetAction({
          ...activeMemoRecordSet!,
          data: memoLines.slice(0, memoLines.length - 1),
        })
      );
    } else if (lastOperation.operation === 'remove') {
      const newDrawLine = [...memoLines];
      (lastOperation.data as { idx: number; line: LineRecordType }[]).forEach(({ idx, line }) => {
        newDrawLine.splice(idx, 0, line);
      });
      dispatch(setRecordSetAction({ ...activeMemoRecordSet!, data: newDrawLine }));
    }
  }, [activeMemoRecordSet, dispatch, future, history, memoLines]);

  const pressRedoMapMemo = useCallback(() => {
    if (future.length === 0) return;
    const nextOperation = future[future.length - 1];
    setFuture(future.slice(0, future.length - 1));
    setHistory([...history, nextOperation]);
    if (nextOperation.operation === 'add') {
      dispatch(
        setRecordSetAction({ ...activeMemoRecordSet!, data: [...memoLines, nextOperation.data as LineRecordType] })
      );
    } else if (nextOperation.operation === 'remove') {
      const newDrawLine = [...(activeMemoRecordSet!.data as LineRecordType[])];
      (nextOperation.data as { idx: number; line: LineRecordType }[]).reverse().forEach(({ idx }) => {
        newDrawLine.splice(idx, 1);
      });
      dispatch(setRecordSetAction({ ...activeMemoRecordSet!, data: newDrawLine }));
    }
  }, [activeMemoRecordSet, dispatch, future, history, memoLines]);

  const changeColorTypeToIndividual = useCallback(() => {
    if (activeMemoLayer === undefined || activeMemoLayer.colorStyle.colorType === 'INDIVIDUAL') return false;
    const newLayer = {
      ...activeMemoLayer,
      colorStyle: { ...activeMemoLayer.colorStyle, colorType: 'INDIVIDUAL' as const },
      label: '',
    };
    dispatch(updateLayerAction(newLayer));
    return true;
  }, [activeMemoLayer, dispatch]);

  useEffect(() => {
    //activeMemoLayerが変わったら、undo,redoをクリアする
    clearMapMemoEditingLine();
  }, [activeMemoLayer, clearMapMemoEditingLine]);

  useEffect(() => {
    return () => {
      if (timer) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return {
    visibleMapMemoColor,
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    penWidth,
    mapMemoEditingLine,
    editableMapMemo,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    mapMemoLines,
    setMapMemoTool,
    setPen,
    setEraser,
    setVisibleMapMemoColor,
    selectPenColor,
    onPanResponderGrantMapMemo,
    onPanResponderMoveMapMemo,
    onPanResponderReleaseMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    clearMapMemoHistory,
    changeColorTypeToIndividual,
    clearMapMemoEditingLine,
    setPencilModeActive,
  } as const;
};
