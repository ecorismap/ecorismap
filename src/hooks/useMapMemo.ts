import { Dispatch, MutableRefObject, SetStateAction, useCallback, useMemo, useRef, useState } from 'react';
import { EraserType, MapMemoLineType, MapMemoToolType, PenType } from '../types';
import { hex2qgis, hsv2hex } from '../utils/Color';
import { useWindow } from './useWindow';
import { useDispatch, useSelector } from 'react-redux';
import { AppState } from '../modules';
import { Position } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { xyArrayToLatLonArray } from '../utils/Coords';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';
import { GestureResponderEvent } from 'react-native';
import { setMapMemoAction } from '../modules/mapMemo';
import lineIntersect from '@turf/line-intersect';
import * as turf from '@turf/helpers';
import dayjs from 'dayjs';

export type UseMapMemoReturnType = {
  visibleMapMemo: boolean;
  isMapMemoVisible: boolean;
  visibleMapMemoColor: boolean;
  currentMapMemoTool: MapMemoToolType;
  currentPen: PenType;
  currentEraser: EraserType;
  penColor: string;
  penWidth: number;
  mapMemoEditingLine: MutableRefObject<Position[]>;
  setMapMemoTool: Dispatch<SetStateAction<MapMemoToolType>>;
  setPen: Dispatch<SetStateAction<PenType>>;
  setEraser: Dispatch<SetStateAction<EraserType>>;
  setVisibleMapMemo: Dispatch<SetStateAction<boolean>>;
  setMapMemoVisible: Dispatch<SetStateAction<boolean>>;
  setVisibleMapMemoColor: Dispatch<SetStateAction<boolean>>;
  selectPenColor: (hue: number, sat: number, val: number, alpha: number) => void;
  clearMapMemo: () => Promise<void>;
  onPanResponderGrantMapMemo: (event: GestureResponderEvent) => void;
  onPanResponderMoveMapMemo: (event: GestureResponderEvent) => void;
  onPanResponderReleaseMapMemo: () => void;
  pressUndoMapMemo: () => void;
  pressRedoMapMemo: () => void;
  generateExportMapMemo: () => {
    exportData: {
      data: string;
      name: string;
      type: 'GeoJSON';
      folder: string;
    }[];
    fileName: string;
  };
};
export type HistoryType = {
  operation: string;
  data: MapMemoLineType | { idx: number; line: MapMemoLineType }[];
};

export const useMapMemo = (mapViewRef: MapView | MapRef | null): UseMapMemoReturnType => {
  const dispatch = useDispatch();
  const { mapSize, mapRegion } = useWindow();
  const drawLine = useSelector((state: AppState) => state.mapMemo.drawLine);
  const [history, setHistory] = useState<HistoryType[]>([]);
  const [future, setFuture] = useState<HistoryType[]>([]);
  const [visibleMapMemo, setVisibleMapMemo] = useState(true);
  const [isMapMemoVisible, setMapMemoVisible] = useState(true);
  const [penColor, setPenColor] = useState('#000000');
  const [visibleMapMemoColor, setVisibleMapMemoColor] = useState(false);
  const [currentMapMemoTool, setMapMemoTool] = useState<MapMemoToolType>('NONE');
  const [currentPen, setPen] = useState<PenType>('PEN_MEDIUM');
  const [currentEraser, setEraser] = useState<EraserType>('ERASER');
  const [, setRedraw] = useState('');
  const mapMemoEditingLine = useRef<Position[]>([]);
  const offset = useRef([0, 0]);

  const penWidth = useMemo(() => {
    return currentMapMemoTool === 'PEN_THIN'
      ? 5
      : currentMapMemoTool === 'PEN_MEDIUM'
      ? 10
      : currentMapMemoTool === 'PEN_THICK'
      ? 20
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
    const lineLatLon = xyArrayToLatLonArray(mapMemoEditingLine.current, mapRegion, mapSize, mapViewRef);
    if (lineLatLon.length === 1) lineLatLon.push([lineLatLon[0][0] + 0.0000001, lineLatLon[0][1] + 0.0000001]);
    let newDrawLine = [] as MapMemoLineType[];
    if (currentMapMemoTool.includes('PEN')) {
      const newLine: MapMemoLineType = {
        latlon: lineLatLon,
        strokeWidth: penWidth,
        strokeColor: penColor,
        zoom: mapRegion.zoom,
      };
      newDrawLine = [...drawLine, newLine];
      setHistory([...history, { operation: 'add', data: newLine }]);
      setFuture([]);
    } else if (currentMapMemoTool.includes('ERASER')) {
      const deleteLine = [] as { idx: number; line: MapMemoLineType }[];
      drawLine.forEach((line, idx) => {
        if (lineIntersect(turf.lineString(line.latlon), turf.lineString(lineLatLon)).features.length > 0) {
          deleteLine.push({ idx, line });
        } else {
          newDrawLine.push(line);
        }
      });
      setHistory([...history, { operation: 'remove', data: deleteLine }]);
      setFuture([]);
    }
    mapMemoEditingLine.current = [];
    dispatch(setMapMemoAction({ drawLine: newDrawLine }));
  }, [currentMapMemoTool, dispatch, drawLine, history, mapRegion, mapSize, mapViewRef, penColor, penWidth]);

  const selectPenColor = useCallback((hue: number, sat: number, val: number, alpha: number) => {
    setVisibleMapMemoColor(false);
    const rgb = hsv2hex(hue, sat, val, alpha);

    setPenColor(rgb);
  }, []);

  const clearMapMemo = useCallback(async () => {
    dispatch(setMapMemoAction({ drawLine: [] }));
    setHistory([]);
    setFuture([]);
  }, [dispatch]);

  const pressUndoMapMemo = useCallback(() => {
    if (history.length === 0) return;
    const lastOperation = history[history.length - 1];
    setFuture([...future, lastOperation]);
    setHistory(history.slice(0, history.length - 1));
    if (lastOperation.operation === 'add') {
      dispatch(setMapMemoAction({ drawLine: drawLine.slice(0, drawLine.length - 1) }));
    } else if (lastOperation.operation === 'remove') {
      const newDrawLine = [...drawLine];
      (lastOperation.data as { idx: number; line: MapMemoLineType }[]).forEach(({ idx, line }) => {
        newDrawLine.splice(idx, 0, line);
      });
      dispatch(setMapMemoAction({ drawLine: newDrawLine }));
    }
  }, [dispatch, drawLine, future, history]);

  const pressRedoMapMemo = useCallback(() => {
    if (future.length === 0) return;
    const nextOperation = future[future.length - 1];
    setFuture(future.slice(0, future.length - 1));
    setHistory([...history, nextOperation]);
    if (nextOperation.operation === 'add') {
      dispatch(setMapMemoAction({ drawLine: [...drawLine, nextOperation.data] }));
    } else if (nextOperation.operation === 'remove') {
      const newDrawLine = [...drawLine];
      (nextOperation.data as { idx: number; line: MapMemoLineType }[]).reverse().forEach(({ idx }) => {
        newDrawLine.splice(idx, 1);
      });
      dispatch(setMapMemoAction({ drawLine: newDrawLine }));
    }
  }, [dispatch, drawLine, future, history]);

  const mapMemoToGeoJson = useCallback((drawLine: MapMemoLineType[]) => {
    const geojson = {
      type: 'FeatureCollection',
      name: 'mapMemo',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
      },
    };
    const features = drawLine.map((record) => {
      const coordinates = record.latlon;
      const feature = {
        type: 'Feature',
        properties: {
          strokeColor: record.strokeColor,
          qgisColor: hex2qgis(record.strokeColor),
          strokeWidth: record.strokeWidth,
          zoom: record.zoom,
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates,
        },
      };
      return feature;
    });
    return { ...geojson, features: features };
  }, []);

  const generateExportMapMemo = useCallback(() => {
    const time = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const geojson = mapMemoToGeoJson(drawLine);
    const geojsonData = JSON.stringify(geojson);
    const geojsonName = `mapMemo_${time}.geojson`;
    const exportData = [{ data: geojsonData, name: geojsonName, type: 'GeoJSON' as const, folder: '' }];
    const fileName = `mapMemo_${time}`;
    return { exportData, fileName };
  }, [drawLine, mapMemoToGeoJson]);

  return {
    visibleMapMemo,
    isMapMemoVisible,
    visibleMapMemoColor,
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    penWidth,
    mapMemoEditingLine,
    setVisibleMapMemo,
    setMapMemoTool,
    setPen,
    setEraser,
    setMapMemoVisible,
    setVisibleMapMemoColor,
    selectPenColor,
    clearMapMemo,
    onPanResponderGrantMapMemo,
    onPanResponderMoveMapMemo,
    onPanResponderReleaseMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    generateExportMapMemo,
  } as const;
};
