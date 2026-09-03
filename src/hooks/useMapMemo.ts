import { Dispatch, RefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowStyleType, LineRecordType, MapMemoToolType, PenWidthType } from '../types';
import { useWindow } from './useWindow';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { ulid } from 'ulid';
import {
  booleanIntersects,
  calcDegreeRadius,
  calcLineMidPoint,
  checkDistanceFromLine,
  erasePartialLine,
  getSnappedLine,
  getSnappedPositionWithLine,
  latLonArrayToXYArray,
  latLonObjectsToLatLonArray,
  latLonObjectsToXYArray,
  latLonToXY,
  latlonArrayToLatLonObjects,
  simplifyWithTolerance,
  smoothingByBezier,
  trimHane,
  xyArrayToLatLonArray,
  xyToLatLon,
} from '../utils/Coords';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl/maplibre';
import { GestureResponderEvent, Platform } from 'react-native';
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
import { PositionFilter } from '../utils/OneEuroFilter';
import { Position } from 'geojson';
import { editSettingsAction } from '../modules/settings';
import { selectNonDeletedDataSet } from '../modules/selectors';

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
  mapMemoEditingLine: RefObject<Position[]>;
  mapMemoEditingLineLatLon: RefObject<Position[]>;
  editableMapMemo: boolean;
  isIndividualColorRequired: boolean;
  isPencilModeActive: boolean;
  isUndoable: boolean;
  isRedoable: boolean;
  mapMemoLines: MapMemoStateType[];
  snapWithLine: boolean;
  arrowStyle: ArrowStyleType;
  isStraightStyle: boolean;
  isModalMapMemoToolHidden: boolean;
  isMapMemoWidthZoomLinked: boolean;
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
  pauseMapMemoDrawing: () => void;
  setPencilModeActive: Dispatch<SetStateAction<boolean>>;
  setSnapWithLine: Dispatch<SetStateAction<boolean>>;
  setIsStraightStyle: Dispatch<SetStateAction<boolean>>;
  setIsModalMapMemoToolHidden: (value: boolean) => void;
  setIsMapMemoWidthZoomLinked: (value: boolean) => void;
};

export type HistoryType =
  | {
      operation: 'add' | 'remove' | 'update';
      data: { idx: number; line: LineRecordType; updatedLine?: LineRecordType }[];
    }
  | {
      //部分消去。1回のUndo/Redoで削除・更新・追加をまとめて往復させる
      operation: 'erase';
      data: {
        removed: { idx: number; line: LineRecordType }[];
        updated: { idx: number; line: LineRecordType; updatedLine: LineRecordType }[];
        added: LineRecordType[];
      };
    };

export type MapMemoStateType = {
  id?: string;
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
//画面端自動パン: 端からのしきい値(px)・1tickの移動量(px)・tick間隔(ms)
const EDGE_PAN_THRESHOLD = 40;
const EDGE_PAN_STEP = 12;
const EDGE_PAN_INTERVAL_MS = 80;
//ピンチ中断後に同じ線の続きとみなすタッチ距離(px)
const RESUME_DISTANCE_PX = 50;
//矢印スタイルの整形時の間引き許容誤差(px)
const PEN_SIMPLIFY_TOLERANCE_PX = 1.0;
//これ未満の点数のストロークは整形せず生のまま保存する（矢印スタイル用）
const MIN_POINTS_FOR_REFINE = 5;

//1€フィルタ用のタイムスタンプ(ms)。native=タッチイベントのtimestamp、web=performance.now()
const getEventTimestamp = (event: GestureResponderEvent): number => {
  //@ts-ignore react-native-webのイベントにはtimestampが無い場合がある
  const t = event.nativeEvent?.timestamp;
  if (typeof t === 'number') return t;
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
};

/**
 * Custom hook to manage map memo functionality
 */
export const useMapMemo = (mapViewRef: MapView | MapRef | null): UseMapMemoReturnType => {
  const dispatch = useDispatch();
  const { mapSize, mapRegion } = useWindow();
  const user = useSelector((state: RootState) => state.user);
  const projectId = useSelector((state: RootState) => state.settings.projectId, shallowEqual);
  const dataUser = useMemo(
    () => (projectId === undefined ? { ...user, uid: undefined, displayName: null } : user),
    [projectId, user]
  );

  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector(selectNonDeletedDataSet);
  const isModalMapMemoToolHidden = useSelector((state: RootState) => state.settings.isModalMapMemoToolHidden);
  const isMapMemoWidthZoomLinked = useSelector((state: RootState) => state.settings.isMapMemoWidthZoomLinked ?? false);

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

  // Force redraw mechanism
  const [, setRedraw] = useState('');

  // Refs
  //スタンプ・ブラシ用（スクリーン座標）。スナップ計算がXY空間実装のため従来のまま
  const mapMemoEditingLine = useRef<Position[]>([]);
  //ペン・消しゴム用（緯度経度）。描画中の地図操作（ピンチ・自動パン）に追従できるよう地理座標で保持する
  const mapMemoEditingLineLatLon = useRef<Position[]>([]);
  //ピンチによる描画中断フラグ。中断中はストロークを保持し、次のタッチで継続/確定を判定する
  const isDrawingPaused = useRef(false);
  //ペンの手ぶれ補正（1€フィルタ）。スクリーン座標に適用してから緯度経度化する
  const strokeFilter = useRef(new PositionFilter());
  //画面端自動パン
  const edgePanTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastTouchXY = useRef<Position | null>(null);
  //自動パン中の楽観更新を含む最新のmapRegion（useCallbackの古いclosure対策）
  const mapRegionRef = useRef(mapRegion);
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
    () => dataSet.find(({ layerId, userId }) => layerId === activeMemoLayer?.id && userId === dataUser.uid),
    [dataSet, activeMemoLayer?.id, dataUser.uid]
  );

  const memoLines = useMemo(
    () => (activeMemoRecordSet ? (activeMemoRecordSet.data as LineRecordType[]) : ([] as LineRecordType[])),
    [activeMemoRecordSet]
  );

  const editableMapMemo = useMemo(() => activeMemoLayer !== undefined, [activeMemoLayer]);

  //ペンで描くにはレコードごとの色・太さ（INDIVIDUAL）が必要。切り替えが要るかどうか
  const isIndividualColorRequired = useMemo(
    () => activeMemoLayer !== undefined && activeMemoLayer.colorStyle.colorType !== 'INDIVIDUAL',
    [activeMemoLayer]
  );

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
   * Sets whether the map memo stroke width scales with zoom
   */
  const setIsMapMemoWidthZoomLinked = useCallback(
    (value: boolean) => {
      dispatch(editSettingsAction({ isMapMemoWidthZoomLinked: value }));
    },
    [dispatch]
  );

  useEffect(() => {
    mapRegionRef.current = mapRegion;
  }, [mapRegion]);

  /**
   * Stops the edge auto-pan timer
   */
  const stopEdgePan = useCallback(() => {
    if (edgePanTimer.current !== undefined) {
      clearInterval(edgePanTimer.current);
      edgePanTimer.current = undefined;
    }
    lastTouchXY.current = null;
  }, []);

  /**
   * タッチ位置が画面端に近い場合のパン移動量(px)を返す
   */
  const calcEdgePanDelta = useCallback(
    (pXY: Position): Position => {
      let dx = 0;
      let dy = 0;
      if (pXY[0] < EDGE_PAN_THRESHOLD) dx = -EDGE_PAN_STEP;
      else if (pXY[0] > mapSize.width - EDGE_PAN_THRESHOLD) dx = EDGE_PAN_STEP;
      if (pXY[1] < EDGE_PAN_THRESHOLD) dy = -EDGE_PAN_STEP;
      else if (pXY[1] > mapSize.height - EDGE_PAN_THRESHOLD) dy = EDGE_PAN_STEP;
      return [dx, dy];
    },
    [mapSize.height, mapSize.width]
  );

  /**
   * Clears the editing line
   */
  const clearMapMemoEditingLine = useCallback(() => {
    stopEdgePan();
    isDrawingPaused.current = false;
    mapMemoEditingLine.current = [];
    mapMemoEditingLineLatLon.current = [];
    snappedLine.current = undefined;
    if (isEditingLine) {
      setIsEditingLine(false);
      setEditingLineId(undefined);
      setEditingLineIndex(undefined);
      setEditingPointIndex(undefined);
    }
  }, [isEditingLine, stopEdgePan]);

  /**
   * ピンチ操作の開始時に呼ばれる。ペンで描画中ならストロークを破棄せず中断し、
   * ピンチ後のタッチで継続できるようにする。それ以外は従来通り破棄する。
   */
  const pauseMapMemoDrawing = useCallback(() => {
    stopEdgePan();
    if (isPenTool(currentMapMemoTool) && !isEditingLine && mapMemoEditingLineLatLon.current.length > 0) {
      isDrawingPaused.current = true;
    } else {
      clearMapMemoEditingLine();
    }
  }, [clearMapMemoEditingLine, currentMapMemoTool, isEditingLine, stopEdgePan]);

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
        dispatch(addDataAction([{ layerId: activeMemoLayer!.id, userId: dataUser.uid, data: newRecords }]));
      } else {
        dispatch(addRecordsAction({ ...activeMemoRecordSet, data: newRecords }));
      }

      // Update history and reset future
      setHistory((prev) => [...(prev.length === MAX_HISTORY ? prev.slice(1) : prev), ...newHistoryItems]);
      setFuture([]);
      setMapMemoLines([]);
    },
    [activeMemoLayer, activeMemoRecordSet, dataUser.uid, dispatch, generateRecord, memoLines]
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
   * ペン・消しゴムのストロークに緯度経度の1点を追加する（直線スタイルは終点を置き換え）
   */
  const appendPenPointLatLon = useCallback(
    (latlon: Position) => {
      if (isStraightStyle && isPenTool(currentMapMemoTool)) {
        mapMemoEditingLineLatLon.current = [mapMemoEditingLineLatLon.current[0] ?? latlon, latlon];
      } else {
        mapMemoEditingLineLatLon.current = [...mapMemoEditingLineLatLon.current, latlon];
      }
    },
    [currentMapMemoTool, isStraightStyle]
  );

  /**
   * 画面端自動パンの1tick。地図を少しずらし、止まっている指の位置を
   * 新しい地図位置で緯度経度に変換して線を伸ばす。
   */
  const edgePanTick = useCallback(() => {
    const pXY = lastTouchXY.current;
    if (pXY === null) return;
    const [dx, dy] = calcEdgePanDelta(pXY);
    if (dx === 0 && dy === 0) {
      stopEdgePan();
      return;
    }
    if (Platform.OS === 'web') {
      //onMoveが同期的にmapRegionを更新し、座標変換はproject/unproject直参照のため常に整合する
      const map = mapViewRef ? (mapViewRef as MapRef).getMap() : undefined;
      if (map === undefined) return;
      map.panBy([dx, dy], { duration: 0 });
    } else {
      //ネイティブはアニメーション中にmapRegionが更新されず座標変換が破綻するため、
      //新しいregionを自前で計算して楽観的に反映し、地図はアニメーションなしで追従させる
      const region = mapRegionRef.current;
      const [lon, lat] = xyToLatLon([mapSize.width / 2 + dx, mapSize.height / 2 + dy], region, mapSize, mapViewRef);
      const newRegion = { ...region, longitude: lon, latitude: lat };
      mapRegionRef.current = newRegion;
      dispatch(editSettingsAction({ mapRegion: newRegion }));
      (mapViewRef as MapView | null)?.animateToRegion?.(
        {
          latitude: lat,
          longitude: lon,
          latitudeDelta: region.latitudeDelta,
          longitudeDelta: region.longitudeDelta,
        },
        0
      );
    }
    //パン中はスクリーン上の指は静止しているため、フィルタは通さずリセットして次のMoveで再初期化する
    strokeFilter.current.reset();
    appendPenPointLatLon(xyToLatLon(pXY, mapRegionRef.current, mapSize, mapViewRef));
    setRedraw(ulid());
  }, [appendPenPointLatLon, calcEdgePanDelta, dispatch, mapSize, mapViewRef, stopEdgePan]);

  /**
   * Handles drawing tool move event
   */
  const handleDrawingToolMove = useCallback(
    (pXY: Position, timestampMs: number) => {
      //ペン（曲線）は1€フィルタで手ぶれを補正してから緯度経度化する
      const filteredXY =
        isPenTool(currentMapMemoTool) && !isStraightStyle ? strokeFilter.current.filter(pXY, timestampMs) : pXY;
      appendPenPointLatLon(xyToLatLon(filteredXY, mapRegionRef.current, mapSize, mapViewRef));

      //ペンのみ画面端に近づいたら自動パンして一筆で描き続けられるようにする
      if (isPenTool(currentMapMemoTool)) {
        lastTouchXY.current = pXY;
        const [dx, dy] = calcEdgePanDelta(pXY);
        if (dx !== 0 || dy !== 0) {
          if (edgePanTimer.current === undefined) {
            edgePanTimer.current = setInterval(edgePanTick, EDGE_PAN_INTERVAL_MS);
          }
        } else {
          stopEdgePan();
        }
      }
    },
    [
      appendPenPointLatLon,
      calcEdgePanDelta,
      currentMapMemoTool,
      edgePanTick,
      isStraightStyle,
      mapSize,
      mapViewRef,
      stopEdgePan,
    ]
  );

  /**
   * 現在のペンストローク（緯度経度）を整形して保存キューに積む
   */
  const finishPenStroke = useCallback(() => {
    let latlonLine = [...mapMemoEditingLineLatLon.current];
    mapMemoEditingLineLatLon.current = [];
    if (latlonLine.length === 0) return;
    if (latlonLine.length === 1) {
      //1点だけの場合は極小の線に変換する
      latlonLine.push([latlonLine[0][0] + 0.0000001, latlonLine[0][1] + 0.0000001]);
    }

    //通常ペンは「離した瞬間に何も変わらない」を仕様とし、描いた点列を一切整形せずそのまま保存する
    //（手ぶれ除去は描画中の1€フィルタが担う）。
    //整形（ハネ切り・ベジエ平滑化・間引き）は向きの綺麗さが必要な矢印スタイルのみ（従来どおり）。
    //ピクセル単位のパラメータのため現在ビューのスクリーン座標へ再投影して行い、緯度経度へ戻す
    if (arrowStyle !== 'NONE' && !isStraightStyle && latlonLine.length >= MIN_POINTS_FOR_REFINE) {
      try {
        let lineXY = latLonArrayToXYArray(latlonLine, mapRegionRef.current, mapSize, mapViewRef);
        if (lineXY.length > 8) {
          //ハネ切りは矢印の向きを守るための処理
          lineXY = lineXY.slice(2, -2);
          lineXY = trimHane(lineXY, 50); // 角度閾値は50°くらいから調整
        }
        lineXY = smoothingByBezier(lineXY);
        lineXY = simplifyWithTolerance(lineXY, PEN_SIMPLIFY_TOLERANCE_PX);
        latlonLine = xyArrayToLatLonArray(lineXY, mapRegionRef.current, mapSize, mapViewRef);
      } catch (e) {
        //整形に失敗した場合は生のストロークをそのまま保存する
        console.log('refine pen stroke error', e);
      }
    }

    const newMapMemoLines = [
      ...mapMemoLines,
      {
        latlon: latlonLine,
        zoom: mapRegionRef.current.zoom,
        strokeColor: penColor,
        strokeWidth: penWidth,
        strokeStyle: arrowStyle,
        stamp: '',
      },
    ];

    setMapMemoLines(newMapMemoLines);

    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      saveMapMemo(newMapMemoLines);
    }, 1000);
  }, [arrowStyle, isStraightStyle, mapMemoLines, mapSize, mapViewRef, penColor, penWidth, saveMapMemo]);

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
          if (lineRecord && lineRecord.coords !== undefined) {
            // Start editing from the found point（緯度経度で保持する）
            mapMemoEditingLineLatLon.current = latLonObjectsToLatLonArray(lineRecord.coords).slice(
              0,
              closestInfo.index + 1
            );

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
        }, 500); // 800ms for long press
      }

      if (isStampTool(currentMapMemoTool)) {
        handleStampToolGrant(pXY);
      } else if (isBrushTool(currentMapMemoTool)) {
        handleBrushToolGrant(pXY);
      } else if (isPenTool(currentMapMemoTool) || isEraserTool(currentMapMemoTool)) {
        if (isPenTool(currentMapMemoTool)) {
          //手ぶれ補正フィルタを初期化し、開始点で初期値を与える（開始点自体は補正せずそのまま使う）
          strokeFilter.current.reset();
          strokeFilter.current.filter(pXY, getEventTimestamp(event));
        }
        if (isPenTool(currentMapMemoTool) && isDrawingPaused.current && mapMemoEditingLineLatLon.current.length > 0) {
          //ピンチ中断からの再開。終点の近くなら続きとして追記、離れていれば前の線を確定して新しい線を開始
          isDrawingPaused.current = false;
          const lastLatLon = mapMemoEditingLineLatLon.current[mapMemoEditingLineLatLon.current.length - 1];
          const lastXY = latLonToXY(lastLatLon, mapRegionRef.current, mapSize, mapViewRef);
          const distance = Math.hypot(pXY[0] - lastXY[0], pXY[1] - lastXY[1]);
          if (distance <= RESUME_DISTANCE_PX) {
            appendPenPointLatLon(xyToLatLon(pXY, mapRegionRef.current, mapSize, mapViewRef));
          } else {
            finishPenStroke();
            mapMemoEditingLineLatLon.current = [xyToLatLon(pXY, mapRegionRef.current, mapSize, mapViewRef)];
          }
        } else if (!isEditingLine) {
          // If not already editing, start a new line
          mapMemoEditingLineLatLon.current = [xyToLatLon(pXY, mapRegionRef.current, mapSize, mapViewRef)];
        }
      }

      setRedraw(ulid());
    },
    [
      appendPenPointLatLon,
      currentMapMemoTool,
      finishPenStroke,
      handleBrushToolGrant,
      handleLongPressMapMemo,
      handleStampToolGrant,
      isEditingLine,
      mapSize,
      mapViewRef,
    ]
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
        handleDrawingToolMove(pXY, getEventTimestamp(event));
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

    const drawingLine = [...mapMemoEditingLineLatLon.current];

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
      let latlonCoords = drawingLine;
      //通常ペンは編集時も無整形（離した瞬間に何も変わらない）。矢印スタイルのみ連結部を均す
      if (arrowStyle !== 'NONE' && !isStraightStyle && latlonCoords.length > 8) {
        //ピクセル単位のパラメータのため、現在ビューのスクリーン座標で行って緯度経度へ戻す
        try {
          const lineXY = latLonArrayToXYArray(latlonCoords, mapRegionRef.current, mapSize, mapViewRef);
          //連結部の前後2点を除いて滑らかに繋ぐ
          const line1 = lineXY.slice(0, editingPointIndex - 2);
          const line2 = lineXY.slice(editingPointIndex + 2);
          latlonCoords = xyArrayToLatLonArray(
            simplifyWithTolerance(smoothingByBezier([...line1, ...line2]), PEN_SIMPLIFY_TOLERANCE_PX),
            mapRegionRef.current,
            mapSize,
            mapViewRef
          );
        } catch (e) {
          console.log('refine pen stroke error', e);
        }
      }

      const lineIndex = memoLines.findIndex((line) => line.id === editingLineId);
      if (lineIndex >= 0) {
        const originalRecord = memoLines[lineIndex];
        if (originalRecord) {
          const updatedRecord = {
            ...originalRecord,
            coords: latlonArrayToLatLonObjects(latlonCoords),
            field: {
              ...originalRecord.field,
              _strokeColor: penColor,
              _strokeWidth: penWidth,
              _strokeStyle: arrowStyle || '',
            },
          };

          if (updatedRecord.userId !== dataUser.uid) {
            dispatch(
              deleteRecordsAction({
                layerId: activeMemoLayer!.id,
                userId: updatedRecord.userId,
                data: [updatedRecord],
              })
            );
          }
          updatedRecord.userId = dataUser.uid;
          updatedRecord.displayName = dataUser.displayName;
          dispatch(
            updateRecordsAction({
              layerId: activeMemoLayer!.id,
              userId: dataUser.uid,
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
    finishPenStroke();
    clearMapMemoEditingLine();
  }, [
    isEditingLine,
    editingLineId,
    editingPointIndex,
    isStraightStyle,
    mapSize,
    mapViewRef,
    penColor,
    penWidth,
    arrowStyle,
    clearMapMemoEditingLine,
    finishPenStroke,
    memoLines,
    dataUser.uid,
    dataUser.displayName,
    dispatch,
    activeMemoLayer,
  ]);

  /**
   * Handles stamp tool release
   */
  const handleStampToolRelease = useCallback(() => {
    const newMapMemoLines = [
      {
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
          userId: dataUser.uid,
          data: deletedLines.map((dline) => dline.line),
        })
      );
    },
    [activeMemoLayer, dataUser.uid, dispatch]
  );

  /**
   * Handles pen eraser release
   */
  const handlePenEraserRelease = useCallback(() => {
    const eraserLineLatLonArray = [...mapMemoEditingLineLatLon.current];

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
  }, [clearMapMemoEditingLine, memoLines, updateHistoryAndDeleteRecords]);

  /**
   * Handles pen eraser (partial) release.
   * 消しゴム軌跡と交差した区間だけを消し、残った区間は先頭を元レコードの更新、
   * 2本目以降を新規レコードとして保存する。元レコードidが残るため_groupで
   * ぶら下がるブラシ・スタンプは生存する（全消し時のみ巻き込み削除）。
   */
  const handlePenEraserPartialRelease = useCallback(() => {
    const eraserLineLatLonArray = [...mapMemoEditingLineLatLon.current];
    //消しゴムの表示幅(10px)相当を度に変換してバッファ半径にする
    const radiusDeg = calcDegreeRadius(10, mapRegion, mapSize);

    const removed: { idx: number; line: LineRecordType }[] = [];
    const updated: { idx: number; line: LineRecordType; updatedLine: LineRecordType }[] = [];
    const added: LineRecordType[] = [];

    memoLines.forEach((line, idx) => {
      if (line.coords === undefined) return;
      //対象はペンストロークのみ。スタンプ・ブラシは専用の消しゴムを使う
      if (line.field._stamp !== '' || isBrushTool(line.field._strokeStyle as string)) return;

      const lineArray = latLonObjectsToLatLonArray(line.coords);
      if (lineArray.length < 2) return;

      const { erased, remainingSegments } = erasePartialLine(lineArray, eraserLineLatLonArray, radiusDeg);
      if (!erased) return;

      if (remainingSegments.length === 0) {
        removed.push({ idx, line });
      } else {
        const [firstSegment, ...restSegments] = remainingSegments;
        const firstCoords = latlonArrayToLatLonObjects(firstSegment);
        updated.push({
          idx,
          line,
          updatedLine: { ...line, coords: firstCoords, centroid: calcLineMidPoint(firstCoords), updatedAt: Date.now() },
        });
        restSegments.forEach((segment) => {
          const coords = latlonArrayToLatLonObjects(segment);
          added.push({
            ...line,
            id: ulid(),
            coords,
            centroid: calcLineMidPoint(coords),
            field: { ...line.field },
            updatedAt: Date.now(),
          });
        });
      }
    });

    if (activeMemoRecordSet !== undefined && (removed.length > 0 || updated.length > 0)) {
      //全消しになった線に_groupでぶら下がるブラシ・スタンプは巻き込み削除（既存の丸ごと消しゴムと同じ挙動）
      const removedIds = new Set(removed.map((item) => item.line.id));
      memoLines.forEach((line, idx) => {
        if (removedIds.has(line.id)) return;
        const group = line.field._group;
        if (typeof group === 'string' && group !== '' && removedIds.has(group)) removed.push({ idx, line });
      });
      removed.sort((a, b) => a.idx - b.idx);

      if (removed.length > 0) {
        dispatch(
          deleteRecordsAction({
            layerId: activeMemoLayer!.id,
            userId: dataUser.uid,
            data: removed.map((item) => item.line),
          })
        );
      }
      if (updated.length > 0) {
        dispatch(
          updateRecordsAction({
            layerId: activeMemoLayer!.id,
            userId: dataUser.uid,
            data: updated.map((item) => item.updatedLine),
          })
        );
      }
      if (added.length > 0) {
        dispatch(addRecordsAction({ ...activeMemoRecordSet, data: added }));
      }

      setHistory((prev) => [
        ...(prev.length === MAX_HISTORY ? prev.slice(1) : prev),
        { operation: 'erase', data: { removed, updated, added } },
      ]);
    }

    setFuture([]);
    clearMapMemoEditingLine();
  }, [
    activeMemoLayer,
    activeMemoRecordSet,
    clearMapMemoEditingLine,
    dataUser.uid,
    dispatch,
    mapRegion,
    mapSize,
    memoLines,
  ]);

  /**
   * Handles brush eraser release
   */
  const handleBrushEraserRelease = useCallback(() => {
    const eraserLineLatLonArray = [...mapMemoEditingLineLatLon.current];
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
  }, [clearMapMemoEditingLine, memoLines, updateHistoryAndDeleteRecords]);

  /**
   * Handles stamp eraser release
   */
  const handleStampEraserRelease = useCallback(() => {
    const eraserLineLatLonArray = [...mapMemoEditingLineLatLon.current];
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
  }, [clearMapMemoEditingLine, mapRegion, memoLines, updateHistoryAndDeleteRecords]);

  /**
   * Handles the end of a touch gesture
   */
  const handleReleaseMapMemo = useCallback(() => {
    stopEdgePan();
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
    } else if (currentMapMemoTool === 'PEN_ERASER_PARTIAL') {
      handlePenEraserPartialRelease();
    }
  }, [
    currentMapMemoTool,
    handleBrushEraserRelease,
    handleBrushToolRelease,
    handlePenEraserRelease,
    handlePenEraserPartialRelease,
    handlePenToolRelease,
    handleStampEraserRelease,
    handleStampToolRelease,
    stopEdgePan,
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
    } else if (lastOperation.operation === 'erase') {
      const { removed, updated, added } = lastOperation.data;
      //追加セグメントを除去 → 更新レコードを元に戻す → 削除レコードを元の位置へ復元
      const addedIds = new Set(added.map((line) => line.id));
      newDrawLine = newDrawLine.filter((line) => !addedIds.has(line.id));
      updated.forEach(({ line, updatedLine }) => {
        const index = newDrawLine.findIndex((l) => l.id === updatedLine.id);
        if (index !== -1) newDrawLine[index] = line;
      });
      removed.forEach(({ idx, line }) => {
        newDrawLine.splice(idx, 0, line);
      });
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
    } else if (nextOperation.operation === 'erase') {
      const { removed, updated, added } = nextOperation.data;
      const removedIds = new Set(removed.map((item) => item.line.id));
      newDrawLine = newDrawLine.filter((line) => !removedIds.has(line.id));
      updated.forEach(({ updatedLine }) => {
        const index = newDrawLine.findIndex((l) => l.id === updatedLine.id);
        if (index !== -1) newDrawLine[index] = updatedLine;
      });
      newDrawLine = [...newDrawLine, ...added];
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

    //描いた色と太さをそのまま表示するにはINDIVIDUALが必要。
    //またストロークごとにラベルが出ると描画の邪魔になるのでラベルは非表示にする。
    //どちらも元の設定を退避し、カラータイプを戻したときに復元できるようにする
    const newLayer = {
      ...activeMemoLayer,
      colorStyle: {
        ...activeMemoLayer.colorStyle,
        colorType: 'INDIVIDUAL' as const,
        fieldName: '__CUSTOM',
        customFieldValue: '_strokeColor',
        savedFieldName: activeMemoLayer.colorStyle.fieldName,
        savedCustomFieldValue: activeMemoLayer.colorStyle.customFieldValue,
        savedLabel: activeMemoLayer.label,
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
      if (edgePanTimer.current !== undefined) {
        clearInterval(edgePanTimer.current);
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
    mapMemoEditingLineLatLon,
    editableMapMemo,
    isIndividualColorRequired,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    mapMemoLines,
    snapWithLine,
    arrowStyle,
    isStraightStyle,
    isModalMapMemoToolHidden,
    isMapMemoWidthZoomLinked,
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
    pauseMapMemoDrawing,
    setPencilModeActive,
    setSnapWithLine,
    setIsStraightStyle,
    setIsModalMapMemoToolHidden,
    setIsMapMemoWidthZoomLinked,
  } as const;
};
