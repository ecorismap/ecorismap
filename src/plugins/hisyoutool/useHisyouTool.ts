import { Position } from '@turf/turf';
import { useCallback, useRef } from 'react';
import { DrawToolType, LayerType, LineRecordType, RecordType } from '../../types';
import {
  checkDistanceFromLine,
  getLineSnappedPosition,
  latlonArrayToLatLonObjects,
  latLonObjectsToLatLonArray,
  latLonObjectsToXYArray,
  xyArrayToLatLonArray,
} from '../../utils/Coords';
import * as turf from '@turf/turf';
import { useWindow } from '../../hooks/useWindow';
import {
  getActionSnappedPosition,
  getSnappedLine,
  getSplittedLinesByLine,
  getSplittedLinesByPoint,
  legendsToProperties,
  propertiesToLegends,
} from './utils';
import { v4 as uuidv4 } from 'uuid';
import { useDispatch, useSelector } from 'react-redux';
import { addRecordsAction, deleteRecordsAction } from '../../modules/dataSet';
import { AppState } from '../../modules';
import { LatLng } from 'react-native-maps';
import { useLineTool } from '../../hooks/useLineTool';
import { useRecord } from '../../hooks/useRecord';

export type UseHisyouToolReturnType = {
  pressSvgHisyouTool: (point: Position) => void;
  moveSvgHisyouTool: (point: Position) => void;
  releaseSvgHisyouTool: () => void;
  saveHisyou: (
    editingLayer: LayerType,
    editingRecordSet: RecordType[]
  ) => {
    isOK: boolean;
    message: string;
  };
  convertFeatureToHisyouLine: (features: LineRecordType[]) => void;
  deleteHisyouLine: () => void;
};

export const useHisyouTool = (
  currentDrawTool: DrawToolType,
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
): UseHisyouToolReturnType => {
  const dispatch = useDispatch();
  const { mapSize, mapRegion } = useWindow();
  const { dataUser, generateLineRecord } = useRecord();
  const { pressSvgFreehandTool, moveSvgFreehandTool, releaseSvgFreehandTool } = useLineTool(
    drawLine,
    editingLine,
    undoLine,
    modifiedIndex,
    currentDrawTool
  );
  const hisyouLayerId = useSelector((state: AppState) => state.settings.plugins?.hisyouTool?.hisyouLayerId ?? '');
  const hisyouData = useSelector((state: AppState) => state.dataSet.find((v) => v.layerId === hisyouLayerId));

  const actionLine = useRef<{
    hisyouLine:
      | {
          id: string;
          record: RecordType | undefined;
          xy: Position[];
          latlon: Position[];
          properties: string[];
        }
      | undefined;
    actions:
      | {
          id: string;
          record: RecordType | undefined;
          xy: Position[];
          latlon: Position[];
          properties: string[];
        }[]
      | undefined;
  }>({
    hisyouLine: undefined,
    actions: undefined,
  });

  const pressSvgHisyouTool = useCallback(
    (pXY: Position) => {
      if (currentDrawTool === 'HISYOU') {
        pressSvgFreehandTool(pXY);
      } else {
        const hisyouLine = drawLine.current.find((line) => {
          //ポイントに近いHISYOUを取得
          if (line.properties.includes('HISYOU')) {
            const { isFar } = checkDistanceFromLine(pXY, line.xy);
            if (!isFar) return true;
          }
        });

        if (hisyouLine === undefined) return;
        const actions = drawLine.current.filter(
          (line) => line.id === hisyouLine.id && !line.properties.includes('HISYOU')
        );
        const snapped = getLineSnappedPosition(pXY, hisyouLine.xy, { isXY: true }).position;
        const actionSnapped = getActionSnappedPosition(snapped, actions);
        actionLine.current = { hisyouLine, actions };
        editingLine.current = { start: actionSnapped, xy: [actionSnapped] };
      }
    },
    [currentDrawTool, drawLine, editingLine, pressSvgFreehandTool]
  );

  const moveSvgHisyouTool = useCallback(
    (pXY: Position) => {
      if (currentDrawTool === 'HISYOU') {
        moveSvgFreehandTool(pXY);
      } else if (currentDrawTool === 'TOMARI') {
        //ドローツールがポイントの場合
        if (actionLine.current.hisyouLine === undefined) return;
        const lineSnapped = getLineSnappedPosition(pXY, actionLine.current.hisyouLine.xy, { isXY: true }).position;
        const actionSnapped = getActionSnappedPosition(lineSnapped, actionLine.current.actions!);
        editingLine.current.xy = [actionSnapped];
      } else {
        if (actionLine.current.hisyouLine === undefined) return;
        //ドローツールがポイントとライン以外
        const snapped = getLineSnappedPosition(pXY, actionLine.current.hisyouLine.xy, { isXY: true }).position;
        const actionSnapped = getActionSnappedPosition(snapped, actionLine.current.actions!);
        editingLine.current.xy = getSnappedLine(
          editingLine.current.start,
          actionSnapped,
          actionLine.current.hisyouLine.xy
        );
      }
    },
    [currentDrawTool, editingLine, moveSvgFreehandTool]
  );

  const releaseSvgHisyouTool = useCallback(() => {
    if (currentDrawTool === 'HISYOU') {
      releaseSvgFreehandTool(['HISYOU', 'arrow']);
    } else {
      if (actionLine.current.hisyouLine === undefined) return;
      //console.log('action id', actionLine.current.hisyouLine.id);
      drawLine.current.push({
        id: actionLine.current.hisyouLine.id,
        record: undefined,
        xy: editingLine.current.xy,
        latlon: xyArrayToLatLonArray(editingLine.current.xy, mapRegion, mapSize),
        properties: [currentDrawTool],
      });
      undoLine.current.push({
        index: -1,
        latlon: [],
      });
      actionLine.current = { hisyouLine: undefined, actions: undefined };
      editingLine.current = { start: [], xy: [] };
    }
  }, [currentDrawTool, drawLine, editingLine, mapRegion, mapSize, releaseSvgFreehandTool, undoLine]);

  // const deleteActions = useCallback(
  //   (layerId: string, featureId: string) => {
  //     const targetData = lineDataSet.find((d) => d.layerId === layerId && d.userId === dataUser.uid);
  //     if (targetData === undefined) return;
  //     const deleteRecords = targetData.data.filter((record) => record.field._ref === featureId);
  //     dispatch(
  //       deleteRecordsAction({
  //         layerId: layerId,
  //         userId: dataUser.uid,
  //         data: deleteRecords,
  //       })
  //     );
  //   },
  //   [dataUser.uid, dispatch, lineDataSet]
  // );

  const convertFeatureToHisyouLine = useCallback(
    (features: LineRecordType[]) => {
      features.forEach((record) => {
        //飛翔線も削除用にdrawLineにpush。表示しないために座標は入れない。
        drawLine.current.push({
          id: record.id,
          record: record,
          xy: [],
          latlon: [],
          properties: ['HISYOU'],
        });

        const actions = hisyouData?.data.filter((d) => d.field._ref === record.id && record.userId === d.userId);

        if (actions === undefined) return;
        actions.forEach((action) => {
          //console.log(action.field._ref, action.field['飛翔凡例']);
          drawLine.current.push({
            id: action.id,
            record: action,
            xy: latLonObjectsToXYArray(action.coords as LatLng[], mapRegion, mapSize),
            latlon: latLonObjectsToLatLonArray(action.coords as LatLng[]),
            properties: legendsToProperties(action.field['飛翔凡例'] as string),
          });
        });
      });
    },
    [drawLine, hisyouData?.data, mapRegion, mapSize]
  );

  const saveActions = useCallback(
    (
      referenceDataId: string,
      hisyouLine: {
        id: string;
        record: RecordType | undefined;
        xy: Position[];
        latlon: Position[];
        properties: string[];
      }
    ) => {
      const actions = drawLine.current.filter(
        (line) => line.id === hisyouLine.id && !line.properties.includes('HISYOU')
      );
      if (actions === undefined) return;

      const tomariActions = actions.filter((v) => v.properties.includes('TOMARI'));
      const lineActions = actions.filter((v) => !v.properties.includes('TOMARI'));
      const splittedLinesByLine = getSplittedLinesByLine(hisyouLine, lineActions);
      const splittedLines = getSplittedLinesByPoint(splittedLinesByLine, tomariActions);

      splittedLines.forEach((action) => {
        const updatedField = {
          飛翔凡例: propertiesToLegends(action.properties),
          高度: '',
          _ref: referenceDataId,
        };
        //console.log(updatedField);

        const propertyRecord: RecordType = {
          id: uuidv4(),
          userId: dataUser.uid,
          displayName: dataUser.displayName,
          redraw: false,
          visible: true,
          coords: latlonArrayToLatLonObjects(action.latlon),
          field: updatedField,
        };
        dispatch(
          addRecordsAction({
            layerId: hisyouLayerId,
            userId: dataUser.uid,
            data: [propertyRecord],
          })
        );
      });
    },
    [dataUser.displayName, dataUser.uid, dispatch, drawLine, hisyouLayerId]
  );

  const saveHisyou = useCallback(
    (editingLayer: LayerType, editingRecordSet: RecordType[]) => {
      if (editingLayer.id === hisyouLayerId) {
        return { isOK: false, message: '飛翔レイヤが編集モードになっています' };
      }
      // console.log(line);
      drawLine.current.forEach((line) => {
        //console.log(line.properties.includes('HISYOU'));
        if (!line.properties.includes('HISYOU')) return;
        //ラインレイヤに追加
        const newRecord = generateLineRecord(editingLayer, editingRecordSet, latlonArrayToLatLonObjects(line.latlon));
        dispatch(addRecordsAction({ layerId: editingLayer.id, userId: dataUser.uid, data: [newRecord] }));

        //アクションレイヤに追加
        saveActions(newRecord.id, line);
      });
      return { isOK: true, message: '' };
    },
    [dataUser.uid, dispatch, drawLine, generateLineRecord, hisyouLayerId, saveActions]
  );

  const deleteHisyouLine = useCallback(() => {
    drawLine.current.forEach((line) => {
      if (line.record !== undefined) {
        dispatch(
          deleteRecordsAction({
            layerId: hisyouLayerId,
            userId: dataUser.uid,
            data: [line.record],
          })
        );
      }
    });
  }, [dataUser.uid, dispatch, drawLine, hisyouLayerId]);

  return {
    pressSvgHisyouTool,
    moveSvgHisyouTool,
    releaseSvgHisyouTool,
    saveHisyou,
    convertFeatureToHisyouLine,
    deleteHisyouLine,
  } as const;
};
