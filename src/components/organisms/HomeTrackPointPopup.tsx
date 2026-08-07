import React, { useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MapViewContext } from '../../contexts/MapView';
import { COLOR } from '../../constants/AppConstants';
import { latLonToXY } from '../../utils/Coords';
import { copyToClipboard } from '../../utils/Clipboard';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import dayjs from '../../i18n/dayjs';

export const HomeTrackPointPopup = React.memo(() => {
  const { trackPointInfo, mapViewRef } = useContext(MapViewContext);
  const { mapRegion, mapSize } = useWindow();
  const WIDTH = 150;

  const timeText = useMemo(() => {
    if (trackPointInfo?.timestamp === undefined) return null;
    return dayjs(trackPointInfo.timestamp).format('L HH:mm:ss');
  }, [trackPointInfo?.timestamp]);

  const elevationText = useMemo(() => {
    if (trackPointInfo?.altitude === undefined || trackPointInfo?.altitude === null) return null;
    return t('Home.trackPoint.elevation', { elevation: trackPointInfo.altitude.toFixed(1) });
  }, [trackPointInfo?.altitude]);

  const speedText = useMemo(() => {
    if (trackPointInfo?.speed === undefined || trackPointInfo?.speed === null || trackPointInfo.speed < 0) return null;
    return t('Home.trackPoint.speed', { speed: (trackPointInfo.speed * 3.6).toFixed(1) });
  }, [trackPointInfo?.speed]);

  const lat = trackPointInfo?.coordinate.latitude;
  const lon = trackPointInfo?.coordinate.longitude;

  // 緯度経度を表示（小数5桁 ≒ 1m精度）。タップでクリップボードにコピー
  const coordinateText = useMemo(() => {
    if (lat == null || lon == null) return null;
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }, [lat, lon]);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
  }, [lat, lon]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopyCoordinate = useCallback(async () => {
    if (!coordinateText) return;
    const success = await copyToClipboard(coordinateText);
    if (success) setCopied(true);
  }, [coordinateText]);

  const HEIGHT = 36 + (timeText ? 22 : 0) + (elevationText ? 20 : 0) + (speedText ? 20 : 0) + (coordinateText ? 20 : 0);

  // 画面座標を計算。タップ位置のpositionがあればそれを使い、なければ座標から計算
  const position = useMemo(() => {
    if (!trackPointInfo) return null;
    if (trackPointInfo.position) return trackPointInfo.position;
    if (!mapRegion || !mapSize) return null;
    const xy = latLonToXY(
      [trackPointInfo.coordinate.longitude, trackPointInfo.coordinate.latitude],
      mapRegion,
      mapSize,
      mapViewRef.current
    );
    return { x: xy[0], y: xy[1] };
  }, [trackPointInfo, mapRegion, mapSize, mapViewRef]);

  if (!trackPointInfo || !position || !timeText) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: position.y - HEIGHT - 20,
        left: position.x - WIDTH / 2,
        zIndex: 1001,
        elevation: 1001,
      }}
    >
      <View
        style={{
          width: WIDTH,
          backgroundColor: COLOR.WHITE,
          borderRadius: 5,
          padding: 8,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: COLOR.GRAY4, fontSize: 12, paddingBottom: 4 }}>{t('Home.trackPoint.title')}</Text>
          <Text style={{ color: COLOR.BLACK, fontSize: 14, fontWeight: 'bold', paddingBottom: 4 }}>{timeText}</Text>
          {elevationText && (
            <Text style={{ color: COLOR.GRAY4, fontSize: 12, paddingBottom: 4 }}>{elevationText}</Text>
          )}
          {speedText && <Text style={{ color: COLOR.GRAY4, fontSize: 12, paddingBottom: 4 }}>{speedText}</Text>}
          {coordinateText && (
            <Pressable onPress={handleCopyCoordinate} style={{ paddingBottom: 4 }}>
              <Text style={{ color: copied ? COLOR.GRAY4 : COLOR.BLUE, fontSize: 12 }}>
                {copied ? t('Home.trackPoint.copied') : coordinateText}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 吹き出しの三角形 */}
      <View
        // eslint-disable-next-line react-native/no-color-literals
        style={{
          alignSelf: 'center',
          width: 10,
          height: 10,
          backgroundColor: 'transparent',
          borderStyle: 'solid',
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderTopWidth: 10,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: COLOR.WHITE,
        }}
      />
    </View>
  );
});
