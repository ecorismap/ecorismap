import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowStyleType, LineRecordType, MapMemoToolType, PenWidthType } from '../types';
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
import {
  addDataAction,
  addRecordsAction,
  deleteRecordsAction,
  setRecordSetAction,
  updateRecordsAction,
} from '../modules/dataSet';
import { hsv2rgbaString } from '../utils/Color';
import { useRecord } from './useRecord';
import { updateLayerAction } from '../modules/layers';
import { STAMP } from '../constants/AppConstants';
import { isBrushTool, isEraserTool, isPenTool, isStampTool } from '../utils/General';
import { Position } from 'geojson';
import { editSettingsAction } from '../modules/settings';

// Type Definitions
export type UseMapMemoReturnType = {
  visibleMapMemoColor: boolean;
  visibleMapMemoPen: boolean;
  visibleMapMemoStamp: boolean;
  visibleMapMemoBrush: boolean;
  visibleMapMemoEraser: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentPenWidth: PenWidthType;
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
  isModalMapMemoToolHidden: boolean;
  isEditingLine: boolean;
  editingLineId: string | undefined;
  setMapMemoTool: Dispatch<SetStateAction<MapMemoToolType>>;
  setPenWidth: Dispatch<SetStateAction<PenWidthType>>;
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
  handleLongPressMapMemo: (event: GestureResponderEvent) => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  changeColorTypeToIndividual: () => boolean;
  clearMapMemoEditingLine: () => void;
  setPencilModeActive: Dispatch<SetStateAction<boolean>>;
  setSnapWithLine: Dispatch<SetStateAction<boolean>>;
  setIsStraightStyle: Dispatch<SetStateAction<boolean>>;
  setMapMemoLineSmoothed: Dispatch<SetStateAction<boolean>>;
  setIsModalMapMemoToolHidden: (value: boolean) => void;
};

export type HistoryType = {
  operation: 'add' | 'remove' | 'update';
  data: { idx: number; line: LineRecordType; updatedLine?: LineRecordType }[];
};

export type MapMemoStateType = {
  id?: string;
  xy: Position[];
  latlon: Position[];
  strokeColor: string;
  strokeWidth: number;
  strokeStyle?: string;
  stamp?: string;
  zoom?: number;
  groupId?: string;
  record?: any;
};

// Constants
const MAX_HISTORY = 10;

/**
 * Custom hook to manage map memo functionality
 */
export const useMapMemo = (mapViewRef: MapView | MapRef | null): UseMapMemoReturnType => {
  const dispatch = useDispatch();
  const { mapSize, mapRegion } = useWindow();
  const user = useSelector((state: RootState) => state.user);
  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector((state: RootState) => state.dataSet);
  const isModalMapMemoToolHidden = useSelector((state: RootState) => state.settings.isModalMapMemoToolHidden);

  // State management
  const [history, setHistory] = useState<HistoryType[]>([]);
  const [future, setFuture] = useState<HistoryType[]>([]);
  const [penColor, setPenColor] = useState('rgba(0,0,0,0.7)');
  const [mapMemoLines, setMapMemoLines] = useState<MapMemoStateType[]>([]);
  const [isEditingLine, setIsEditingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | undefined>(undefined);
  const [_editingLineIndex, setEditingLineIndex] = useState<number | undefined>(undefined);
  const [editingPointIndex, setEditingPointIndex] = useState<number | undefined>(undefined);

  // Visibility state
  const [visibleMapMemoColor, setVisibleMapMemoColor] = useState(false);
  const [visibleMapMemoPen, setVisibleMapMemoPen] = useState(false);
  const [visibleMapMemoStamp, setVisibleMapMemoStamp] = useState(false);
  const [visibleMapMemoBrush, setVisibleMapMemoBrush] = useState(false);
  const [visibleMapMemoEraser, setVisibleMapMemoEraser] = useState(false);

  // Tool settings
  const [currentMapMemoTool, setMapMemoTool] = useState<MapMemoToolType>('NONE');
  const [currentPenWidth, setPenWidth] = useState<PenWidthType>('PEN_MEDIUM');
  const [isPencilModeActive, setPencilModeActive] = useState(false);
  const [arrowStyle, setArrowStyle] = useState<ArrowStyleType>('NONE');
  const [snapWithLine, setSnapWithLine] = useState(true);
  const [isStraightStyle, setIsStraightStyle] = useState(false);
  const [isMapMemoLineSmoothed, setMapMemoLineSmoothed] = useState(false);

  // Force redraw mechanism
  const [, setRedraw] = useState('');

  // Refs
  const mapMemoEditingLine = useRef<Position[]>([]);
  const snappedLine = useRef<{ coordsXY: Position[]; id: string } | undefined>(undefined);
  const snappedStartPoint = useRef<Position>([]);
  const offset = useRef([0, 0]);
  const timer = useRef<NodeJS.Timeout | undefined>(undefined);
  const longPressTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const longPressStartPosition = useRef<Position | null>(null);
  const longPressMoveThreshold = 20;

  const { generateRecord } = useRecord();

  // Derived state
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
    switch (currentPenWidth) {
      case 'PEN_THIN':
        return 2;
      case 'PEN_MEDIUM':
        return 5;
      case 'PEN_THICK':
        return 10;
      default:
        return 1;
    }
  }, [currentPenWidth]);

  const isUndoable = useMemo(() => history.length > 0, [history]);
  const isRedoable = useMemo(() => future.length > 0, [future]);

  /**
   * Sets the visibility of the map memo tool modal
   */
  const setIsModalMapMemoToolHidden = useCallback(
    (value: boolean) => {
      dispatch(editSettingsAction({ isModalMapMemoToolHidden: value }));
    },
    [dispatch]
  );

  /**
   * Clears the editing line
   */
  const clearMapMemoEditingLine = useCallback(() => {
    mapMemoEditingLine.current = [];
    snappedLine.current = undefined;
    if (isEditingLine) {
      setIsEditingLine(false);
      setEditingLineId(undefined);
      setEditingLineIndex(undefined);
      setEditingPointIndex(undefined);
    }
  }, [isEditingLine]);

  /**
   * Finds a line that the given point is near to
   */
  const findSnappedLine = useCallback(
    (pXY: Position) => {
      for (const line of memoLines) {
        if (
          line.visible === false ||
          line.coords === undefined ||
          line.field._stamp !== '' ||
          isBrushTool(line.field._strokeStyle as string)
        ) {
          continue;
        }

        const lineXY = latLonObjectsToXYArray(line.coords, mapRegion, mapSize, mapViewRef);
        if (checkDistanceFromLine(pXY, lineXY).isNear) {
          return { coordsXY: lineXY, id: line.id };
        }
      }
      return undefined;
    },
    [mapRegion, mapSize, mapViewRef, memoLines]
  );

  /**
   * Finds closest point on a line and returns information about it
   */
  const findClosestPointOnLine = useCallback((pXY: Position, lineXY: Position[]) => {
    let minDistance = Infinity;
    let minIndex = -1;

    for (let i = 0; i < lineXY.length; i++) {
      const pointXY = lineXY[i];
      const dx = pXY[0] - pointXY[0];
      const dy = pXY[1] - pointXY[1];
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        minIndex = i;
      }
    }

    return { index: minIndex, distance: minDistance };
  }, []);

  /**
   * Saves the memo lines to the database
   */
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

      // Update history and reset future
      setHistory((prev) => [...(prev.length === MAX_HISTORY ? prev.slice(1) : prev), ...newHistoryItems]);
      setFuture([]);
      setMapMemoLines([]);
    },
    [activeMemoLayer, activeMemoRecordSet, dispatch, generateRecord, memoLines, user.uid]
  );

  /**
   * Handles stamp tool grant event
   */
  const handleStampToolGrant = useCallback(
    (pXY: Position) => {
      const result = findSnappedLine(pXY);
      if (result && snapWithLine) {
        const snappedPoint = getSnappedPositionWithLine(pXY, result.coordsXY, { isXY: true }).position;
        snappedLine.current = { coordsXY: result.coordsXY, id: result.id };
        mapMemoEditingLine.current = [snappedPoint];
      } else {
        mapMemoEditingLine.current = [pXY];
      }
    },
    [findSnappedLine, snapWithLine]
  );

  /**
   * Handles brush tool grant event
   */
  const handleBrushToolGrant = useCallback(
    (pXY: Position) => {
      const result = findSnappedLine(pXY);
      if (result) {
        snappedStartPoint.current = getSnappedPositionWithLine(pXY, result.coordsXY, { isXY: true }).position;
        snappedLine.current = { coordsXY: result.coordsXY, id: result.id };
      }
    },
    [findSnappedLine]
  );

  /**
   * Handles stamp tool move event
   */
  const handleStampToolMove = useCallback(
    (pXY: Position, isSnappedWithLine: boolean) => {
      if (isSnappedWithLine && snapWithLine) {
        mapMemoEditingLine.current = [
          getSnappedPositionWithLine(pXY, snappedLine.current!.coordsXY, { isXY: true }).position,
        ];
      } else {
        mapMemoEditingLine.current = [pXY];
      }
    },
    [snapWithLine]
  );

  /**
   * Handles brush tool move event
   */
  const handleBrushToolMove = useCallback((pXY: Position, isSnappedWithLine: boolean) => {
    if (!isSnappedWithLine) return;

    const snappedEndPoint = getSnappedPositionWithLine(pXY, snappedLine.current!.coordsXY, { isXY: true }).position;
    const brushLine = getSnappedLine(snappedStartPoint.current, snappedEndPoint, snappedLine.current!.coordsXY);
    mapMemoEditingLine.current = brushLine;
  }, []);

  /**
   * Handles drawing tool move event
   */
  const handleDrawingToolMove = useCallback(
    (pXY: Position) => {
      if (isStraightStyle && isPenTool(currentMapMemoTool)) {
        mapMemoEditingLine.current = [mapMemoEditingLine.current[0], pXY];
      } else {
        mapMemoEditingLine.current = [...mapMemoEditingLine.current, pXY];
      }
    },
    [currentMapMemoTool, isStraightStyle]
  );

  /**
   * Handle long press to start line editing
   */
  const handleLongPressMapMemo = useCallback(
    (event: GestureResponderEvent) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = undefined;
      }

      if (isEditingLine || !isPenTool(currentMapMemoTool)) {
        return;
      }

      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];
      const result = findSnappedLine(pXY);

      if (result) {
        // Find the line in memoLines
        const lineIndex = memoLines.findIndex((line) => line.id === result.id);
        if (lineIndex < 0) return;
        // Find closest point on line to determine where to start editing
        const closestInfo = findClosestPointOnLine(pXY, result.coordsXY);
        // Only allow editing if we're close to a point and it's not at the beginning
        if (closestInfo.distance < 30 && closestInfo.index > 0) {
          // We found a line to edit
          setIsEditingLine(true);
          setEditingLineId(result.id);
          setEditingLineIndex(lineIndex);
          setEditingPointIndex(closestInfo.index);

          // Store original line information
          const lineRecord = memoLines[lineIndex];
          if (lineRecord) {
            // Start editing from the found point
            mapMemoEditingLine.current = result.coordsXY.slice(0, closestInfo.index + 1);

            // We set our tool to PEN for editing
            if (!isPenTool(currentMapMemoTool)) {
              setMapMemoTool('PEN');
            }
          }
        }
      }

      setRedraw(ulid());
    },
    [currentMapMemoTool, findClosestPointOnLine, findSnappedLine, isEditingLine, memoLines, setMapMemoTool]
  );

  /**
   * Handles the start of a touch gesture
   */
  const handleGrantMapMemo = useCallback(
    (event: GestureResponderEvent) => {
      if (timer.current) {
        clearTimeout(timer.current);
      }

      // Calculate touch offset
      offset.current = [
        event.nativeEvent.locationX - event.nativeEvent.pageX,
        event.nativeEvent.locationY - event.nativeEvent.pageY,
      ];

      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      // Save long press start position
      longPressStartPosition.current = pXY;

      // Set up long press detection if using PEN tool
      if (isPenTool(currentMapMemoTool) && !isEditingLine) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
        }
        event.persist();
        longPressTimer.current = setTimeout(() => {
          handleLongPressMapMemo(event);
        }, 800); // 800ms for long press
      }

      if (isStampTool(currentMapMemoTool)) {
        handleStampToolGrant(pXY);
      } else if (isBrushTool(currentMapMemoTool)) {
        handleBrushToolGrant(pXY);
      } else if (isPenTool(currentMapMemoTool) || isEraserTool(currentMapMemoTool)) {
        // If not already editing, start a new line
        if (!isEditingLine) {
          mapMemoEditingLine.current = [pXY];
        }
      }

      setRedraw(ulid());
    },
    [currentMapMemoTool, handleBrushToolGrant, handleLongPressMapMemo, handleStampToolGrant, isEditingLine]
  );

  /**
   * Handles movement during a touch gesture
   */
  const handleMoveMapMemo = useCallback(
    (event: GestureResponderEvent) => {
      if (!event.nativeEvent.touches.length) return;

      const pXY: Position = [event.nativeEvent.pageX + offset.current[0], event.nativeEvent.pageY + offset.current[1]];

      // Improve long press detection: cancel timer if movement exceeds threshold
      if (longPressTimer.current && longPressStartPosition.current) {
        const dx = pXY[0] - longPressStartPosition.current[0];
        const dy = pXY[1] - longPressStartPosition.current[1];
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > longPressMoveThreshold) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = undefined;
          longPressStartPosition.current = null;
        }
      }

      const isSnappedWithLine = snappedLine.current !== undefined && snappedLine.current.coordsXY.length > 1;

      if (isStampTool(currentMapMemoTool)) {
        handleStampToolMove(pXY, isSnappedWithLine);
      } else if (isBrushTool(currentMapMemoTool)) {
        handleBrushToolMove(pXY, isSnappedWithLine);
      } else {
        // Normal drawing
        handleDrawingToolMove(pXY);
      }

      setRedraw(ulid());
    },
    [currentMapMemoTool, handleBrushToolMove, handleDrawingToolMove, handleStampToolMove]
  );

  /**
   * Handles pen tool release
   */
  const handlePenToolRelease = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }

    let drawingLine = [...mapMemoEditingLine.current];

    // Handle edge cases with line points
    if (drawingLine.length === 0) {
      clearMapMemoEditingLine();
      setFuture([]);
      return;
    } else if (drawingLine.length === 1) {
      // Convert a single point to a very small line
      drawingLine.push([drawingLine[0][0] + 0.0000001, drawingLine[0][1] + 0.0000001]);
    }
    // Handle editing an existing line
    if (isEditingLine && editingLineId && editingPointIndex !== undefined) {
      let newLineCoords = drawingLine;
      if (isMapMemoLineSmoothed && !isStraightStyle && newLineCoords.length > 8) {
        const newPortion = newLineCoords.slice(editingPointIndex);
        if (newPortion.length > 8) {
          const smoothedPortion = smoothingByBezier(newPortion.slice(2, -2));
          newLineCoords = [...newLineCoords.slice(0, editingPointIndex), ...smoothedPortion];
        }
      }
      const latlonCoords = xyArrayToLatLonArray(newLineCoords, mapRegion, mapSize, mapViewRef);

      const lineIndex = memoLines.findIndex((line) => line.id === editingLineId);
      if (lineIndex >= 0) {
        const originalRecord = memoLines[lineIndex];
        if (originalRecord) {
          const updatedRecord = {
            ...originalRecord,
            coords: latlonArrayToLatLonObjects(latlonCoords),
          };

          dispatch(
            updateRecordsAction({
              layerId: activeMemoLayer!.id,
              userId: user.uid,
              data: [updatedRecord],
            })
          );

          setHistory((prev) => [
            ...(prev.length === MAX_HISTORY ? prev.slice(1) : prev),
            {
              operation: 'update',
              data: [
                {
                  idx: lineIndex,
                  line: originalRecord,
                  updatedLine: updatedRecord,
                },
              ],
            },
          ]);

          setFuture([]);
        }
      }
      clearMapMemoEditingLine();
      return;
    }

    // Normal new line drawing
    if (isMapMemoLineSmoothed && !isStraightStyle) {
      if (drawingLine.length > 8) {
        drawingLine = drawingLine.slice(2, -2);
      }
      drawingLine = smoothingByBezier(drawingLine);
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
  }, [
    arrowStyle,
    clearMapMemoEditingLine,
    isMapMemoLineSmoothed,
    isStraightStyle,
    mapMemoLines,
    mapRegion,
    mapSize,
    mapViewRef,
    penColor,
    penWidth,
    saveMapMemo,
    isEditingLine,
    editingLineId,
    editingPointIndex,
    memoLines,
    activeMemoLayer,
    user.uid,
    dispatch,
  ]);

  /**
   * Handles stamp tool release
   */
  const handleStampToolRelease = useCallback(() => {
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
  }, [clearMapMemoEditingLine, currentMapMemoTool, mapRegion, mapSize, mapViewRef, penColor, penWidth, saveMapMemo]);

  /**
   * Handles brush tool release
   */
  const handleBrushToolRelease = useCallback(
    (isSnappedWithLine: boolean) => {
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
    },
    [
      clearMapMemoEditingLine,
      currentMapMemoTool,
      mapMemoLines,
      mapRegion,
      mapSize,
      mapViewRef,
      penColor,
      penWidth,
      saveMapMemo,
    ]
  );

  /**
   * Helper function to update history and delete records
   */
  const updateHistoryAndDeleteRecords = useCallback(
    (deletedLines: { idx: number; line: LineRecordType }[]) => {
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
    },
    [activeMemoLayer, dispatch, user.uid]
  );

  /**
   * Handles pen eraser release
   */
  const handlePenEraserRelease = useCallback(() => {
    const eraserLineLatLonArray = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);

    if (eraserLineLatLonArray.length === 1) {
      eraserLineLatLonArray.push([eraserLineLatLonArray[0][0] + 0.0000001, eraserLineLatLonArray[0][1] + 0.0000001]);
    }

    const deletedLines: { idx: number; line: LineRecordType }[] = [];
    const otherLines: { idx: number; line: LineRecordType }[] = [];

    memoLines.forEach((line, idx) => {
      if (line.coords === undefined) return;

      const lineArray = latLonObjectsToLatLonArray(line.coords);
      if (lineArray.length === 1) {
        lineArray.push([lineArray[0][0] + 0.0000001, lineArray[0][1] + 0.0000001]);
      }

      const lineGeometry = turf.lineString(lineArray);
      if (booleanIntersects(turf.lineString(eraserLineLatLonArray), lineGeometry)) {
        deletedLines.push({ idx, line });
      } else {
        otherLines.push({ idx, line });
      }
    });

    if (deletedLines.length > 0) {
      const updatedDeletedLines = [...deletedLines];

      otherLines.forEach(({ idx, line }) => {
        const sameGroup = deletedLines.find((dline) => dline.line.id === line.field._group);
        if (sameGroup) updatedDeletedLines.push({ idx, line });
      });

      updatedDeletedLines.sort((a, b) => a.idx - b.idx);
      updateHistoryAndDeleteRecords(updatedDeletedLines);
    }

    setFuture([]);
    clearMapMemoEditingLine();
  }, [clearMapMemoEditingLine, mapRegion, mapSize, mapViewRef, memoLines, updateHistoryAndDeleteRecords]);

  /**
   * Handles brush eraser release
   */
  const handleBrushEraserRelease = useCallback(() => {
    const eraserLineLatLonArray = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);
    const deletedLines: { idx: number; line: LineRecordType }[] = [];

    memoLines.forEach((line, idx) => {
      if (line.coords === undefined || !isBrushTool(line.field._strokeStyle as string)) return;

      const lineArray = latLonObjectsToLatLonArray(line.coords);
      const brushLineGeometry = turf.lineString(lineArray);
      const lineGeometry = turf.lineString(eraserLineLatLonArray);

      if (booleanIntersects(brushLineGeometry, lineGeometry)) {
        deletedLines.push({ idx, line });
      }
    });

    if (deletedLines.length > 0) {
      updateHistoryAndDeleteRecords(deletedLines);
    }

    setFuture([]);
    clearMapMemoEditingLine();
  }, [clearMapMemoEditingLine, mapRegion, mapSize, mapViewRef, memoLines, updateHistoryAndDeleteRecords]);

  /**
   * Handles stamp eraser release
   */
  const handleStampEraserRelease = useCallback(() => {
    const eraserLineLatLonArray = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);
    const deletedLines: { idx: number; line: LineRecordType }[] = [];

    memoLines.forEach((line, idx) => {
      if (line.coords === undefined || !Object.keys(STAMP).includes(line.field._stamp as string)) return;

      const stampLatLon = latLonObjectsToLatLonArray(line.coords)[0];
      const stampGeometry = buffer(turf.point(stampLatLon), mapRegion.latitudeDelta);
      if (stampGeometry === undefined) return;

      let polygonGeometry;
      if (eraserLineLatLonArray.length < 4) {
        eraserLineLatLonArray.push([eraserLineLatLonArray[0][0] + 0.0000001, eraserLineLatLonArray[0][1] + 0.0000001]);
        polygonGeometry = buffer(turf.lineString(eraserLineLatLonArray), mapRegion.latitudeDelta);
      } else {
        eraserLineLatLonArray.push(eraserLineLatLonArray[0]);
        polygonGeometry = turf.polygon([eraserLineLatLonArray]);
      }

      if (polygonGeometry === undefined) return;

      if (booleanContains(polygonGeometry, stampGeometry) || booleanIntersects(polygonGeometry, stampGeometry)) {
        deletedLines.push({ idx, line });
      }
    });

    if (deletedLines.length > 0) {
      updateHistoryAndDeleteRecords(deletedLines);
    }

    setFuture([]);
    clearMapMemoEditingLine();
  }, [clearMapMemoEditingLine, mapRegion, mapSize, mapViewRef, memoLines, updateHistoryAndDeleteRecords]);

  /**
   * Handles the end of a touch gesture
   */
  const handleReleaseMapMemo = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
      longPressStartPosition.current = null;
    }

    const isSnappedWithLine = snappedLine.current !== undefined && snappedLine.current.coordsXY.length > 1;

    if (isPenTool(currentMapMemoTool)) {
      handlePenToolRelease();
    } else if (isStampTool(currentMapMemoTool)) {
      handleStampToolRelease();
    } else if (isBrushTool(currentMapMemoTool)) {
      handleBrushToolRelease(isSnappedWithLine);
    } else if (currentMapMemoTool === 'BRUSH_ERASER') {
      handleBrushEraserRelease();
    } else if (currentMapMemoTool === 'STAMP_ERASER') {
      handleStampEraserRelease();
    } else if (currentMapMemoTool === 'PEN_ERASER') {
      handlePenEraserRelease();
    }
  }, [
    currentMapMemoTool,
    handleBrushEraserRelease,
    handleBrushToolRelease,
    handlePenEraserRelease,
    handlePenToolRelease,
    handleStampEraserRelease,
    handleStampToolRelease,
  ]);

  /**
   * Sets pen color based on HSV values
   */
  const selectPenColor = useCallback((hue: number, sat: number, val: number, alpha: number) => {
    setVisibleMapMemoColor(false);
    const rgbaString = hsv2rgbaString(hue, sat, val, alpha);
    setPenColor(rgbaString);
  }, []);

  /**
   * Clears the undo/redo history
   */
  const clearMapMemoHistory = useCallback(() => {
    setHistory([]);
    setFuture([]);
  }, []);

  /**
   * Undoes the last map memo operation
   */
  const pressUndoMapMemo = useCallback(() => {
    if (history.length === 0 || !activeMemoRecordSet) return;

    const lastOperation = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setFuture([...future, lastOperation]);

    // 現在のラインは activeMemoRecordSet.data から再構築する
    let newDrawLine = [...(activeMemoRecordSet.data as LineRecordType[])];

    if (lastOperation.operation === 'add') {
      newDrawLine = newDrawLine.filter((line) => !lastOperation.data.some((item) => item.line.id === line.id));
    } else if (lastOperation.operation === 'remove') {
      lastOperation.data.forEach(({ idx, line }) => {
        newDrawLine.splice(idx, 0, line);
      });
    } else if (lastOperation.operation === 'update') {
      newDrawLine[lastOperation.data[0].idx] = lastOperation.data[0].line;
    }

    dispatch(
      setRecordSetAction({
        ...activeMemoRecordSet,
        data: newDrawLine,
      })
    );
  }, [history, activeMemoRecordSet, future, dispatch]);

  /**
   * Redoes the last undone map memo operation
   */
  const pressRedoMapMemo = useCallback(() => {
    if (future.length === 0 || !activeMemoRecordSet) return;

    const nextOperation = future[future.length - 1];
    setFuture(future.slice(0, -1));
    setHistory([...history, nextOperation]);

    let newDrawLine = [...memoLines];

    if (nextOperation.operation === 'add') {
      newDrawLine = [...newDrawLine, ...nextOperation.data.map(({ line }) => line)];
    } else if (nextOperation.operation === 'remove') {
      newDrawLine = newDrawLine.filter((line) => !nextOperation.data.some((item) => item.line.id === line.id));
    } else if (nextOperation.operation === 'update') {
      nextOperation.data.forEach(({ updatedLine }) => {
        if (updatedLine) {
          const index = newDrawLine.findIndex((l) => l.id === updatedLine.id);
          if (index !== -1) {
            newDrawLine[index] = {
              ...newDrawLine[index],
              coords: updatedLine.coords,
              field: { ...updatedLine.field },
            };
          }
        }
      });
    }

    dispatch(
      setRecordSetAction({
        ...activeMemoRecordSet,
        data: newDrawLine,
      })
    );
  }, [future, activeMemoRecordSet, history, memoLines, dispatch]);

  /**
   * Changes the active layer's color type to individual
   */
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

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
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
    currentPenWidth,
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
    isModalMapMemoToolHidden,
    isEditingLine,
    editingLineId,
    setMapMemoTool,
    setPenWidth,
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
    handleLongPressMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    clearMapMemoHistory,
    changeColorTypeToIndividual,
    clearMapMemoEditingLine,
    setPencilModeActive,
    setSnapWithLine,
    setIsStraightStyle,
    setMapMemoLineSmoothed,
    setIsModalMapMemoToolHidden,
  } as const;
};
