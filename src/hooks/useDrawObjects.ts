import { MutableRefObject, useCallback, useRef } from 'react';
import { Position } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import {
  checkDistanceFromLine,
  findNearNodeIndex,
  getSnappedPositionWithLine,
  isClosedPolygon,
  isNearWithPlot,
  isWithinPolygon,
  modifyLine,
  simplify,
  smoothingByBezier,
  xyArrayToLatLonArray,
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { DrawLineType, DrawToolType, UndoLineType } from '../types';
import { isLineTool, isPointTool, isPolygonTool } from '../utils/General';
import MapView from 'react-native-maps';
import { MapRef } from 'react-map-gl';

export type UseDrawObjectsReturnType = {
  isEditingObject: MutableRefObject<boolean>;
  pressSvgFreehandTool: (point: Position) => void;
  moveSvgFreehandTool: (point: Position) => void;
  releaseSvgFreehandTool: (properties?: string[]) => void;
  pressSvgPlotTool: (pXY: Position) => void;
  moveSvgPlotTool: (pXY: Position) => void;
  releaseSvgPlotTool: (pXY: Position) => void;
};

export const useDrawObjects = (
  drawLine: MutableRefObject<DrawLineType[]>,
  editingLineXY: MutableRefObject<Position[]>,
  undoLine: MutableRefObject<UndoLineType[]>,
  editingObjectIndex: MutableRefObject<number>,
  currentDrawTool: DrawToolType,
  isEditingObject: MutableRefObject<boolean>,
  mapViewRef: MapView | MapRef | null
): UseDrawObjectsReturnType => {
  const { mapSize, mapRegion } = useWindow();

  type EditingNodeStateType = 'NONE' | 'NEW' | 'MOVE';
  const editingNodeIndex = useRef(-1);
  const editingNodeState = useRef<EditingNodeStateType>('NONE');

  const tryDeleteObjectAtPosition = useCallback(
    (pXY: Position) => {
      //始点のノードに近ければ配列を空にして見えなくする。保存時に配列が空のものを除く。
      if (currentDrawTool === 'PLOT_POINT') return false;
      const deleteIndex = drawLine.current.findIndex((line) => {
        return line.xy.length > 0 && isNearWithPlot(pXY, line.xy[0]);
      });
      if (deleteIndex !== -1) {
        undoLine.current.push({
          index: deleteIndex,
          latlon: drawLine.current[deleteIndex].latlon,
          action: 'DELETE',
        });
        drawLine.current[deleteIndex] = {
          ...drawLine.current[deleteIndex],
          xy: [],
          latlon: [],
          //properties: [],
        };
        return true;
      }
      return false;
    },
    [currentDrawTool, drawLine, undoLine]
  );

  const trySelectObjectAtPosition = useCallback(
    (pXY: Position) => {
      editingObjectIndex.current = drawLine.current.findIndex((line) => {
        if (line.xy.length === 0) return false;
        if (isPointTool(currentDrawTool)) {
          return isNearWithPlot(pXY, line.xy[0]);
        }
        if (isLineTool(currentDrawTool)) {
          return checkDistanceFromLine(pXY, line.xy).isNear;
        }
        if (isPolygonTool(currentDrawTool)) {
          return isWithinPolygon(pXY, line.xy);
        }
      });
      if (editingObjectIndex.current === -1) return false;

      //既存ポイントの修正
      if (isPointTool(currentDrawTool)) {
        isEditingObject.current = true;
        editingNodeIndex.current = 0;
        editingNodeState.current = 'MOVE';
        editingLineXY.current = [pXY];
        return true;
      }
      if (isLineTool(currentDrawTool) || isPolygonTool(currentDrawTool)) {
        //既存ラインの選択
        const index = editingObjectIndex.current;
        const lineXY = drawLine.current[index].xy;
        undoLine.current.push({
          index: index,
          latlon: drawLine.current[index].latlon,
          action: 'SELECT',
        });
        drawLine.current[index].properties = [...drawLine.current[index].properties, 'EDIT'];
        if (isPolygonTool(currentDrawTool)) {
          lineXY.pop(); //閉じたポイントを一旦削除
          drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
        }
        return true;
      }
      return false;
    },
    [
      currentDrawTool,
      drawLine,
      editingLineXY,
      editingObjectIndex,
      isEditingObject,
      mapRegion,
      mapSize,
      mapViewRef,
      undoLine,
    ]
  );

  const editStartNewPlotObject = useCallback(
    (pXY: Position) => {
      //console.log('New Line');
      drawLine.current.push({
        id: uuidv4(),
        layerId: undefined,
        record: undefined,
        xy: [pXY],
        latlon: [],
        properties: [currentDrawTool === 'PLOT_POINT' ? 'POINT' : 'EDIT'],
      });
      if (currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON')
        undoLine.current.push({
          index: -1,
          latlon: [],
          action: 'NEW',
        });
      isEditingObject.current = true;
      editingNodeIndex.current = 0;
      editingNodeState.current = 'NEW';
      editingObjectIndex.current = drawLine.current.length - 1;
    },
    [currentDrawTool, drawLine, editingObjectIndex, isEditingObject, undoLine]
  );

  const tryStartEditNode = useCallback(
    (pXY: Position) => {
      //plotの修正

      const index = editingObjectIndex.current;
      const lineXY = drawLine.current[index].xy;
      const { isNear } = checkDistanceFromLine(pXY, lineXY);
      if (!isNear) return false;

      const nodeIndex = findNearNodeIndex(pXY, lineXY);
      if (nodeIndex >= 0) {
        //console.log('move node');
        editingNodeIndex.current = nodeIndex;
        editingNodeState.current = 'MOVE';
        editingLineXY.current = [lineXY[nodeIndex]];
      } else {
        //console.log('make interporate node');
        const { index: idx } = getSnappedPositionWithLine(pXY, lineXY, {
          isXY: true,
        });
        lineXY.splice(idx + 1, 0, pXY);
        editingNodeIndex.current = idx + 1;
        editingNodeState.current = 'NEW';
      }
      return true;
    },
    [drawLine, editingLineXY, editingObjectIndex]
  );

  const createNewNode = useCallback(
    (pXY: Position) => {
      //console.log('Fix Plot');
      const index = editingObjectIndex.current;
      const lineXY = drawLine.current[index].xy;

      //plotを最後尾に追加
      lineXY.push(pXY);
      editingNodeIndex.current = drawLine.current[index].xy.length - 1;
      editingNodeState.current = 'NEW';
      return true;
    },
    [drawLine, editingObjectIndex]
  );

  const moveNode = useCallback(
    (pXY: Position) => {
      //nodeを動かす。
      //editingLineにも軌跡を保存。離した時に移動量が少なければタップとみなすため。
      const index = editingObjectIndex.current;
      drawLine.current[index].xy.splice(editingNodeIndex.current, 1, pXY);
      editingLineXY.current.push(pXY);
    },
    [drawLine, editingLineXY, editingObjectIndex]
  );

  const trySelectedObjectAsEditing = useCallback(() => {
    if (editingObjectIndex.current >= 0) isEditingObject.current = true;
  }, [editingObjectIndex, isEditingObject]);

  const tryDeleteLineNode = useCallback(() => {
    //console.log('tryDeleteLineNode');
    if (editingNodeState.current === 'NEW') return false;
    if (editingNodeIndex.current === 0) return false;
    if (editingLineXY.current.length > 5) return false;
    const index = editingObjectIndex.current;
    const lineXY = drawLine.current[index].xy;
    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'EDIT',
    });
    //途中のノードをタッチでノード削除
    drawLine.current[index].xy.splice(editingNodeIndex.current, 1);
    drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    editingLineXY.current = [];
    return true;
  }, [editingLineXY, editingObjectIndex, drawLine, undoLine, mapRegion, mapSize, mapViewRef]);

  const fixLittleMovement = useCallback(() => {
    //タッチでズレるので、タッチ前の位置に戻す。
    const index = editingObjectIndex.current;
    const correctXY = editingLineXY.current[0];
    drawLine.current[index].xy.splice(editingNodeIndex.current, 1, correctXY);
  }, [drawLine, editingLineXY, editingObjectIndex]);

  const tryFinishEditObject = useCallback(() => {
    if (editingNodeState.current === 'NEW') return false;
    if (editingNodeIndex.current !== 0) return false;
    if (editingLineXY.current.length > 5) return false;
    fixLittleMovement();
    const index = editingObjectIndex.current;
    const lineXY = drawLine.current[index].xy;

    if (currentDrawTool === 'PLOT_LINE' && lineXY.length < 2) return false;
    if (currentDrawTool === 'PLOT_POLYGON' && lineXY.length < 3) return false;

    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'FINISH',
    });
    //最初のノードをタッチで編集終了
    if (currentDrawTool === 'PLOT_POLYGON') lineXY.push(lineXY[0]);
    drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    drawLine.current[index].properties = drawLine.current[index].properties.filter((p) => p !== 'EDIT');
    editingObjectIndex.current = -1;
    isEditingObject.current = false;
    editingLineXY.current = [];
    return true;
  }, [
    editingLineXY,
    fixLittleMovement,
    editingObjectIndex,
    drawLine,
    currentDrawTool,
    undoLine,
    mapRegion,
    mapSize,
    mapViewRef,
    isEditingObject,
  ]);

  const tryDeletePoint = useCallback(() => {
    const index = editingObjectIndex.current;
    if (editingNodeState.current === 'NEW') return false;
    if (editingLineXY.current.length > 5) return false;
    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'EDIT',
    });
    //ポイント削除
    drawLine.current[index].xy = [];
    drawLine.current[index].latlon = [];
    editingLineXY.current = [];
    isEditingObject.current = false;
    return true;
  }, [drawLine, editingLineXY, editingObjectIndex, isEditingObject, undoLine]);

  const updateNodePosition = useCallback(() => {
    const index = editingObjectIndex.current;
    const lineXY = drawLine.current[index].xy;
    if (isPointTool(currentDrawTool) || drawLine.current[index].latlon.length !== 0) {
      //ラインは新規以外。新規の場合はNEWで追加している。
      undoLine.current.push({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'EDIT',
      });
    }
    drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
    editingLineXY.current = [];
    if (currentDrawTool === 'PLOT_POINT') isEditingObject.current = false;
  }, [
    editingObjectIndex,
    drawLine,
    currentDrawTool,
    mapRegion,
    mapSize,
    mapViewRef,
    editingLineXY,
    isEditingObject,
    undoLine,
  ]);

  const pressSvgPlotTool = useCallback(
    (pXY: Position) => {
      /*
        A.編集中でないなら、
          a.既存のプロットに近いか?
          - 最初のノードに近ければ、オブジェクトを削除（ポイント以外）
          - 近いものがある場合は、既存オブジェクトを選択
          - 近いものが無い場合は、新規プロットの作成

        B.編集中なら
        　b.編集中のプロット（ノードもしくはライン）に近いか
          - 近ければ、ノードの修正もしくは途中にプロットを追加
          - 最初のノードをタッチするだけなら編集終了（ポリゴンは閉じる）
          - 近くなければ、最後尾にプロットを追加
      */
      if (!isEditingObject.current) {
        const isDeleted = tryDeleteObjectAtPosition(pXY);
        if (isDeleted) return;
        const isSelected = trySelectObjectAtPosition(pXY);
        if (isSelected) return;
        editStartNewPlotObject(pXY);
      } else {
        //プロット中なら、
        const isStartEditNode = tryStartEditNode(pXY);
        if (isStartEditNode) return;
        createNewNode(pXY);
      }
    },
    [
      createNewNode,
      editStartNewPlotObject,
      isEditingObject,
      tryDeleteObjectAtPosition,
      trySelectObjectAtPosition,
      tryStartEditNode,
    ]
  );

  const moveSvgPlotTool = useCallback(
    (pXY: Position) => {
      //編集中でなければなにもしない。
      if (!isEditingObject.current) return;
      moveNode(pXY);
    },
    [isEditingObject, moveNode]
  );
  const releaseSvgPlotTool = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (pXY: Position) => {
      if (!isEditingObject.current) {
        trySelectedObjectAsEditing();
        return;
      }

      if (currentDrawTool === 'PLOT_POINT') {
        const isDeleted = tryDeletePoint();
        if (isDeleted) return;
      }
      if (currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON') {
        const isDeleted = tryDeleteLineNode();
        if (isDeleted) return;
        const isFishished = tryFinishEditObject();
        if (isFishished) return;
      }

      updateNodePosition();
    },
    [
      currentDrawTool,
      isEditingObject,
      tryDeleteLineNode,
      tryDeletePoint,
      tryFinishEditObject,
      trySelectedObjectAsEditing,
      updateNodePosition,
    ]
  );

  /******************************************************************: */

  const tryFinishFreehandEditObject = useCallback(
    (pXY: Position) => {
      const index = editingObjectIndex.current;
      if (index === -1) return false;
      const lineXY = drawLine.current[index].xy;
      if (currentDrawTool === 'FREEHAND_LINE' && lineXY.length < 2) return false;
      if (currentDrawTool === 'FREEHAND_POLYGON' && lineXY.length < 3) return false;
      const isNearWithFirstNode = isNearWithPlot(pXY, lineXY[0]);
      if (!isNearWithFirstNode) return false;

      undoLine.current.push({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'FINISH',
      });
      //最初のノードをタッチで編集終了
      if (currentDrawTool === 'FREEHAND_POLYGON') {
        //ポリゴンは閉じてなかったら閉じる
        if (!isClosedPolygon(lineXY)) lineXY.push(lineXY[0]);
      }
      drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize, mapViewRef);
      drawLine.current[index].properties = drawLine.current[index].properties.filter((p) => p !== 'EDIT');
      editingObjectIndex.current = -1;
      isEditingObject.current = false;
      editingLineXY.current = [];

      return true;
    },
    [
      editingObjectIndex,
      drawLine,
      currentDrawTool,
      undoLine,
      mapRegion,
      mapSize,
      mapViewRef,
      isEditingObject,
      editingLineXY,
    ]
  );

  const editStartNewFreehandObject = useCallback(
    (pXY: Position) => {
      //console.log('New Line');

      //新規ラインの場合
      drawLine.current.push({
        id: uuidv4(),
        layerId: undefined,
        record: undefined,
        xy: [pXY],
        latlon: [],
        properties: ['EDIT'],
      });

      undoLine.current.push({
        index: -1,
        latlon: [],
        action: 'NEW',
      });
      isEditingObject.current = true;
      editingObjectIndex.current = -1;
    },
    [drawLine, editingObjectIndex, isEditingObject, undoLine]
  );

  const pressSvgFreehandTool = useCallback(
    (pXY: Position) => {
      if (isEditingObject.current) {
        //編集中なら、
        const isFishished = tryFinishFreehandEditObject(pXY);
        if (isFishished) return;

        editingLineXY.current = [pXY];
        return;
      }

      const isDeleted = tryDeleteObjectAtPosition(pXY);
      if (isDeleted) return;
      const isSelected = trySelectObjectAtPosition(pXY);
      if (isSelected) return;
      editStartNewFreehandObject(pXY);
    },
    [
      isEditingObject,
      tryDeleteObjectAtPosition,
      trySelectObjectAtPosition,
      editStartNewFreehandObject,
      tryFinishFreehandEditObject,
      editingLineXY,
    ]
  );

  const drawFreehandNewLine = useCallback(
    (pXY: Position) => {
      //新規ラインの場合
      const index = drawLine.current.length - 1;
      drawLine.current[index].xy = [...drawLine.current[index].xy, pXY];
    },
    [drawLine]
  );

  const drawFreehandEditingLine = useCallback(
    (pXY: Position) => {
      //ライン修正の場合
      editingLineXY.current = [...editingLineXY.current, pXY];
    },
    [editingLineXY]
  );

  const moveSvgFreehandTool = useCallback(
    (pXY: Position) => {
      if (!isEditingObject.current) return;

      if (editingObjectIndex.current === -1) {
        drawFreehandNewLine(pXY);
      } else {
        drawFreehandEditingLine(pXY);
      }
    },
    [isEditingObject, editingObjectIndex, drawFreehandNewLine, drawFreehandEditingLine]
  );

  const tryClosePolygon = (lineXY: Position[]) => {
    if (lineXY.length < 4) return false;
    const startPoint = lineXY[0];
    const endPoint = lineXY[lineXY.length - 1];
    if (!isNearWithPlot(startPoint, endPoint)) return false;
    lineXY.splice(-2, 2, startPoint);
  };

  const createNewFreehandObject = useCallback(
    (properties?: string[]) => {
      const index = drawLine.current.length - 1;
      const lineXY = drawLine.current[index].xy;
      lineXY.splice(-2);
      if (lineXY.length < 2) return;
      //FREEHAND_POLYGONツールの場合は、エリアを閉じるために始点を追加する。
      if (currentDrawTool === 'FREEHAND_POLYGON') tryClosePolygon(lineXY);
      const smoothedXY = smoothingByBezier(lineXY);
      const simplifiedXY = simplify(smoothedXY);
      drawLine.current[index].xy = simplifiedXY;
      drawLine.current[index].latlon = xyArrayToLatLonArray(simplifiedXY, mapRegion, mapSize, mapViewRef);
      drawLine.current[index].properties = properties ? [...properties, 'EDIT'] : ['EDIT'];

      editingObjectIndex.current = index;
    },
    [currentDrawTool, drawLine, editingObjectIndex, mapRegion, mapSize, mapViewRef]
  );

  const editFreehandObject = useCallback(() => {
    // //ライン修正の場合
    const index = editingObjectIndex.current;
    const lineXY = editingLineXY.current;
    lineXY.splice(-2);
    if (lineXY.length < 2) return;
    const smoothedXY = smoothingByBezier(lineXY);
    const simplifiedXY = simplify(smoothedXY);
    const modifiedXY = modifyLine(drawLine.current[index], simplifiedXY, currentDrawTool);
    editingLineXY.current = [];
    if (modifiedXY.length <= 0) return;

    undoLine.current.push({
      index: index,
      latlon: drawLine.current[index].latlon,
      action: 'EDIT',
    });

    drawLine.current[index] = {
      ...drawLine.current[index],
      xy: modifiedXY,
      latlon: xyArrayToLatLonArray(modifiedXY, mapRegion, mapSize, mapViewRef),
    };
  }, [currentDrawTool, drawLine, editingLineXY, editingObjectIndex, mapRegion, mapSize, mapViewRef, undoLine]);

  const releaseSvgFreehandTool = useCallback(
    (properties?: string[]) => {
      if (!isEditingObject.current) {
        trySelectedObjectAsEditing();
        return;
      }

      if (editingObjectIndex.current === -1) {
        createNewFreehandObject(properties);
      } else {
        editFreehandObject();
      }
    },
    [isEditingObject, editingObjectIndex, trySelectedObjectAsEditing, createNewFreehandObject, editFreehandObject]
  );

  return {
    isEditingObject,
    pressSvgFreehandTool,
    moveSvgFreehandTool,
    releaseSvgFreehandTool,
    pressSvgPlotTool,
    moveSvgPlotTool,
    releaseSvgPlotTool,
  } as const;
};
