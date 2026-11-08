import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';
import { HOME_BTN, COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from 'i18next';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { useExternalGnssStatus } from '../../hooks/useExternalGnssStatus';
import { isGnssReceiverAvailable } from '../../../modules/gnss-receiver/src';
import {
  ellipsoidHeightOf,
  estimateHorizontalAccuracy,
  fixQualityColor,
  fixQualityLabel,
  fixQualityShortLabel,
  formatAccuracy,
} from '../../lib/gnss/toLocation';
interface Props {
  gpsState: any;
  onPressGPS: () => void;
  onOpenGpsSettings?: () => void;
}

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(2)}MB`;

export const HomeGPSButton = React.memo((props: Props) => {
  //console.log('render Compass');
  const { gpsState, onPressGPS, onOpenGpsSettings } = props;
  const { isLandscape } = useWindow();
  const insets = useSafeAreaInsets();
  const { snapshot, active } = useExternalGnssStatus();
  const [detailVisible, setDetailVisible] = useState(false);
  const antennaHeight = useSelector((state: RootState) => state.settings.externalGnss?.antennaHeight ?? 0);
  const lastDevice = useSelector((state: RootState) =>
    state.settings.externalGnss?.autoConnect ? state.settings.externalGnss.lastDevice : undefined
  );
  const isConnected = snapshot.status.link === 'connected';
  // 外部受信機の位置を使っている間は、ボタンの文字と縁の色で測位品質を示す（途絶して内蔵GPSに戻ると元に戻る）
  const externalFix = gpsState !== 'off' && active ? snapshot.fix : null;

  const { fix, status } = snapshot;

  // パネルはボタンを包むViewの外に置く。子として枠の外に描くとAndroidでは切り取られて表示されない
  const top = insets.top + (isLandscape ? 180 : 190);

  return (
    <>
      <View
        style={{
          marginHorizontal: 0,
          left: 9 + insets.left,
          position: 'absolute',
          top,
          // zIndex: 101,
          // elevation: 101,
        }}
      >
        <Button
          name={HOME_BTN.GPS}
          backgroundColor={gpsState === 'follow' ? 'red' : gpsState === 'show' ? COLOR.PALERED : COLOR.ALFABLUE}
          borderColor={externalFix ? fixQualityColor(externalFix.fixQuality) : undefined}
          borderWidth={externalFix ? 3 : undefined}
          onPress={() => onPressGPS()}
          // 長押しで外部GNSS受信機の測位の詳細を開閉する（未接続なら設定への入口を出す。受信機に対応しない端末では何もしない）
          onLongPress={isGnssReceiverAvailable() ? () => setDetailVisible((v) => !v) : undefined}
          labelText={externalFix ? fixQualityShortLabel(externalFix.fixQuality) : t('Home.label.gps')}
        />
      </View>
      {detailVisible && (
        <Pressable style={[styles.panel, { left: 9 + insets.left + 52, top }]} onPress={() => setDetailVisible(false)}>
          {!isConnected ? (
            <>
              <Text style={styles.row}>{`${t('GpsSettings.externalGnss.notConnected')}`}</Text>
              {lastDevice !== undefined && (
                <Text style={styles.note}>
                  {`${t('GpsSettings.externalGnss.autoConnectWaiting', { name: lastDevice.name })}`}
                </Text>
              )}
              {onOpenGpsSettings !== undefined && (
                <Pressable
                  style={styles.linkButton}
                  onPress={() => {
                    setDetailVisible(false);
                    onOpenGpsSettings();
                  }}
                >
                  <Text style={styles.linkButtonText}>{`${t('GpsSettings.externalGnss.openSettings')}`}</Text>
                </Pressable>
              )}
            </>
          ) : fix === null ? (
            <Text style={styles.row}>{`${t('GpsSettings.externalGnss.waitingPosition')}`}</Text>
          ) : (
            <>
              <View style={styles.titleRow}>
                <View
                  style={[styles.badge, { backgroundColor: active ? fixQualityColor(fix.fixQuality) : COLOR.GRAY3 }]}
                >
                  <Text style={styles.badgeText}>
                    {active ? fixQualityLabel(fix.fixQuality) : `${t('GpsSettings.externalGnss.fallback')}`}
                  </Text>
                </View>
              </View>
              <Text style={styles.row}>
                {`${t('GpsSettings.externalGnss.accuracy')} ${formatAccuracy(estimateHorizontalAccuracy(fix))}` +
                  (fix.stdAlt !== null ? ` / ${formatAccuracy(fix.stdAlt)}` : '')}
              </Text>
              <Text style={styles.row}>
                {`${t('GpsSettings.externalGnss.satellites')} ${fix.satellites ?? '-'}  HDOP ${fix.hdop ?? '-'}`}
              </Text>
              {fix.altitudeMsl !== null && (
                <Text
                  style={styles.row}
                >{`${t('GpsSettings.externalGnss.altitude')} ${(fix.altitudeMsl - antennaHeight).toFixed(2)}m`}</Text>
              )}
              {ellipsoidHeightOf(fix, antennaHeight) !== null && (
                <Text style={styles.row}>
                  {`${t('GpsSettings.externalGnss.ellipsoidHeight')} ${ellipsoidHeightOf(fix, antennaHeight)?.toFixed(2)}m`}
                </Text>
              )}
              {fix.diffAge !== null && (
                <Text style={styles.row}>{`${t('GpsSettings.externalGnss.diffAge')} ${fix.diffAge}s`}</Text>
              )}
            </>
          )}
          {status.ntrip !== 'off' && (
            <Text style={styles.row}>
              {`NTRIP ${t(`GpsSettings.externalGnss.ntrip.state.${status.ntrip}`)}  ${formatBytes(status.rtcmBytes)}`}
            </Text>
          )}
        </Pressable>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: COLOR.WHITE,
    fontSize: 12,
    fontWeight: '700',
  },
  linkButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.BLUE,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  linkButtonText: {
    color: COLOR.BLUE,
    fontSize: 12,
    fontWeight: '600',
  },
  note: {
    color: COLOR.GRAY4,
    fontSize: 11,
    marginTop: 2,
  },
  panel: {
    backgroundColor: COLOR.ALFAWHITE,
    borderColor: COLOR.GRAY2,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
  },
  row: {
    color: COLOR.BLACK,
    fontSize: 12,
    marginTop: 2,
  },
  titleRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
});
