import { useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import * as Speech from 'expo-speech';
import { distance, point } from '@turf/turf';
import { RootState } from '../store';
import { LocationType, RecordType, LayerType } from '../types';
import { isLocationType } from '../utils/General';

// 通知済みポイントの情報
interface NotifiedPoint {
  id: string;
  notifiedAt: number;
}

// フック戻り値の型
export interface UseProximityAlertReturnType {
  checkProximity: (currentLocation: LocationType) => void;
  resetNotifiedPoints: () => void;
}

/**
 * ポイント接近時に音声通知を行うフック
 */
// デフォルト値（Redux Persistの既存データにproximityAlertがない場合のフォールバック）
const DEFAULT_PROXIMITY_ALERT = {
  enabled: false,
  targetLayerIds: [] as string[],
  distanceThreshold: 10,
};

export const useProximityAlert = (): UseProximityAlertReturnType => {
  // Redux state
  const proximityAlert = useSelector((state: RootState) => state.settings.proximityAlert ?? DEFAULT_PROXIMITY_ALERT);
  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector((state: RootState) => state.dataSet);

  // 通知済みポイントの管理 (Map: pointId -> NotifiedPoint)
  const notifiedPointsRef = useRef<Map<string, NotifiedPoint>>(new Map());

  // 最後の通知時刻（連続通知防止用）
  const lastNotificationTimeRef = useRef<number>(0);

  // 最小通知間隔（ミリ秒）
  const MIN_NOTIFICATION_INTERVAL = 3000; // 3秒

  /**
   * 音声で通知
   */
  const speakAlert = useCallback((pointName: string) => {
    const message = `${pointName}に近づきました`;
    Speech.speak(message, {
      language: 'ja-JP',
      rate: 1.0,
      pitch: 1.0,
    });
  }, []);

  /**
   * 対象レイヤーのポイントを取得
   */
  const getTargetPoints = useCallback((): { record: RecordType; layer: LayerType }[] => {
    if (!proximityAlert.enabled || proximityAlert.targetLayerIds.length === 0) {
      return [];
    }

    const targetPoints: { record: RecordType; layer: LayerType }[] = [];

    for (const layerId of proximityAlert.targetLayerIds) {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'POINT') continue;

      const layerData = dataSet.filter((d) => d.layerId === layerId);
      for (const data of layerData) {
        for (const record of data.data) {
          if (!record.deleted && record.visible && isLocationType(record.coords)) {
            targetPoints.push({ record, layer });
          }
        }
      }
    }

    return targetPoints;
  }, [proximityAlert, layers, dataSet]);

  /**
   * ポイント名を取得（labelフィールドまたはデフォルト）
   */
  const getPointName = useCallback((record: RecordType, layer: LayerType): string => {
    // labelフィールドの値を取得
    const labelFieldName = layer.label;
    if (labelFieldName && record.field[labelFieldName]) {
      const labelValue = record.field[labelFieldName];
      if (typeof labelValue === 'string' || typeof labelValue === 'number') {
        return String(labelValue);
      }
    }
    // フォールバック: レイヤー名
    return layer.name;
  }, []);

  /**
   * 2点間の距離を計算（メートル）
   */
  const calculateDistance = useCallback((from: LocationType, to: LocationType): number => {
    const fromPoint = point([from.longitude, from.latitude]);
    const toPoint = point([to.longitude, to.latitude]);
    // turf.distanceはキロメートルを返すのでメートルに変換
    return distance(fromPoint, toPoint, { units: 'meters' });
  }, []);

  /**
   * 接近チェックと音声通知
   */
  const checkProximity = useCallback(
    (currentLocation: LocationType) => {
      // 機能が無効の場合はスキップ
      if (!proximityAlert.enabled) return;

      // GPS精度が悪い場合はスキップ（30m以上）
      if (currentLocation.accuracy && currentLocation.accuracy > 30) return;

      const now = Date.now();
      const targetPoints = getTargetPoints();
      const threshold = proximityAlert.distanceThreshold;
      const resetThreshold = threshold * 2; // 閾値の2倍離れたらリセット

      for (const { record, layer } of targetPoints) {
        if (!isLocationType(record.coords)) continue;

        const dist = calculateDistance(currentLocation, record.coords as LocationType);
        const notified = notifiedPointsRef.current.get(record.id);

        if (dist <= threshold) {
          // 閾値以内に入った
          if (!notified) {
            // 未通知の場合、連続通知防止チェック
            if (now - lastNotificationTimeRef.current >= MIN_NOTIFICATION_INTERVAL) {
              const pointName = getPointName(record, layer);
              speakAlert(pointName);
              notifiedPointsRef.current.set(record.id, { id: record.id, notifiedAt: now });
              lastNotificationTimeRef.current = now;
            }
          }
        } else if (dist > resetThreshold && notified) {
          // 閾値の2倍以上離れたらリセット（再接近時に再通知可能）
          notifiedPointsRef.current.delete(record.id);
        }
      }
    },
    [proximityAlert, getTargetPoints, calculateDistance, getPointName, speakAlert]
  );

  /**
   * 通知済みポイントをリセット
   */
  const resetNotifiedPoints = useCallback(() => {
    notifiedPointsRef.current.clear();
    lastNotificationTimeRef.current = 0;
  }, []);

  return {
    checkProximity,
    resetNotifiedPoints,
  };
};
