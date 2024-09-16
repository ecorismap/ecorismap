import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowStyleType, LineRecordType, MapMemoToolType, PenType } from '../types';
import { useWindow } from './useWindow';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { ulid } from 'ulid';
import {
  booleanIntersects,
  checkDistanceFromLine,
  getSnappedLine,
  getSnappedPositionWithLine,
  latLonObjectsToLatLonArray,
  latLonObjectsToXYArray,
  latlonArrayToLatLonObjects,
  smoothingByBezier,
  xyArrayToLatLonArray,
} from '../utils/Coords';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { GestureResponderEvent } from 'react-native';
//@ts-ignore
import { booleanContains, buffer } from '@turf/turf';
import * as turf from '@turf/helpers';
import { addDataAction, addRecordsAction, deleteRecordsAction, setRecordSetAction } from '../modules/dataSet';
import { hsv2rgbaString } from '../utils/Color';
import { useRecord } from './useRecord';
import { updateLayerAction } from '../modules/layers';
import { STAMP } from '../constants/AppConstants';
import { isBrushTool, isEraserTool, isPenTool, isStampTool } from '../utils/General';
import { Position } from 'geojson';

export type UseMapMemoReturnType = {
  visibleMapMemoColor: boolean;
  visibleMapMemoPen: boolean;
  visibleMapMemoStamp: boolean;
  visibleMapMemoBrush: boolean;
  visibleMapMemoEraser: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentPen: PenType;
  penColor: string;
  penWidth: number;
  mapMemoEditingLine: MutableRefObject<Position[]>;
  editableMapMemo: boolean;
  isPencilModeActive: boolean;
  isUndoable: boolean;
  isRedoable: boolean;
  mapMemoLines: MapMemoStateType[];
  snapWithLine: boolean;
  arrowStyle: ArrowStyleType;
  isStraightStyle: boolean;
  isMapMemoLineSmoothed: boolean;
  setMapMemoTool: Dispatch<SetStateAction<MapMemoToolType>>;
  setPen: Dispatch<SetStateAction<PenType>>;
  setVisibleMapMemoColor: Dispatch<SetStateAction<boolean>>;
  setVisibleMapMemoPen: Dispatch<SetStateAction<boolean>>;
  setVisibleMapMemoStamp: Dispatch<SetStateAction<boolean>>;
  setVisibleMapMemoBrush: Dispatch<SetStateAction<boolean>>;
  setVisibleMapMemoEraser: Dispatch<SetStateAction<boolean>>;
  setArrowStyle: Dispatch<SetStateAction<ArrowStyleType>>;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  clearMapMemoHistory: () => void;
  handleGrantMapMemo: (event: GestureResponderEvent) => void;
  handleMoveMapMemo: (event: GestureResponderEvent) => void;
  handleReleaseMapMemo: (event: GestureResponderEvent) => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  changeColorTypeToIndividual: () => boolean;
  clearMapMemoEditingLine: () => void;
  setPencilModeActive: Dispatch<SetStateAction<boolean>>;
  setSnapWithLine: Dispatch<SetStateAction<boolean>>;
  setIsStraightStyle: Dispatch<SetStateAction<boolean>>;
  setMapMemoLineSmoothed: Dispatch<SetStateAction<boolean>>;
};
export type HistoryType = {
  operation: string;
  data: { idx: number; line: LineRecordType }[];
};

export type MapMemoStateType = {
  xy: Position[];
  latlon: Position[];
  strokeColor: string;
  strokeWidth: number;
  strokeStyle?: string;
  stamp?: string;
  zoom?: number;
  groupId?: string;
};

export const useMapMemo = (mapViewRef: MapView | MapRef | null): UseMapMemoReturnType => {
  const dispatch = useDispatch();
  const { mapSize, mapRegion } = useWindow();
  const user = useSelector((state: RootState) => state.user);
  const layers = useSelector((state: RootState) => state.layers);
  const [history, setHistory] = useState<HistoryType[]>([]);
  const [future, setFuture] = useState<HistoryType[]>([]);
  const [penColor, setPenColor] = useState('rgba(0,0,0,0.7)');
  const [visibleMapMemoColor, setVisibleMapMemoColor] = useState(false);
  const [visibleMapMemoPen, setVisibleMapMemoPen] = useState(false);
  const [visibleMapMemoStamp, setVisibleMapMemoStamp] = useState(false);
  const [visibleMapMemoBrush, setVisibleMapMemoBrush] = useState(false);
  const [visibleMapMemoEraser, setVisibleMapMemoEraser] = useState(false);
  const [currentMapMemoTool, setMapMemoTool] = useState<MapMemoToolType>('NONE');
  const [currentPen, setPen] = useState<PenType>('PEN_MEDIUM');
  const [, setRedraw] = useState('');
  const [isPencilModeActive, setPencilModeActive] = useState(false);
  const mapMemoEditingLine = useRef<Position[]>([]);
  const [mapMemoLines, setMapMemoLines] = useState<MapMemoStateType[]>([]);
  const [arrowStyle, setArrowStyle] = useState<ArrowStyleType>('NONE');
  const [snapWithLine, setSnapWithLine] = useState(true);
  const [isStraightStyle, setIsStraightStyle] = useState(false);
  const [isMapMemoLineSmoothed, setMapMemoLineSmoothed] = useState(false);

  const snappedLine = useRef<{ coordsXY: Position[]; id: string } | undefined>(undefined);
  const snappedStartPoint = useRef<Position>([]);
  const offset = useRef([0, 0]);
  const dataSet = useSelector((state: RootState) => state.dataSet);
  const MAX_HISTORY = 10;
  const timer = useRef<NodeJS.Timeout | undefined>(undefined);

  const { generateRecord } = useRecord();
  const activeMemoLayer = useMemo(
    () => layers.find((layer) => layer.type === 'LINE' && layer.active && layer.visible),
    [layers]
  );
  const activeMemoRecordSet = useMemo(
    () => dataSet.find(({ layerId, userId }) => layerId === activeMemoLayer?.id && userId === user.uid),
    [dataSet, activeMemoLayer?.id, user.uid]
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
    (newMapMemoLines: MapMemoStateType[]) => {
      if (newMapMemoLines.length === 0) return;
      const newHistoryItems: HistoryType[] = [];

      const newRecords = newMapMemoLines
        .map((line) => {
          const lineLatLon = latlonArrayToLatLonObjects(line.latlon);
          const newRecord = generateRecord('LINE', activeMemoLayer!, memoLines, lineLatLon, {
            groupId: line.groupId,
          }) as LineRecordType;

          newRecord.field._strokeWidth = line.strokeWidth;
          newRecord.field._strokeColor = line.strokeColor;
          newRecord.field._strokeStyle = line.strokeStyle ?? '';
          newRecord.field._stamp = line.stamp ?? '';
          newRecord.field._group = line.groupId ?? '';
          newRecord.field._zoom = line.zoom ?? 0;
          newHistoryItems.push({ operation: 'add', data: [{ idx: -1, line: newRecord }] });
          return newRecord;
        })
        .flat();
      if (activeMemoRecordSet === undefined) {
        dispatch(addDataAction([{ layerId: activeMemoLayer!.id, userId: user.uid, data: newRecords }]));
      } else {
        dispatch(addRecordsAction({ ...activeMemoRecordSet, data: newRecords }));
      }

      setHistory((prev) => [...(prev.length === MAX_HISTORY ? prev.slice(1) : prev), ...newHistoryItems]);
      setFuture([]);
      setMapMemoLines([]);
    },
    [activeMemoLayer, activeMemoRecordSet, dispatch, generateRecord, memoLines, user.uid]
  );

  const clearMapMemoEditingLine = useCallback(() => {
    mapMemoEditingLine.current = [];
    snappedLine.current = undefined;
  }, []);

  const findSnappedLine = useCallback(
    (pXY: Position) => {
      for (const line of memoLines) {
        if (line.visible === false) continue;
        if (line.coords === undefined) continue;
        if (line.field._stamp !== '') continue;
        if (isBrushTool(line.field._strokeStyle as string)) continue;
        const lineXY = latLonObjectsToXYArray(line.coords, mapRegion, mapSize, mapViewRef);
        if (checkDistanceFromLine(pXY, lineXY).isNear) {
          return { coordsXY: lineXY, id: line.id };
        }
      }
      return undefined;
    },
    [mapRegion, mapSize, mapViewRef, memoLines]
  );

  const handleGrantMapMemo = useCallback(
    (event: GestureResponderEvent) => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      offset.current = [
        event.nativeEvent.locationX - event.nativeEvent.pageX,
        event.nativeEvent.locationY - event.nativeEvent.pageY,
      ];
      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];
      if (isStampTool(currentMapMemoTool)) {
        const result = findSnappedLine(pXY);
        if (result && snapWithLine) {
          const snappedPoint = getSnappedPositionWithLine(pXY, result.coordsXY, { isXY: true }).position;
          snappedLine.current = { coordsXY: result.coordsXY, id: result.id };
          mapMemoEditingLine.current = [snappedPoint];
        } else {
          mapMemoEditingLine.current = [pXY];
        }
      } else if (isBrushTool(currentMapMemoTool)) {
        const result = findSnappedLine(pXY);
        if (result) {
          snappedStartPoint.current = getSnappedPositionWithLine(pXY, result.coordsXY, { isXY: true }).position;
          snappedLine.current = { coordsXY: result.coordsXY, id: result.id };
          return;
        }
      } else if (isPenTool(currentMapMemoTool) || isEraserTool(currentMapMemoTool)) {
        mapMemoEditingLine.current = [pXY];
      }

      setRedraw(ulid());
    },
    [currentMapMemoTool, findSnappedLine, snapWithLine]
  );

  const handleMoveMapMemo = useCallback(
    (event: GestureResponderEvent) => {
      if (!event.nativeEvent.touches.length) return;
      const isSnappedWithLine = snappedLine.current !== undefined && snappedLine.current.coordsXY.length > 1;

      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];
      if (isStampTool(currentMapMemoTool)) {
        if (isSnappedWithLine && snapWithLine) {
          mapMemoEditingLine.current = [
            getSnappedPositionWithLine(pXY, snappedLine.current!.coordsXY, { isXY: true }).position,
          ];
        } else {
          mapMemoEditingLine.current = [pXY];
        }
      } else if (isBrushTool(currentMapMemoTool)) {
        if (!isSnappedWithLine) return;
        const snappedEndPoint = getSnappedPositionWithLine(pXY, snappedLine.current!.coordsXY, { isXY: true }).position;
        const brushLine = getSnappedLine(snappedStartPoint.current, snappedEndPoint, snappedLine.current!.coordsXY);
        mapMemoEditingLine.current = brushLine;
      } else {
        if (isStraightStyle && isPenTool(currentMapMemoTool)) {
          mapMemoEditingLine.current = [mapMemoEditingLine.current[0], pXY];
        } else {
          mapMemoEditingLine.current = [...mapMemoEditingLine.current, pXY];
        }
      }
      setRedraw(ulid());
    },
    [currentMapMemoTool, isStraightStyle, snapWithLine]
  );

  const handleReleaseMapMemo = useCallback(() => {
    const isSnappedWithLine = snappedLine.current !== undefined && snappedLine.current.coordsXY.length > 1;

    if (isPenTool(currentMapMemoTool)) {
      let drawingLine = [...mapMemoEditingLine.current];
      if (isMapMemoLineSmoothed && !isStraightStyle) {
        if (drawingLine.length > 8) {
          drawingLine = drawingLine.slice(2, -2); //ハネを削除
        }
        const smoothedXY = smoothingByBezier(drawingLine);
        //drawingLine = simplify(smoothedXY);
        drawingLine = smoothedXY;
      }

      if (drawingLine.length === 0) {
        clearMapMemoEditingLine();
        setFuture([]);
        return;
      } else if (drawingLine.length === 1) {
        drawingLine.push([drawingLine[0][0] + 0.0000001, drawingLine[0][1] + 0.0000001]);
      }

      const newMapMemoLines = [
        ...mapMemoLines,
        {
          xy: drawingLine,
          latlon: xyArrayToLatLonArray(drawingLine, mapRegion, mapSize, mapViewRef),
          zoom: mapRegion.zoom,
          strokeColor: penColor,
          strokeWidth: penWidth,
          strokeStyle: arrowStyle,
          stamp: '',
        },
      ];

      setMapMemoLines(newMapMemoLines);
      clearMapMemoEditingLine();

      timer.current = setTimeout(() => {
        saveMapMemo(newMapMemoLines);
      }, 500);
    } else if (isStampTool(currentMapMemoTool)) {
      const newMapMemoLines = [
        {
          xy: mapMemoEditingLine.current,
          latlon: xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef),
          zoom: mapRegion.zoom,
          strokeColor: penColor,
          strokeWidth: penWidth,
          strokeStyle: '',
          stamp: currentMapMemoTool,
          groupId: snappedLine.current ? snappedLine.current.id : undefined,
        },
      ];
      clearMapMemoEditingLine();
      saveMapMemo(newMapMemoLines);
    } else if (isBrushTool(currentMapMemoTool)) {
      if (!isSnappedWithLine) return;
      const brushLine = [...mapMemoEditingLine.current];
      if (brushLine.length < 2) return;
      const newMapMemoLines = [
        ...mapMemoLines,
        {
          xy: mapMemoEditingLine.current,
          latlon: xyArrayToLatLonArray(brushLine, mapRegion, mapSize, mapViewRef),
          zoom: mapRegion.zoom,
          strokeColor: penColor,
          strokeWidth: penWidth,
          strokeStyle: currentMapMemoTool,
          groupId: snappedLine.current ? snappedLine.current.id : undefined,
        },
      ];
      clearMapMemoEditingLine();
      saveMapMemo(newMapMemoLines);
    } else if (currentMapMemoTool === 'BRUSH_ERASER') {
      const eraserLineLatLonArray = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);

      const deletedLines: { idx: number; line: LineRecordType }[] = [];

      memoLines.forEach((line, idx) => {
        if (line.coords === undefined) return;
        if (!isBrushTool(line.field._strokeStyle as string)) return;
        const lineArray = latLonObjectsToLatLonArray(line.coords);

        const brushLineGeometry = turf.lineString(lineArray);
        const lineGeometry = turf.lineString(eraserLineLatLonArray);
        if (booleanIntersects(brushLineGeometry, lineGeometry)) {
          deletedLines.push({ idx, line });
        }
      });
      if (deletedLines.length > 0) {
        setHistory((prev) => [
          ...(prev.length === MAX_HISTORY ? prev.slice(1) : prev),
          { operation: 'remove', data: deletedLines },
        ]);
        dispatch(
          deleteRecordsAction({
            layerId: activeMemoLayer!.id,
            userId: user.uid,
            data: deletedLines.map((dline) => dline.line),
          })
        );
      }
      setFuture([]);
      clearMapMemoEditingLine();
    } else if (currentMapMemoTool === 'STAMP_ERASER') {
      const eraserLineLatLonArray = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);
      const deletedLines: { idx: number; line: LineRecordType }[] = [];

      memoLines.forEach((line, idx) => {
        if (line.coords === undefined) return;
        if (!Object.keys(STAMP).includes(line.field._stamp as string)) return;
        const stampLatLon = latLonObjectsToLatLonArray(line.coords)[0];
        const stampGeometry = buffer(turf.point(stampLatLon), mapRegion.latitudeDelta);
        if (stampGeometry === undefined) return;
        let polygonGeometry;
        if (eraserLineLatLonArray.length < 4) {
          //3点以下の場合は、4点のラインにしてバッファを作成して判定する
          eraserLineLatLonArray.push([
            eraserLineLatLonArray[0][0] + 0.0000001,
            eraserLineLatLonArray[0][1] + 0.0000001,
          ]);
          polygonGeometry = buffer(turf.lineString(eraserLineLatLonArray), mapRegion.latitudeDelta);
        } else {
          //4点以上の場合は、最初の点を最後に追加してポリゴンを作成する
          eraserLineLatLonArray.push(eraserLineLatLonArray[0]);
          polygonGeometry = turf.polygon([eraserLineLatLonArray]);
        }
        if (polygonGeometry === undefined) return;
        if (booleanContains(polygonGeometry, stampGeometry) || booleanIntersects(polygonGeometry, stampGeometry)) {
          deletedLines.push({ idx, line });
        }
      });
      if (deletedLines.length > 0) {
        setHistory((prev) => [
          ...(prev.length === MAX_HISTORY ? prev.slice(1) : prev),
          { operation: 'remove', data: deletedLines },
        ]);
        dispatch(
          deleteRecordsAction({
            layerId: activeMemoLayer!.id,
            userId: user.uid,
            data: deletedLines.map((dline) => dline.line),
          })
        );
      }
      setFuture([]);
      clearMapMemoEditingLine();
    } else if (currentMapMemoTool === 'PEN_ERASER') {
      const eraserLineLatLonArray = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);
      if (eraserLineLatLonArray.length === 1)
        eraserLineLatLonArray.push([eraserLineLatLonArray[0][0] + 0.0000001, eraserLineLatLonArray[0][1] + 0.0000001]);
      const deletedLines: { idx: number; line: LineRecordType }[] = [];
      const otherLines: { idx: number; line: LineRecordType }[] = [];
      memoLines.forEach((line, idx) => {
        if (line.coords === undefined) return;
        const lineArray = latLonObjectsToLatLonArray(line.coords);
        if (lineArray.length === 1) lineArray.push([lineArray[0][0] + 0.0000001, lineArray[0][1] + 0.0000001]);
        const lineGeometry = turf.lineString(lineArray);
        if (booleanIntersects(turf.lineString(eraserLineLatLonArray), lineGeometry)) {
          deletedLines.push({ idx, line });
        } else {
          otherLines.push({ idx, line });
        }
      });
      if (deletedLines.length > 0) {
        //deleteLineとgroupが同じものをdeleteLineに移動する
        const updatedDeletedLines = [...deletedLines];
        otherLines.forEach(({ idx, line }) => {
          const sameGroup = deletedLines.find((dline) => dline.line.id === line.field._group);
          if (sameGroup) updatedDeletedLines.push({ idx, line });
        });
        //updateDeletedLinesのidxを昇順にソートする
        updatedDeletedLines.sort((a, b) => a.idx - b.idx);
        setHistory((prev) => [
          ...(prev.length === MAX_HISTORY ? prev.slice(1) : prev),
          { operation: 'remove', data: updatedDeletedLines },
        ]);
        dispatch(
          deleteRecordsAction({
            layerId: activeMemoLayer!.id,
            userId: user.uid,
            data: updatedDeletedLines.map((dline) => dline.line),
          })
        );
      }

      setFuture([]);
      clearMapMemoEditingLine();
    }
  }, [
    activeMemoLayer,
    arrowStyle,
    clearMapMemoEditingLine,
    currentMapMemoTool,
    dispatch,
    isMapMemoLineSmoothed,
    isStraightStyle,
    mapMemoLines,
    mapRegion,
    mapSize,
    mapViewRef,
    memoLines,
    penColor,
    penWidth,
    saveMapMemo,
    user.uid,
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
      //最後に追加したラインを削除する.
      const newDrawLine = memoLines.filter((line) => lastOperation.data.every((dline) => dline.line.id !== line.id));
      dispatch(
        setRecordSetAction({
          ...activeMemoRecordSet!,
          data: newDrawLine,
        })
      );
    } else if (lastOperation.operation === 'remove') {
      //最後に削除したラインを追加する.
      const newDrawLine = [...memoLines];
      [...lastOperation.data].reverse().forEach(({ idx, line }) => newDrawLine.splice(idx, 0, line));
      dispatch(setRecordSetAction({ ...activeMemoRecordSet!, data: newDrawLine }));
    }
  }, [activeMemoRecordSet, dispatch, future, history, memoLines]);

  const pressRedoMapMemo = useCallback(() => {
    if (future.length === 0) return;
    const nextOperation = future[future.length - 1];
    setFuture(future.slice(0, future.length - 1));
    setHistory([...history, nextOperation]);
    if (nextOperation.operation === 'add') {
      //futureの最後のaddのラインを追加する
      const addedLines = nextOperation.data.map((operation) => operation.line);
      dispatch(setRecordSetAction({ ...activeMemoRecordSet!, data: [...memoLines, ...addedLines] }));
    } else if (nextOperation.operation === 'remove') {
      //futureの最後のremoveのラインを削除する
      const newDrawLine = [...(activeMemoRecordSet!.data as LineRecordType[])];
      [...nextOperation.data].reverse().forEach(({ idx }) => {
        newDrawLine.splice(idx, 1);
      });
      dispatch(setRecordSetAction({ ...activeMemoRecordSet!, data: newDrawLine }));
    }
  }, [activeMemoRecordSet, dispatch, future, history, memoLines]);

  const changeColorTypeToIndividual = useCallback(() => {
    if (activeMemoLayer === undefined || activeMemoLayer.colorStyle.colorType === 'INDIVIDUAL') return false;
    const newLayer = {
      ...activeMemoLayer,
      colorStyle: {
        ...activeMemoLayer.colorStyle,
        colorType: 'INDIVIDUAL' as const,
        fieldName: '__CUSTOM',
        customFieldValue: '_strokeColor',
      },
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
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return {
    visibleMapMemoColor,
    visibleMapMemoPen,
    visibleMapMemoStamp,
    visibleMapMemoBrush,
    visibleMapMemoEraser,
    currentMapMemoTool,
    currentPen,
    penColor,
    penWidth,
    mapMemoEditingLine,
    editableMapMemo,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    mapMemoLines,
    snapWithLine,
    arrowStyle,
    isStraightStyle,
    isMapMemoLineSmoothed,
    setMapMemoTool,
    setPen,
    setVisibleMapMemoColor,
    setVisibleMapMemoPen,
    setVisibleMapMemoStamp,
    setVisibleMapMemoBrush,
    setVisibleMapMemoEraser,
    setArrowStyle,
    selectPenColor,
    handleGrantMapMemo,
    handleMoveMapMemo,
    handleReleaseMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    clearMapMemoHistory,
    changeColorTypeToIndividual,
    clearMapMemoEditingLine,
    setPencilModeActive,
    setSnapWithLine,
    setIsStraightStyle,
    setMapMemoLineSmoothed,
  } as const;
};
