import { MutableRefObject, useCallback, useRef, useState } from 'react';
import { Position } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';
import { checkDistanceFromLine, modifyLine, smoothingByBoyle, xyArrayToLatLonArray } from '../utils/Coords';
import { useWindow } from './useWindow';
import { DrawToolType, RecordType } from '../types';

export type UseLineToolReturnType = {
  isPlotting: MutableRefObject<boolean>;
  pressSvgFreehandTool: (point: Position) => void;
  moveSvgFreehandTool: (point: Position) => void;
  releaseSvgFreehandTool: (properties?: string[]) => void;
  pressSvgPlotTool: () => void;
  releaseSvgPlotTool: (pXY: Position) => void;
};

export const useLineTool = (
  drawLine: MutableRefObject<
    {
      id: string;
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

  const pressSvgPlotTool = useCallback(() => {
    //新規ラインの場合
    if (isPlotting.current) {
    } else {
      drawLine.current.push({
        id: uuidv4(),
        record: undefined,
        xy: [],
        latlon: [],
        properties: ['PLOT'],
      });
      undoLine.current.push({
        index: -1,
        latlon: [],
      });
      isPlotting.current = true;
    }
  }, [drawLine, undoLine]);

  const releaseSvgPlotTool = useCallback(
    (pXY: Position) => {
      const index = drawLine.current.length - 1;
      if (drawLine.current[index].xy.length > 0) {
        undoLine.current.push({
          index: index,
          latlon: drawLine.current[index].latlon,
        });
      }
      if (currentDrawTool === 'PLOT_POLYGON' && drawLine.current[index].xy.length > 3) {
        drawLine.current[index].xy.pop();
      }
      drawLine.current[index].xy = [...drawLine.current[index].xy, pXY];

      if (currentDrawTool === 'PLOT_POLYGON' && drawLine.current[index].xy.length > 2) {
        drawLine.current[index].xy.push(drawLine.current[index].xy[0]);
      }
      drawLine.current[index].latlon = xyArrayToLatLonArray(drawLine.current[index].xy, mapRegion, mapSize);
    },
    [currentDrawTool, drawLine, mapRegion, mapSize, undoLine]
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
    releaseSvgPlotTool,
  } as const;
};
