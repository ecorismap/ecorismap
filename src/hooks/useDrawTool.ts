import { Position } from '@turf/turf';
import { useCallback, useState } from 'react';
import { LineRecordType, LineToolType, RecordType } from '../types';
import {
  checkDistanceFromLine,
  latLonObjectsToLatLonArray,
  latLonObjectsToXYArray,
  modifyLine,
  xyArrayToLatLonArray,
} from '../utils/Coords';
import * as turf from '@turf/turf';
import { useWindow } from './useWindow';
import { v4 as uuidv4 } from 'uuid';
import { deleteRecordsAction } from '../modules/dataSet';
import { useDispatch } from 'react-redux';
import { useFeatureEdit } from './useFeatureEdit';

export type UseDrawToolReturnType = {
  pressSvgDrawTool: (point: Position) => void;
  moveSvgDrawTool: (point: Position) => void;
  releaseSvgDrawTool: (properties?: string[]) => void;
  convertFeatureToDrawLine: (features: LineRecordType[]) => void;
  deleteDrawLine: (layerId: string) => void;
};

export const useDrawTool = (
  currentLineTool: LineToolType,
  modifiedIndex: React.MutableRefObject<number>,
  drawLine: React.MutableRefObject<
    {
      id: string;
      record: RecordType | undefined;
      xy: Position[];
      latlon: Position[];
      properties: string[];
    }[]
  >,
  editingLine: React.MutableRefObject<{
    start: turf.helpers.Position;
    xy: Position[];
  }>,
  undoLine: React.MutableRefObject<
    {
      index: number;
      latlon: Position[];
    }[]
  >
): UseDrawToolReturnType => {
  const dispatch = useDispatch();
  const { dataUser } = useFeatureEdit();
  const [, setRedraw] = useState('');
  const { mapSize, mapRegion } = useWindow();

  const pressSvgDrawTool = useCallback(
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

  const moveSvgDrawTool = useCallback(
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

  const releaseSvgDrawTool = useCallback(
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
        //AREAツールの場合は、エリアを閉じるために始点を追加する。
        if (currentLineTool === 'AREA') drawLine.current[index].xy.push(drawLine.current[index].xy[0]);
        drawLine.current[index].properties = properties ?? [currentLineTool];
        drawLine.current[index].latlon = xyArrayToLatLonArray(drawLine.current[index].xy, mapRegion, mapSize);
        undoLine.current.push({
          index: -1,
          latlon: [],
        });
      } else {
        // //ライン修正の場合
        // // editingLine.current.coords = computeMovingAverage(editingLine.current.coords, AVERAGE_UNIT);
        // // if (editingLine.current.coords.length > AVERAGE_UNIT) {
        // //   //移動平均になっていない終端を削除（筆ハネ）
        // //   editingLine.current.coords = editingLine.current.coords.slice(0, -(AVERAGE_UNIT - 1));
        // // }

        const modifiedXY = modifyLine(drawLine.current[modifiedIndex.current], editingLine.current);
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
          //moveToLastOfArray(drawLine.current, modifiedIndex.current);
        }
        modifiedIndex.current = -1;
        editingLine.current = { start: [], xy: [] };
      }
    },
    [currentLineTool, drawLine, mapRegion, mapSize, modifiedIndex, editingLine, undoLine]
  );

  const convertFeatureToDrawLine = useCallback(
    (features: LineRecordType[]) => {
      features.forEach((record) =>
        drawLine.current.push({
          id: record.id,
          record: record,
          xy: latLonObjectsToXYArray(record.coords, mapRegion, mapSize),
          latlon: latLonObjectsToLatLonArray(record.coords),
          properties: ['DRAW'],
        })
      );
    },
    [drawLine, mapRegion, mapSize]
  );

  const deleteDrawLine = useCallback(
    (layerId: string) => {
      drawLine.current.forEach((line) => {
        if (line.record !== undefined) {
          dispatch(
            deleteRecordsAction({
              layerId: layerId,
              userId: dataUser.uid,
              data: [line.record],
            })
          );
        }
      });
    },
    [dataUser.uid, dispatch, drawLine]
  );

  return {
    pressSvgDrawTool,
    moveSvgDrawTool,
    releaseSvgDrawTool,
    convertFeatureToDrawLine,
    deleteDrawLine,
  } as const;
};
