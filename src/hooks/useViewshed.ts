import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ulid } from 'ulid';
import { RootState } from '../store';
import { LayerType, LocationType, RecordType } from '../types';
import { addLayerAction, updateLayerAction } from '../modules/layers';
import { COLOR } from '../constants/AppConstants';
import { useRecord } from './useRecord';
import { calcViewshedPolygons, makeCircleRing } from '../utils/viewshed';
import { t } from '../i18n/config';

/** 可視領域専用レイヤ（ポリゴン）の固定ID。トラックレイヤ(id:'track')と同じ方式 */
export const VIEWSHED_LAYER_ID = 'viewshed';
/** 範囲円専用レイヤ（ポリゴン・枠線のみ）の固定ID */
export const VIEWSHED_CIRCLE_LAYER_ID = 'viewshed_circle';
/** 観測点専用レイヤ（ポイント）の固定ID */
export const VIEWSHED_POINT_LAYER_ID = 'viewshed_center';

const baseColorStyle = {
  colorType: 'SINGLE' as const,
  fieldName: '',
  customFieldValue: '',
  colorRamp: 'RANDOM' as const,
  colorList: [],
};

/**
 * 可視領域専用レイヤ（ポリゴン）のテンプレート。初回作成時にオンデマンドで追加する
 * （layersInitialStateには入れない: 新規ユーザーに空レイヤを見せないため）。
 * プロジェクト中はローカル一時レイヤ扱いで、アップロード対象外（isLocalViewshedLayer参照）。
 * transparency=0で半透明の赤の塗りつぶし。属性は観測点との対応が分かる観測点Noのみ。
 */
export const createViewshedLayer = (): LayerType => ({
  id: VIEWSHED_LAYER_ID,
  name: t('common.viewshed'),
  type: 'POLYGON',
  permission: 'PRIVATE',
  colorStyle: { ...baseColorStyle, transparency: 0, color: 'rgba(255, 0, 0, 0.4)' },
  label: '',
  visible: true,
  active: false,
  field: [{ id: ulid(), name: t('Home.viewshed.fieldNo'), format: 'INTEGER' }],
});

/** 範囲円専用レイヤのテンプレート。transparencyフラグで塗りなし（枠線のみ）にする */
export const createViewshedCircleLayer = (): LayerType => ({
  id: VIEWSHED_CIRCLE_LAYER_ID,
  name: t('common.viewshedCircle'),
  type: 'POLYGON',
  permission: 'PRIVATE',
  colorStyle: { ...baseColorStyle, transparency: 1, color: COLOR.RED },
  label: '',
  visible: true,
  active: false,
  field: [{ id: ulid(), name: t('Home.viewshed.fieldNo'), format: 'INTEGER' }],
});

/** 観測点専用レイヤ（ポイント）のテンプレート。観測点Noをラベル表示する */
export const createViewshedPointLayer = (): LayerType => ({
  id: VIEWSHED_POINT_LAYER_ID,
  name: t('common.viewshedCenter'),
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle: { ...baseColorStyle, transparency: 0.2, color: COLOR.RED },
  label: t('Home.viewshed.fieldNo'),
  visible: true,
  active: false,
  field: [
    { id: ulid(), name: t('Home.viewshed.fieldNo'), format: 'SERIAL' },
    { id: ulid(), name: t('Home.viewshed.fieldDistance'), format: 'DECIMAL' },
    { id: ulid(), name: t('Home.viewshed.fieldHeight'), format: 'DECIMAL' },
    { id: ulid(), name: t('Home.viewshed.fieldElevation'), format: 'DECIMAL' },
    // スナップした既存ポイントの名前を記録する
    { id: ulid(), name: t('Home.viewshed.fieldRemarks'), format: 'STRING' },
  ],
});

export type UseViewshedReturnType = {
  createViewshed: (
    observer: LocationType,
    distanceKm: number,
    observerHeight: number,
    remarks?: string
  ) => Promise<{
    isOK: boolean;
    message: string;
    layer: LayerType | undefined;
    recordSet: RecordType[] | undefined;
  }>;
};

/**
 * 可視領域の計算と専用レイヤへの保存。
 * 可視領域（塗り）・範囲円（枠線のみ）・観測点（ポイント）を別レイヤに保存し、
 * 観測点No属性で対応づける。レイヤは初回に自動作成するため、
 * 編集可能レイヤがなくても（プロジェクト中でも）作成できる。
 */
export const useViewshed = (): UseViewshedReturnType => {
  const dispatch = useDispatch();
  const layers = useSelector((state: RootState) => state.layers);
  const { dataUser, pointDataSet, polygonDataSet, addRecord, generateRecord } = useRecord();

  const createViewshed = useCallback(
    async (observer: LocationType, distanceKm: number, observerHeight: number, remarks?: string) => {
      let result;
      try {
        result = await calcViewshedPolygons(observer, distanceKm * 1000, observerHeight);
      } catch (e) {
        result = null;
      }
      if (result === null) {
        return { isOK: false, message: t('hooks.message.failGetDem'), layer: undefined, recordSet: undefined };
      }
      const { polygons, observerElevation } = result;
      if (polygons.length === 0) {
        return { isOK: false, message: t('hooks.message.failCalcViewshed'), layer: undefined, recordSet: undefined };
      }

      // 専用レイヤがなければ自動作成（トラックレイヤと同じ方式）
      const ensureLayer = (id: string, create: () => LayerType): LayerType => {
        const existing = layers.find((l) => l.id === id);
        if (existing) return existing;
        const newLayer = create();
        dispatch(addLayerAction(newLayer));
        return newLayer;
      };
      const layer = ensureLayer(VIEWSHED_LAYER_ID, createViewshedLayer);
      const circleLayer = ensureLayer(VIEWSHED_CIRCLE_LAYER_ID, createViewshedCircleLayer);
      let pointLayer = ensureLayer(VIEWSHED_POINT_LAYER_ID, createViewshedPointLayer);
      // 旧バージョンで作成済みの観測点レイヤに備考フィールドがなければ追加する
      const remarksFieldName = t('Home.viewshed.fieldRemarks');
      if (!pointLayer.field.some((f) => f.name === remarksFieldName)) {
        pointLayer = {
          ...pointLayer,
          field: [...pointLayer.field, { id: ulid(), name: remarksFieldName, format: 'STRING' as const }],
        };
        dispatch(updateLayerAction(pointLayer));
      }

      const findRecordSet = (dataSet: { layerId: string; userId: string | undefined; data: RecordType[] }[], id: string) =>
        dataSet.find((d) => d.layerId === id && d.userId === dataUser.uid)?.data ?? [];
      const recordSet = findRecordSet(polygonDataSet, VIEWSHED_LAYER_ID);
      const circleRecordSet = findRecordSet(polygonDataSet, VIEWSHED_CIRCLE_LAYER_ID);
      const pointRecordSet = findRecordSet(pointDataSet, VIEWSHED_POINT_LAYER_ID);

      const fieldNo = t('Home.viewshed.fieldNo');

      // 先に観測点を保存して観測点No（SERIAL）を確定し、ポリゴン側に同じNoを記録する
      const pointRecord: RecordType = generateRecord('POINT', pointLayer, pointRecordSet, {
        latitude: observer.latitude,
        longitude: observer.longitude,
      });
      const observerNo = pointRecord.field[fieldNo];
      const centerRecord: RecordType = {
        ...pointRecord,
        field: {
          [fieldNo]: observerNo,
          [t('Home.viewshed.fieldDistance')]: distanceKm,
          [t('Home.viewshed.fieldHeight')]: observerHeight,
          [t('Home.viewshed.fieldElevation')]: Math.round(observerElevation * 10) / 10,
          [remarksFieldName]: remarks ?? '',
        },
      };
      addRecord(pointLayer, centerRecord);

      const savedRecordSet: RecordType[] = [centerRecord];

      // 飛び地はマルチポリゴン非対応のため外周リングごとに別レコードで保存する
      const viewshedRecords: RecordType[] = [];
      for (const polygon of polygons) {
        const record = generateRecord('POLYGON', layer, [...recordSet, ...viewshedRecords], polygon.coords);
        const recordWithField: RecordType = {
          ...record,
          field: { [fieldNo]: observerNo },
          ...(Object.keys(polygon.holes).length > 0 ? { holes: polygon.holes } : {}),
        };
        addRecord(layer, recordWithField);
        viewshedRecords.push(recordWithField);
      }
      savedRecordSet.push(...viewshedRecords);

      // 範囲円は枠線のみの専用レイヤへ
      const circleRecord: RecordType = {
        ...generateRecord('POLYGON', circleLayer, circleRecordSet, makeCircleRing(observer, distanceKm * 1000)),
        field: { [fieldNo]: observerNo },
      };
      addRecord(circleLayer, circleRecord);
      savedRecordSet.push(circleRecord);

      return { isOK: true, message: '', layer, recordSet: savedRecordSet };
    },
    [layers, pointDataSet, polygonDataSet, dataUser.uid, dispatch, addRecord, generateRecord]
  );

  return { createViewshed } as const;
};
