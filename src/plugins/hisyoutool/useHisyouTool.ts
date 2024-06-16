import { Position } from '@turf/turf';
import { MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { DrawLineType, DrawToolType, LayerType, LineRecordType, RecordType, UndoLineType } from '../../types';
import {
  checkDistanceFromLine,
  getSnappedPositionWithLine,
  isNearWithPlot,
  latlonArrayToLatLonObjects,
  latLonObjectsToLatLonArray,
  latLonObjectsToXYArray,
  xyArrayToLatLonArray,
} from '../../utils/Coords';
import { useWindow } from '../../hooks/useWindow';
import {
  getSnappedPositionWithActions,
  getSnappedLine,
  getSplittedLinesByLine,
  getSplittedLinesByPoint,
  legendsToProperties,
  propertiesToLegends,
} from './utils';
import { ulid } from 'ulid';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { addRecordsAction, deleteRecordsAction } from '../../modules/dataSet';
import { AppState } from '../../modules';
import MapView, { LatLng } from 'react-native-maps';
import { useDrawObjects } from '../../hooks/useDrawObjects';
import { useRecord } from '../../hooks/useRecord';
import { MapRef } from 'react-map-gl';
import { useHisyouToolSetting } from './useHisyouToolSetting';

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
    layer: LayerType | undefined;
    recordSet: RecordType[] | undefined;
  };
  convertFeatureToHisyouLine: (layerId: string, features: LineRecordType[]) => void;
  deleteHisyouLine: () => void;
};

export const useHisyouTool = (
  drawLine: React.MutableRefObject<DrawLineType[]>,
  editingLineXY: React.MutableRefObject<Position[]>,
  undoLine: React.MutableRefObject<UndoLineType[]>,
  editingObjectIndex: React.MutableRefObject<number>,
  currentDrawTool: DrawToolType,
  isEditingObject: MutableRefObject<boolean>,
  mapViewRef: MapView | MapRef | null
): UseHisyouToolReturnType => {
  const dispatch = useDispatch();
  const { mapSize, mapRegion } = useWindow();
  const { dataUser, generateRecord, addRecord } = useRecord();
  const { moveSvgFreehandTool, releaseSvgFreehandTool } = useDrawObjects(
    drawLine,
    editingLineXY,
    undoLine,
    editingObjectIndex,
    currentDrawTool,
    isEditingObject,
    mapViewRef
  );
  const hisyouLayerId = useSelector(
    (state: AppState) => state.settings.plugins?.hisyouTool?.hisyouLayerId ?? '',
    shallowEqual
  );
  const hisyouData = useSelector((state: AppState) => state.dataSet.find((v) => v.layerId === hisyouLayerId));
  const { selectedRecord } = useRecord();
  const { isHisyouToolActive } = useHisyouToolSetting();

  const editingHisyouObjects = useRef<{
    hisyouLineIndex: number | undefined;
    hisyouActionsIndex: number[];
  }>({
    hisyouLineIndex: undefined,
    hisyouActionsIndex: [],
  });

  const startEditHisyouAction = useCallback(
    (pXY: Position) => {
      const index = editingObjectIndex.current;
      if (index === -1) return;
      const hisyouLine = drawLine.current[index];
      const isHisyouLine = hisyouLine.properties.includes('HISYOU');
      if (!isHisyouLine) return;
      const hisyouActions = drawLine.current.filter(
        (line) => line.id === hisyouLine.id && !line.properties.includes('HISYOU')
      );
      const hisyouActionsIndex = drawLine.current
        .map((line, idx) => line.id === hisyouLine.id && !line.properties.includes('HISYOU') && idx)
        .filter((v): v is number => v !== false);

      const snappedWithHisyouLine = getSnappedPositionWithLine(pXY, hisyouLine.xy, { isXY: true }).position;
      const snappedWithActions = getSnappedPositionWithActions(snappedWithHisyouLine, hisyouActions);
      editingHisyouObjects.current = { hisyouLineIndex: index, hisyouActionsIndex: hisyouActionsIndex };
      editingLineXY.current = [snappedWithActions];
      return true;
    },
    [drawLine, editingLineXY, editingObjectIndex]
  );

  const tryFinishHisyouEdit = useCallback(
    (pXY: Position) => {
      const index = editingObjectIndex.current;

      if (index === -1) return false;
      const lineXY = drawLine.current[index].xy;
      if (currentDrawTool === 'HISYOU' && lineXY.length < 2) return false;
      const isNearWithFirstNode = isNearWithPlot(pXY, lineXY[0]);
      if (!isNearWithFirstNode) return false;

      undoLine.current.push({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'FINISH',
      });
      //最初のノードをタッチで編集終了
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

  const tryDeleteHisyouObjectAtPosition = useCallback(
    (pXY: Position) => {
      const deleteIndex = drawLine.current.findIndex((line) => {
        if (!line.properties.includes('HISYOU')) return false;
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
        return { isDeleted: true, hisyouId: drawLine.current[deleteIndex].id };
      }
      return { isDeleted: false, hisyouId: undefined };
    },
    [drawLine, undoLine]
  );

  const trySelectHisyouObjectAtPosition = useCallback(
    (pXY: Position) => {
      editingObjectIndex.current = drawLine.current.findIndex((line) => {
        if (line.xy.length === 0) return false;
        if (!line.properties.includes('HISYOU')) return false;
        return checkDistanceFromLine(pXY, line.xy).isNear;
      });
      if (editingObjectIndex.current === -1) return false;

      //既存ラインの選択
      const index = editingObjectIndex.current;
      undoLine.current.push({
        index: index,
        latlon: drawLine.current[index].latlon,
        action: 'SELECT',
      });
      drawLine.current[index].properties = [...drawLine.current[index].properties, 'EDIT'];

      return true;
    },
    [drawLine, editingObjectIndex, undoLine]
  );

  const deleteHisyouActions = useCallback(
    (hisyouLineId: string) => {
      //既存ラインの選択
      const hisyouActionsIndex = drawLine.current
        .map((line, idx) => line.id === hisyouLineId && !line.properties.includes('HISYOU') && idx)
        .filter((v): v is number => v !== false);

      hisyouActionsIndex.forEach((index) => {
        undoLine.current.push({
          index: index,
          latlon: drawLine.current[index].latlon,
          action: 'DELETE',
        });
        drawLine.current[index] = {
          ...drawLine.current[index],
          xy: [],
          latlon: [],
        };
      });
      editingHisyouObjects.current.hisyouActionsIndex = [];
    },
    [drawLine, undoLine]
  );

  const editStartNewHisyouObject = useCallback(
    (pXY: Position) => {
      //console.log('New Line');

      //新規ラインの場合
      drawLine.current.push({
        id: ulid(),
        layerId: undefined,
        record: undefined,
        xy: [pXY],
        latlon: [],
        properties: ['EDIT', 'arrow'],
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

  const pressSvgHisyouTool = useCallback(
    (pXY: Position) => {
      if (isEditingObject.current) {
        //編集中で最初をクリックしたら編集終了
        const isFishished = tryFinishHisyouEdit(pXY);
        if (isFishished) return;
        //飛翔を変更するならアクション一旦削除
        if (currentDrawTool === 'HISYOU') {
          const hisyouLine = drawLine.current[editingObjectIndex.current];
          deleteHisyouActions(hisyouLine.id);
          editingLineXY.current = [pXY];
          return;
        } else {
          startEditHisyouAction(pXY);
        }
      } else {
        if (currentDrawTool === 'HISYOU') {
          //編集中ではなく最初をクリックしたら削除
          const { isDeleted, hisyouId } = tryDeleteHisyouObjectAtPosition(pXY);
          if (isDeleted && hisyouId !== undefined) {
            deleteHisyouActions(hisyouId);
            return;
          }
          const isSelected = trySelectHisyouObjectAtPosition(pXY);
          if (isSelected) return;

          editStartNewHisyouObject(pXY);
        }
      }
    },
    [
      currentDrawTool,
      deleteHisyouActions,
      drawLine,
      editStartNewHisyouObject,
      editingLineXY,
      editingObjectIndex,
      isEditingObject,
      startEditHisyouAction,
      tryDeleteHisyouObjectAtPosition,
      tryFinishHisyouEdit,
      trySelectHisyouObjectAtPosition,
    ]
  );

  const drawEditingHisyouAction = useCallback(
    (pXY: Position) => {
      if (editingHisyouObjects.current.hisyouLineIndex === undefined) return;
      const hisyouLineXY = drawLine.current[editingHisyouObjects.current.hisyouLineIndex].xy;
      const hisyouActions = editingHisyouObjects.current.hisyouActionsIndex?.map((index) => drawLine.current[index]);
      if (hisyouActions === undefined) return;
      const snappedWithHisyouLine = getSnappedPositionWithLine(pXY, hisyouLineXY, {
        isXY: true,
      }).position;
      const snappedWithActions = getSnappedPositionWithActions(snappedWithHisyouLine, hisyouActions);
      if (currentDrawTool === 'TOMARI') {
        editingLineXY.current = [snappedWithActions];
      } else {
        //ドローツールがポイントとライン以外
        const snappedActionLine = getSnappedLine(editingLineXY.current[0], snappedWithActions, hisyouLineXY);
        editingLineXY.current = snappedActionLine;
      }
    },
    [currentDrawTool, drawLine, editingLineXY]
  );

  const moveSvgHisyouTool = useCallback(
    (pXY: Position) => {
      if (!isEditingObject.current) return;
      if (currentDrawTool === 'HISYOU') {
        moveSvgFreehandTool(pXY);
      } else {
        drawEditingHisyouAction(pXY);
      }
    },
    [currentDrawTool, drawEditingHisyouAction, isEditingObject, moveSvgFreehandTool]
  );

  const createNewAction = useCallback(() => {
    if (editingHisyouObjects.current.hisyouLineIndex === undefined) return;
    //console.log('action id', actionLine.current.hisyouLine.id);
    const hisyouLine = drawLine.current[editingHisyouObjects.current.hisyouLineIndex];
    drawLine.current.push({
      id: hisyouLine.id,
      layerId: undefined,
      record: undefined,
      xy: editingLineXY.current,
      latlon: xyArrayToLatLonArray(editingLineXY.current, mapRegion, mapSize, mapViewRef),
      properties: [currentDrawTool],
    });
    undoLine.current.push({
      index: -1,
      latlon: [],
      action: 'NEW',
    });

    editingLineXY.current = [];
  }, [currentDrawTool, drawLine, editingLineXY, mapRegion, mapSize, mapViewRef, undoLine]);

  const releaseSvgHisyouTool = useCallback(() => {
    if (currentDrawTool === 'HISYOU') {
      releaseSvgFreehandTool(['HISYOU', 'arrow']);
    } else {
      createNewAction();
    }
  }, [createNewAction, currentDrawTool, releaseSvgFreehandTool]);

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
    (layerId: string, features: LineRecordType[]) => {
      features.forEach((record) => {
        //飛翔線も削除用にdrawLineにpush。表示しないために座標は入れない。
        drawLine.current.push({
          id: record.id,
          layerId: layerId,
          record: record,
          xy: [],
          latlon: [],
          properties: ['HISYOU'],
        });

        const actions = hisyouData?.data.filter((d) => d.field._ref === record.id && record.userId === d.userId);

        if (actions === undefined) return;
        actions.forEach((action) => {
          drawLine.current.push({
            id: action.id,
            layerId: hisyouLayerId,
            record: action,
            xy: latLonObjectsToXYArray(action.coords as LatLng[], mapRegion, mapSize, mapViewRef),
            latlon: latLonObjectsToLatLonArray(action.coords as LatLng[]),
            properties: legendsToProperties(action.field['飛翔凡例'] as string),
          });
        });
      });
    },
    [drawLine, hisyouData?.data, hisyouLayerId, mapRegion, mapSize, mapViewRef]
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
          id: ulid(),
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
        return { isOK: false, message: '飛翔レイヤが編集モードになっています', layer: undefined, recordSet: undefined };
      }
      // console.log(line);
      const savedRecordSet: RecordType[] = [];
      for (const line of drawLine.current) {
        //console.log(line.properties.includes('HISYOU'));
        if (!line.properties.includes('HISYOU')) continue;
        //ラインレイヤに追加
        const newRecord = generateRecord(
          'LINE',
          editingLayer,
          editingRecordSet,
          latlonArrayToLatLonObjects(line.latlon)
        );
        addRecord(editingLayer, newRecord);
        savedRecordSet.push(newRecord);

        //アクションレイヤに追加
        saveActions(newRecord.id, line);
      }
      return { isOK: true, message: '', layer: editingLayer, recordSet: savedRecordSet };
    },
    [addRecord, drawLine, generateRecord, hisyouLayerId, saveActions]
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

  useEffect(() => {
    if (isHisyouToolActive && selectedRecord !== undefined)
      convertFeatureToHisyouLine(selectedRecord.layerId, [selectedRecord.record as LineRecordType]);
  }, [convertFeatureToHisyouLine, isHisyouToolActive, selectedRecord]);

  return {
    pressSvgHisyouTool,
    moveSvgHisyouTool,
    releaseSvgHisyouTool,
    saveHisyou,
    convertFeatureToHisyouLine,
    deleteHisyouLine,
  } as const;
};
