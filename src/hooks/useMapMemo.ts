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
//@ts-ignore
import { booleanContains, booleanIntersects } from '@turf/turf';
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
  onPanResponderReleaseMapMemo: (event: GestureResponderEvent) => void;
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

  const calcArrowedXY = useCallback((xy: Position[]) => {
    //終点から2点目までのベクトルを求め、そのベクトルに対して+-30度の方向を向くベクトルを求め矢印の羽根の先端とする。
    //そのベクトルの長さを元のベクトルの長さの3倍にして、羽根の長さを調整する。
    //羽根の部分のみを一本の線として返す。
    if (xy.length < 2) return [];
    const lastPoint = xy[xy.length - 1];
    const secondPoint = xy[xy.length - 2];
    let vector;
    if (xy.length === 2) {
      vector = [lastPoint[0] - secondPoint[0], lastPoint[1] - secondPoint[1]];
    } else {
      const thirdPoint = xy[xy.length - 3];
      // Calculate the average vector
      vector = [
        (lastPoint[0] - thirdPoint[0] + lastPoint[0] - secondPoint[0]) / 2,
        (lastPoint[1] - thirdPoint[1] + lastPoint[1] - secondPoint[1]) / 2,
      ];
    }
    const vectorLength = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
    const vectorUnit = [vector[0] / vectorLength, vector[1] / vectorLength];
    const vectorUnitX = vectorUnit[0];
    const vectorUnitY = vectorUnit[1];
    const vectorUnitX30 = vectorUnitX * Math.cos((30 * Math.PI) / 180) - vectorUnitY * Math.sin((30 * Math.PI) / 180);
    const vectorUnitY30 = vectorUnitX * Math.sin((30 * Math.PI) / 180) + vectorUnitY * Math.cos((30 * Math.PI) / 180);
    const vectorUnitXm30 =
      vectorUnitX * Math.cos((-30 * Math.PI) / 180) - vectorUnitY * Math.sin((-30 * Math.PI) / 180);
    const vectorUnitYm30 =
      vectorUnitX * Math.sin((-30 * Math.PI) / 180) + vectorUnitY * Math.cos((-30 * Math.PI) / 180);

    const arrowLength = 20;
    return [
      [lastPoint[0] - vectorUnitX30 * arrowLength, lastPoint[1] - vectorUnitY30 * arrowLength],
      [lastPoint[0], lastPoint[1]],
      [lastPoint[0] - vectorUnitXm30 * arrowLength, lastPoint[1] - vectorUnitYm30 * arrowLength],
    ];
  }, []);

  const onPanResponderReleaseMapMemo = useCallback(
    (event: GestureResponderEvent) => {
      //const smoothedXY = smoothingByBezier(mapMemoEditingLine.current);
      //const simplifiedXY = simplify(smoothedXY);

      //const simplifiedXY = removeSharpTurns(mapMemoEditingLine.current);
      const simplifiedXY = [...mapMemoEditingLine.current];
      if (simplifiedXY.length === 0) {
        console.log('no line');
        simplifiedXY.push([event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]]);
        console.log(simplifiedXY);
        // clearMapMemoEditingLine();
        // setFuture([]);
        // return;
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
        //先端を矢印にする関数を呼び出す
        if (simplifiedXY.length > 1 || currentMapMemoTool === 'PEN_ARROW') {
          const arrowedXY = calcArrowedXY(simplifiedXY);
          const arrowedLatLon = xyArrayToLatLonArray(arrowedXY, mapRegion, mapSize, mapViewRef);
          const arrowedLine = {
            xy: arrowedXY,
            latlon: arrowedLatLon,
            strokeColor: penColor,
            strokeWidth: penWidth,
          };
          newMapMemoLines.push(arrowedLine);
        }
        setMapMemoLines(newMapMemoLines);
        clearMapMemoEditingLine();
        timer.current = setTimeout(() => {
          saveMapMemo(newMapMemoLines);
        }, 300);
      } else if (currentMapMemoTool.includes('ERASER')) {
        const lineLatLonArray = xyArrayToLatLonArray(simplifiedXY, mapRegion, mapSize, mapViewRef);
        const deleteLine = [] as { idx: number; line: LineRecordType }[];
        const newDrawLine = [] as LineRecordType[];
        memoLines.forEach((line, idx) => {
          const lineArray = latLonObjectsToLatLonArray(line.coords);
          if (lineArray.length === 1) lineArray.push([lineArray[0][0] + 0.0000001, lineArray[0][1] + 0.0000001]);
          const lineGeometry = turf.lineString(lineArray);
          const polygonGeometry = turf.polygon([[...lineLatLonArray, lineLatLonArray[0]]]);

          if (booleanContains(polygonGeometry, lineGeometry) || booleanIntersects(polygonGeometry, lineGeometry)) {
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
    },
    [
      activeMemoRecordSet,
      calcArrowedXY,
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
    ]
  );

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
