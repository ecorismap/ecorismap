import { useCallback, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import * as Speech from 'expo-speech';
import { distance, point } from '@turf/turf';
import { RootState } from '../store';
import { LocationType, RecordType, LayerType, ProximityAlertSettingsType, DataType } from '../types';
import { isLocationType } from '../utils/General';
import { generateLabel } from '../utils/Layer';
import i18n, { t } from '../i18n/config';
import { trackLogMMKV } from '../utils/mmkvStorage';

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
const DEFAULT_PROXIMITY_ALERT: ProximityAlertSettingsType = {
  enabled: false,
  targetLayerIds: [],
  distanceThreshold: 10,
};

export const useProximityAlert = (): UseProximityAlertReturnType => {
  // Redux state
  const proximityAlert = useSelector((state: RootState) => state.settings.proximityAlert ?? DEFAULT_PROXIMITY_ALERT);
  const layers = useSelector((state: RootState) => state.layers);
  const dataSet = useSelector((state: RootState) => state.dataSet);

  // 初期化時にMMKVから読み込んだ値でenabledを上書き（kill後の即座復元用）
  // Redux Persistが復元される前でもMMKVの値を使用することで、kill後も正しく動作する
  const savedEnabled = trackLogMMKV.getProximityAlertEnabled();
  const initialProximityAlert = {
    ...proximityAlert,
    enabled: savedEnabled || proximityAlert.enabled,
  };

  // refで最新のstateを保持（コールバックがクロージャで古い参照を保持する問題を回避）
  const proximityAlertRef = useRef<ProximityAlertSettingsType>(initialProximityAlert);
  const layersRef = useRef<LayerType[]>(layers);
  const dataSetRef = useRef<DataType[]>(dataSet);

  // refを最新に同期 + 設定変更時は通知済みポイントをリセット
  useEffect(() => {
    proximityAlertRef.current = proximityAlert;
    // MMKVにも保存（kill後の即座復元用）
    trackLogMMKV.setProximityAlertEnabled(proximityAlert.enabled);
    // 設定変更時は通知済みポイントをリセット（すぐに再通知可能にする）
    notifiedPointsRef.current.clear();
    lastNotificationTimeRef.current = 0;
  }, [proximityAlert]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    dataSetRef.current = dataSet;
  }, [dataSet]);

  // 通知済みポイントの管理 (Map: pointId -> NotifiedPoint)
  const notifiedPointsRef = useRef<Map<string, NotifiedPoint>>(new Map());

  // 最後の通知時刻（連続通知防止用）
  const lastNotificationTimeRef = useRef<number>(0);

  // 最小通知間隔（ミリ秒）
  const MIN_NOTIFICATION_INTERVAL = 3000; // 3秒

  /**
   * 音声で通知（国際化対応）
   */
  const speakAlert = useCallback((pointName: string) => {
    const message = t('settings.proximityAlert.speechMessage', { name: pointName });
    const lang = i18n.language;

    Speech.speak(message, {
      language: lang.startsWith('ja') ? 'ja' : 'en',
      rate: 1.0,
      pitch: 1.0,
    });
  }, []);

  /**
   * 対象レイヤーのポイントを取得（refから最新値を参照）
   */
  const getTargetPoints = useCallback((): { record: RecordType; layer: LayerType }[] => {
    const currentSettings = proximityAlertRef.current;
    const currentLayers = layersRef.current;
    const currentDataSet = dataSetRef.current;

    if (!currentSettings.enabled || currentSettings.targetLayerIds.length === 0) {
      return [];
    }

    const targetPoints: { record: RecordType; layer: LayerType }[] = [];

    for (const layerId of currentSettings.targetLayerIds) {
      const layer = currentLayers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'POINT') continue;

      const layerData = currentDataSet.filter((d) => d.layerId === layerId);
      for (const data of layerData) {
        for (const record of data.data) {
          if (!record.deleted && record.visible && isLocationType(record.coords)) {
            targetPoints.push({ record, layer });
          }
        }
      }
    }

    return targetPoints;
  }, []); // 依存配列を空に - refから最新値を取得するため

  /**
   * ポイント名を取得（カスタムラベル対応）
   */
  const getPointName = useCallback((record: RecordType, layer: LayerType): string => {
    // generateLabelを使用してカスタムラベルを含むすべてのラベル形式に対応
    const label = generateLabel(layer, record);
    // ラベルが空の場合はレイヤー名をフォールバック
    return label || layer.name;
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
   * 接近チェックと音声通知（refから最新値を参照）
   */
  const checkProximity = useCallback(
    (currentLocation: LocationType) => {
      const currentSettings = proximityAlertRef.current;

      // 機能が無効の場合はスキップ
      if (!currentSettings.enabled) {
        return;
      }

      // GPS精度が悪い場合はスキップ（30m以上）
      if (currentLocation.accuracy && currentLocation.accuracy > 30) {
        return;
      }

      const now = Date.now();
      const targetPoints = getTargetPoints();
      const threshold = currentSettings.distanceThreshold;
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
    [getTargetPoints, calculateDistance, getPointName, speakAlert] // proximityAlertを削除 - refから取得するため
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
