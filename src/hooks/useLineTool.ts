import { MutableRefObject, useCallback, useRef, useState } from 'react';
import { Position } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import {
  checkDistanceFromLine,
  findNearNodeIndex,
  getLineSnappedPosition,
  isNearWithPlot,
  modifyLine,
  smoothingByBoyle,
  xyArrayToLatLonArray,
} from '../utils/Coords';
import { useWindow } from './useWindow';
import { DrawToolType, RecordType } from '../types';

export type UseLineToolReturnType = {
  isPlotting: MutableRefObject<boolean>;
  pressSvgFreehandTool: (point: Position) => void;
  moveSvgFreehandTool: (point: Position) => void;
  releaseSvgFreehandTool: (properties?: string[]) => void;
  pressSvgPlotTool: (pXY: Position) => void;
  moveSvgPlotTool: (pXY: Position) => void;
  releaseSvgPlotTool: (pXY: Position) => void;
};

export const useLineTool = (
  drawLine: MutableRefObject<
    {
      id: string;
      layerId: string | undefined;
      record: RecordType | undefined;
      xy: Position[];
      latlon: Position[];
      properties: string[];
    }[]
  >,
  editingLine: MutableRefObject<{ start: Position; xy: Position[] }>,
  undoLine: MutableRefObject<{ index: number; latlon: Position[] }[]>,
  modifiedIndex: MutableRefObject<number>,
  currentDrawTool: DrawToolType
): UseLineToolReturnType => {
  const { mapSize, mapRegion } = useWindow();
  const [, setRedraw] = useState('');
  const isPlotting = useRef(false);
  const plotIndex = useRef(0);

  const pressSvgPlotTool = useCallback(
    (pXY: Position) => {
      /*
        A.プロット中でないなら、
          a.既存のプロットに近いか?
          - 近いものが無い場合は、新規プロットの作成
          - 近いものがある場合は、既存プロットの修正
        B.プロット中なら
        　b.編集中のプロット（ノードもしくはライン）に近いか
          -　近くなければ、最後尾にプロットを追加
          - 近ければ、ノードの修正もしくは途中にプロットを追加
      */
      if (!isPlotting.current) {
        //プロット中でないなら、

        modifiedIndex.current = drawLine.current.findIndex((line) => {
          if (currentDrawTool === 'PLOT_POINT') {
            return isNearWithPlot(pXY, line.xy[0]);
          } else {
            return !checkDistanceFromLine(pXY, line.xy).isFar;
          }
        });

        //新規ラインの作成
        if (modifiedIndex.current === -1) {
          //console.log('New Line');
          drawLine.current.push({
            id: uuidv4(),
            layerId: undefined,
            record: undefined,
            xy: [pXY],
            latlon: [],
            properties: ['PLOT'],
          });

          isPlotting.current = true;
          plotIndex.current = 0;
          modifiedIndex.current = drawLine.current.length - 1;
        } else {
          //console.log('Fix Line');
          //既存ポイントの修正
          isPlotting.current = true;
          if (currentDrawTool === 'PLOT_POINT') {
            plotIndex.current = 0;
            return;
          }
          //既存ラインの修正
          const index = modifiedIndex.current;
          const lineXY = drawLine.current[index].xy;
          if (currentDrawTool === 'PLOT_POLYGON') lineXY.pop(); //閉じたポイントを一旦削除

          const nodeIndex = findNearNodeIndex(pXY, lineXY);
          if (nodeIndex >= 0) {
            //閉じたあとの最初の修正では始点も動かせる
            //nodeを動かす
            plotIndex.current = nodeIndex;
          } else {
            //中間nodeを作成
            const { index: idx } = getLineSnappedPosition(pXY, lineXY, {
              isXY: true,
            });
            lineXY.splice(idx + 1, 0, pXY);
            plotIndex.current = idx + 1;
          }
        }
      } else {
        //プロット中なら、
        //console.log('Fix Plot');
        const index = modifiedIndex.current;
        const lineXY = drawLine.current[index].xy;

        const { isFar } = checkDistanceFromLine(pXY, lineXY);
        if (isFar) {
          //plotを最後尾に追加
          lineXY.push(pXY);
          plotIndex.current = lineXY.length - 1;
        } else {
          //plotの修正
          const nodeIndex = findNearNodeIndex(pXY, lineXY);
          if (nodeIndex === 0) {
            if (currentDrawTool === 'PLOT_POLYGON') {
              //ポリゴンは始点で離したら、閉じる
              if (lineXY.length >= 3) {
                lineXY.push(lineXY[0]);
                drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize);
                isPlotting.current = false;
              }
            } else if (currentDrawTool === 'PLOT_LINE') {
              //ラインは始点で離したら、閉じる
              if (lineXY.length >= 2) {
                isPlotting.current = false;
              }
            } else {
              plotIndex.current = nodeIndex;
            }
          } else if (nodeIndex > 0) {
            //nodeを動かす
            plotIndex.current = nodeIndex;
          } else {
            //中間nodeを作成
            const { index: idx } = getLineSnappedPosition(pXY, lineXY, {
              isXY: true,
            });
            lineXY.splice(idx + 1, 0, pXY);
            plotIndex.current = idx + 1;
          }
        }
      }
    },
    [currentDrawTool, drawLine, mapRegion, mapSize, modifiedIndex]
  );

  const moveSvgPlotTool = useCallback(
    (pXY: Position) => {
      if (!isPlotting.current) return;
      const index = modifiedIndex.current;
      drawLine.current[index].xy.splice(plotIndex.current, 1, pXY);
    },
    [drawLine, modifiedIndex]
  );

  const releaseSvgPlotTool = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (pXY: Position) => {
      if (!isPlotting.current) return;
      const index = modifiedIndex.current;
      const lineXY = drawLine.current[index].xy;

      if (lineXY.length > 0) {
        undoLine.current.push({
          index: index,
          latlon: drawLine.current[index].latlon,
        });
      }

      drawLine.current[index].latlon = xyArrayToLatLonArray(lineXY, mapRegion, mapSize);
      if (currentDrawTool === 'PLOT_POINT') isPlotting.current = false;
    },
    [currentDrawTool, drawLine, mapRegion, mapSize, modifiedIndex, undoLine]
  );

  const pressSvgFreehandTool = useCallback(
    (pXY: Position) => {
      modifiedIndex.current = drawLine.current.findIndex((line) => {
        const { isFar } = checkDistanceFromLine(pXY, line.xy);
        return !isFar;
      });
      if (modifiedIndex.current === -1) {
        //新規ラインの場合
        drawLine.current.push({
          id: uuidv4(),
          layerId: undefined,
          record: undefined,
          xy: [pXY],
          latlon: [],
          properties: [],
        });
      } else {
        //ライン修正の場合
        editingLine.current = { start: pXY, xy: [pXY] };
      }
    },
    [drawLine, modifiedIndex, editingLine]
  );

  const moveSvgFreehandTool = useCallback(
    (pXY: Position) => {
      if (modifiedIndex.current === -1) {
        //新規ラインの場合
        const index = drawLine.current.length - 1;
        drawLine.current[index].xy = [...drawLine.current[index].xy, pXY];
      } else {
        //ライン修正の場合
        editingLine.current.xy = [...editingLine.current.xy, pXY];
      }
    },
    [drawLine, modifiedIndex, editingLine]
  );

  const releaseSvgFreehandTool = useCallback(
    (properties?: string[]) => {
      const index = drawLine.current.length - 1;
      if (modifiedIndex.current === -1) {
        //新規ラインの場合
        if (drawLine.current[index].xy.length === 1) {
          //1点しかなければ追加しない
          drawLine.current = [];
          setRedraw(uuidv4());
          return;
        }

        smoothingByBoyle(drawLine.current[index].xy);
        //FREEHAND_POLYGONツールの場合は、エリアを閉じるために始点を追加する。
        if (currentDrawTool === 'FREEHAND_POLYGON') drawLine.current[index].xy.push(drawLine.current[index].xy[0]);
        drawLine.current[index].properties = properties ?? [currentDrawTool];
        drawLine.current[index].latlon = xyArrayToLatLonArray(drawLine.current[index].xy, mapRegion, mapSize);
        undoLine.current.push({
          index: -1,
          latlon: [],
        });
      } else {
        // //ライン修正の場合
        smoothingByBoyle(editingLine.current.xy);
        const modifiedXY = modifyLine(drawLine.current[modifiedIndex.current], editingLine.current, currentDrawTool);

        if (modifiedXY.length > 0) {
          undoLine.current.push({
            index: modifiedIndex.current,
            latlon: drawLine.current[modifiedIndex.current].latlon,
          });

          drawLine.current[modifiedIndex.current] = {
            ...drawLine.current[modifiedIndex.current],
            xy: modifiedXY,
            latlon: xyArrayToLatLonArray(modifiedXY, mapRegion, mapSize),
          };
        }
        modifiedIndex.current = -1;
        editingLine.current = { start: [], xy: [] };
      }
    },
    [currentDrawTool, drawLine, mapRegion, mapSize, modifiedIndex, editingLine, undoLine]
  );

  return {
    isPlotting,
    pressSvgFreehandTool,
    moveSvgFreehandTool,
    releaseSvgFreehandTool,
    pressSvgPlotTool,
    moveSvgPlotTool,
    releaseSvgPlotTool,
  } as const;
};
