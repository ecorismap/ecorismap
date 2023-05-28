import { Dispatch, MutableRefObject, SetStateAction, useCallback, useMemo, useRef, useState } from 'react';
import { EraserType, LineRecordType, MapMemoToolType, PenType } from '../types';
import { useWindow } from './useWindow';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { Position } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { latLonObjectsToLatLonArray, xyArrayToLatLonArray, xyArrayToLatLonObjects } from '../utils/Coords';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { GestureResponderEvent } from 'react-native';
import lineIntersect from '@turf/line-intersect';
import * as turf from '@turf/helpers';
import { addRecordsAction, setRecordSetAction } from '../modules/dataSet';
import { hsv2hex } from '../utils/Color';

export type UseMapMemoReturnType = {
  visibleMapMemoColor: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentPen: PenType;
  currentEraser: EraserType;
  penColor: string;
  penWidth: number;
  mapMemoEditingLine: MutableRefObject<Position[]>;
  editableMapMemo: boolean;
  setMapMemoTool: Dispatch<SetStateAction<MapMemoToolType>>;
  setPen: Dispatch<SetStateAction<PenType>>;
  setEraser: Dispatch<SetStateAction<EraserType>>;
  setVisibleMapMemoColor: Dispatch<SetStateAction<boolean>>;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  clearMapMemoHistory: () => void;
  onPanResponderGrantMapMemo: (event: GestureResponderEvent) => void;
  onPanResponderMoveMapMemo: (event: GestureResponderEvent) => void;
  onPanResponderReleaseMapMemo: () => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
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
  const [penColor, setPenColor] = useState('#000000');
  const [visibleMapMemoColor, setVisibleMapMemoColor] = useState(false);
  const [currentMapMemoTool, setMapMemoTool] = useState<MapMemoToolType>('NONE');
  const [currentPen, setPen] = useState<PenType>('PEN_MEDIUM');
  const [currentEraser, setEraser] = useState<EraserType>('ERASER');
  const [, setRedraw] = useState('');
  const mapMemoEditingLine = useRef<Position[]>([]);
  const offset = useRef([0, 0]);
  const dataSet = useSelector((state: AppState) => state.dataSet);
  const activeMemoLayer = useMemo(
    () => layers.find((layer) => layer.type === 'MEMO' && layer.active && layer.visible),
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

  const onPanResponderGrantMapMemo = useCallback((event: GestureResponderEvent) => {
    if (!event.nativeEvent.touches.length) return;

    offset.current = [
      event.nativeEvent.locationX - event.nativeEvent.pageX,
      event.nativeEvent.locationY - event.nativeEvent.pageY,
    ];
    const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

    mapMemoEditingLine.current = [pXY];
  }, []);

  const onPanResponderMoveMapMemo = useCallback((event: GestureResponderEvent) => {
    if (!event.nativeEvent.touches.length) return;
    const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

    mapMemoEditingLine.current = [...mapMemoEditingLine.current, pXY];
    setRedraw(uuidv4());
  }, []);

  const onPanResponderReleaseMapMemo = useCallback(() => {
    const lineLatLon = xyArrayToLatLonObjects(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);
    const lineLatLonArray = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);

    if (lineLatLon.length === 1)
      lineLatLon.push({ longitude: lineLatLon[0].longitude + 0.0000001, latitude: lineLatLon[0].latitude + 0.0000001 });

    if (currentMapMemoTool.includes('PEN')) {
      const newLine: LineRecordType = {
        id: uuidv4(),
        userId: undefined,
        displayName: null,
        visible: true,
        redraw: true,
        field: { strokeWidth: penWidth, strokeColor: penColor, zoom: mapRegion.zoom },
        coords: lineLatLon,
      };

      setHistory([...history, { operation: 'add', data: newLine }]);
      setFuture([]);
      mapMemoEditingLine.current = [];
      dispatch(addRecordsAction({ ...activeMemoRecordSet!, data: [newLine] }));
    } else if (currentMapMemoTool.includes('ERASER')) {
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
      setHistory([...history, { operation: 'remove', data: deleteLine }]);
      setFuture([]);
      mapMemoEditingLine.current = [];
      dispatch(setRecordSetAction({ ...activeMemoRecordSet!, data: newDrawLine }));
    }
  }, [
    activeMemoRecordSet,
    currentMapMemoTool,
    dispatch,
    history,
    mapRegion,
    mapSize,
    mapViewRef,
    memoLines,
    penColor,
    penWidth,
  ]);

  const selectPenColor = useCallback((hue: number, sat: number, val: number, alpha: number) => {
    setVisibleMapMemoColor(false);
    const rgb = hsv2hex(hue, sat, val, alpha);

    setPenColor(rgb);
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

  return {
    visibleMapMemoColor,
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    penWidth,
    mapMemoEditingLine,
    editableMapMemo,
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
  } as const;
};
