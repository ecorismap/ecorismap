import React, { useContext, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { GpsSettingsContext } from '../../contexts/GpsSettings';
import { t } from '../../i18n/config';
import {
  ellipsoidHeightOf,
  estimateHorizontalAccuracy,
  fixQualityColor,
  fixQualityLabel,
  formatAccuracy,
} from '../../lib/gnss/toLocation';
import { Pressable } from '../atoms/Pressable';
import { DEFAULT_GNSS_TRACK_DISTANCE, DEFAULT_GNSS_TRACK_MODE } from '../../lib/gnss/trackThinning';
import { DEFAULT_EXTERNAL_GNSS_SETTINGS } from '../../lib/gnss/settings';
import { isUsbSupported } from '../../lib/gnss/connection';
import { GpsSettingsModalNtrip } from './GpsSettingsModalNtrip';
import { GpsSettingsModalReceiver } from './GpsSettingsModalReceiver';

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${(bytes / 1024 / 1024).toFixed(2)}MB`;

export const GpsSettingsExternalGnss = React.memo(() => {
  const {
    externalGnss: {
      snapshot,
      settings,
      ntripPassword,
      usbDevices,
      refreshUsbDevices,
      bleDevices,
      isBleScanning,
      updateReceiverSettings,
      saveNtripSettings,
      setNtripEnabled,
      fetchMountpoints,
    },
    pressConnectUsb,
    pressScanBle,
    pressConnectBle,
    pressDisconnect,
  } = useContext(GpsSettingsContext);
  const [receiverModalVisible, setReceiverModalVisible] = useState(false);
  const [ntripModalVisible, setNtripModalVisible] = useState(false);
  const { status, fix } = snapshot;
  const isConnected = status.link === 'connected';
  const ntripConfigured = settings.ntrip.host !== '' && settings.ntrip.mountpoint !== '';
  // モーダルは values が変わると入力を保存値に戻す。受信機の接続中は位置が届くたびにこの画面が
  // 描き直されるので、毎回新しいオブジェクトを渡すと選んだ値がすぐ元に戻ってしまう
  const receiverValues = useMemo(
    () => ({
      antennaHeight: settings.antennaHeight,
      baudRate: settings.baudRate,
      trackMode: settings.trackMode,
      trackDistance: settings.trackDistance,
    }),
    [settings.antennaHeight, settings.baudRate, settings.trackMode, settings.trackDistance]
  );

  return (
    <View>
      <Text style={styles.sectionTitle}>{`${t('GpsSettings.externalGnss.sectionTitle')}`}</Text>
      <Text style={styles.description}>{`${t(
        isUsbSupported ? 'GpsSettings.externalGnss.description' : 'GpsSettings.externalGnss.descriptionBleOnly'
      )}`}</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <MaterialCommunityIcons name="satellite-variant" size={20} color={isConnected ? COLOR.BLUE : COLOR.GRAY3} />
          <Text style={styles.linkText} numberOfLines={1}>
            {`${t(`GpsSettings.externalGnss.link.${status.link}`)}${status.linkName ? `  ${status.linkName}` : ''}`}
          </Text>
          {isConnected && (
            <Pressable style={styles.smallButton} onPress={pressDisconnect}>
              <Text style={styles.smallButtonText}>{`${t('GpsSettings.externalGnss.disconnect')}`}</Text>
            </Pressable>
          )}
        </View>
        {status.linkError !== null && <Text style={styles.error}>{status.linkError}</Text>}
        {settings.autoConnect && settings.lastDevice !== undefined && (
          <Text style={styles.note}>
            {`${t('GpsSettings.externalGnss.autoConnectNote', { name: settings.lastDevice.name })}`}
          </Text>
        )}

        {isConnected &&
          (fix === null ? (
            <Text style={styles.note}>{`${t('GpsSettings.externalGnss.waitingPosition')}`}</Text>
          ) : (
            <View style={styles.fixRow}>
              <View style={[styles.badge, { backgroundColor: fixQualityColor(fix.fixQuality) }]}>
                <Text style={styles.badgeText}>{fixQualityLabel(fix.fixQuality)}</Text>
              </View>
              <Text style={styles.fixText}>
                {[
                  `${t('GpsSettings.externalGnss.accuracy')} ${formatAccuracy(estimateHorizontalAccuracy(fix))}`,
                  `${t('GpsSettings.externalGnss.satellites')} ${fix.satellites ?? '-'}`,
                  `HDOP ${fix.hdop ?? '-'}`,
                  fix.altitudeMsl !== null
                    ? `${t('GpsSettings.externalGnss.altitude')} ${(fix.altitudeMsl - settings.antennaHeight).toFixed(2)}m`
                    : null,
                  ellipsoidHeightOf(fix, settings.antennaHeight) !== null
                    ? `${t('GpsSettings.externalGnss.ellipsoidHeight')} ${ellipsoidHeightOf(
                        fix,
                        settings.antennaHeight
                      )?.toFixed(2)}m`
                    : null,
                  fix.diffAge !== null ? `${t('GpsSettings.externalGnss.diffAge')} ${fix.diffAge}s` : null,
                ]
                  .filter(Boolean)
                  .join('  ')}
              </Text>
            </View>
          ))}

        {!isConnected && (
          <View style={styles.devices}>
            {isUsbSupported && (
              <>
                <View style={styles.row}>
                  <Text style={[styles.subTitle, styles.flex]}>{`${t('GpsSettings.externalGnss.usbDevices')}`}</Text>
                  <Pressable style={styles.smallButton} onPress={refreshUsbDevices}>
                    <Text style={styles.smallButtonText}>{`${t('GpsSettings.externalGnss.refresh')}`}</Text>
                  </Pressable>
                </View>
                {usbDevices.length === 0 ? (
                  <Text style={styles.note}>{`${t('GpsSettings.externalGnss.noDevices')}`}</Text>
                ) : (
                  usbDevices.map((device) => (
                    <View key={device.deviceId} style={[styles.row, styles.deviceRow]}>
                      <Text style={[styles.flex, styles.deviceName]} numberOfLines={1}>
                        {device.name}
                      </Text>
                      <Pressable
                        style={[
                          styles.smallButton,
                          styles.primaryButton,
                          status.link === 'connecting' && styles.smallButtonDisabled,
                        ]}
                        disabled={status.link === 'connecting'}
                        onPress={() => pressConnectUsb(device.deviceId)}
                      >
                        <Text
                          style={[
                            styles.smallButtonText,
                            styles.primaryButtonText,
                            status.link === 'connecting' && styles.smallButtonTextDisabled,
                          ]}
                        >
                          {`${t('GpsSettings.externalGnss.connect')}`}
                        </Text>
                      </Pressable>
                    </View>
                  ))
                )}
              </>
            )}
            <View style={[styles.row, isUsbSupported && styles.bleHeader]}>
              <Text style={[styles.subTitle, styles.flex]}>{`${t('GpsSettings.externalGnss.bleDevices')}`}</Text>
              <Pressable
                style={[styles.smallButton, isBleScanning && styles.smallButtonDisabled]}
                disabled={isBleScanning}
                onPress={pressScanBle}
              >
                <Text style={[styles.smallButtonText, isBleScanning && styles.smallButtonTextDisabled]}>
                  {`${t(isBleScanning ? 'GpsSettings.externalGnss.scanning' : 'GpsSettings.externalGnss.scan')}`}
                </Text>
              </Pressable>
            </View>
            {bleDevices.length === 0 ? (
              <Text style={styles.note}>{`${t('GpsSettings.externalGnss.noBleDevices')}`}</Text>
            ) : (
              bleDevices.map((device) => (
                <View key={device.address} style={[styles.row, styles.deviceRow]}>
                  <MaterialCommunityIcons
                    name={device.hasNus ? 'bluetooth-connect' : 'bluetooth'}
                    size={18}
                    color={device.hasNus ? COLOR.BLUE : COLOR.GRAY3}
                  />
                  <Text style={[styles.flex, styles.deviceName]} numberOfLines={1}>
                    {` ${device.name}  (${device.rssi}dBm)`}
                  </Text>
                  <Pressable
                    style={[
                      styles.smallButton,
                      styles.primaryButton,
                      status.link === 'connecting' && styles.smallButtonDisabled,
                    ]}
                    disabled={status.link === 'connecting'}
                    onPress={() => pressConnectBle(device.address)}
                  >
                    <Text
                      style={[
                        styles.smallButtonText,
                        styles.primaryButtonText,
                        status.link === 'connecting' && styles.smallButtonTextDisabled,
                      ]}
                    >
                      {`${t('GpsSettings.externalGnss.connect')}`}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.subTitle}>{`${t('GpsSettings.externalGnss.receiverSettings')}`}</Text>
            <Text style={styles.note}>
              {`${t('GpsSettings.externalGnss.antennaHeight')} ${settings.antennaHeight}` +
                (isUsbSupported && settings.baudRate !== DEFAULT_EXTERNAL_GNSS_SETTINGS.baudRate
                  ? `  ${t('GpsSettings.externalGnss.baudRate')} ${settings.baudRate}`
                  : '')}
            </Text>
            <Text style={styles.note}>
              {`${t('GpsSettings.externalGnss.track.title')} ${t(
                `GpsSettings.externalGnss.track.${settings.trackMode ?? DEFAULT_GNSS_TRACK_MODE}`
              )}${
                (settings.trackMode ?? DEFAULT_GNSS_TRACK_MODE) === 'distance'
                  ? ` ${settings.trackDistance ?? DEFAULT_GNSS_TRACK_DISTANCE}m`
                  : ''
              }`}
            </Text>
          </View>
          <Pressable style={styles.smallButton} onPress={() => setReceiverModalVisible(true)}>
            <Text style={styles.smallButtonText}>{`${t('GpsSettings.externalGnss.edit')}`}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.subTitle}>{`${t('GpsSettings.externalGnss.ntrip.title')}`}</Text>
            <Text style={styles.note} numberOfLines={1}>
              {ntripConfigured
                ? `${settings.ntrip.host}:${settings.ntrip.port}/${settings.ntrip.mountpoint}`
                : `${t('GpsSettings.externalGnss.ntrip.notConfigured')}`}
            </Text>
          </View>
          <Pressable style={styles.smallButton} onPress={() => setNtripModalVisible(true)}>
            <Text style={styles.smallButtonText}>{`${t('GpsSettings.externalGnss.edit')}`}</Text>
          </Pressable>
          <Switch
            value={settings.ntrip.enabled}
            disabled={!ntripConfigured}
            onValueChange={(value) => setNtripEnabled(value)}
          />
        </View>
        {settings.ntrip.enabled && (
          <Text style={styles.note}>
            {`${t(`GpsSettings.externalGnss.ntrip.state.${status.ntrip}`)}  ${t(
              'GpsSettings.externalGnss.ntrip.received'
            )} ${formatBytes(status.rtcmBytes)}`}
          </Text>
        )}
        {settings.ntrip.enabled && status.ntripError !== null && <Text style={styles.error}>{status.ntripError}</Text>}
      </View>

      <GpsSettingsModalReceiver
        visible={receiverModalVisible}
        values={receiverValues}
        pressOK={(values) => {
          updateReceiverSettings(values);
          setReceiverModalVisible(false);
        }}
        pressCancel={() => setReceiverModalVisible(false)}
      />
      <GpsSettingsModalNtrip
        visible={ntripModalVisible}
        ntrip={settings.ntrip}
        password={ntripPassword}
        fetchMountpoints={fetchMountpoints}
        pressOK={(ntrip, password) => {
          setNtripModalVisible(false);
          saveNtripSettings(ntrip, password);
        }}
        pressCancel={() => setNtripModalVisible(false)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    marginRight: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: COLOR.WHITE,
    fontSize: 12,
    fontWeight: '700',
  },
  bleHeader: {
    marginTop: 14,
  },
  card: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  description: {
    color: COLOR.GRAY3,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  deviceName: {
    fontSize: 14,
  },
  deviceRow: {
    marginTop: 8,
  },
  devices: {
    marginTop: 10,
  },
  error: {
    color: COLOR.RED,
    fontSize: 12,
    marginTop: 4,
  },
  fixRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  fixText: {
    color: COLOR.GRAY4,
    flex: 1,
    fontSize: 12,
  },
  flex: {
    flex: 1,
  },
  linkText: {
    flex: 1,
    fontSize: 15,
    marginLeft: 8,
  },
  note: {
    color: COLOR.GRAY3,
    fontSize: 12,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: COLOR.BLUE,
  },
  primaryButtonText: {
    color: COLOR.WHITE,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  sectionTitle: {
    color: COLOR.GRAY4,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 20,
  },
  // グレーは無効の意味で使うので、押せるボタンは青枠にする
  smallButton: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.BLUE,
    borderRadius: 5,
    borderWidth: 1,
    marginHorizontal: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  smallButtonDisabled: {
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY2,
  },
  smallButtonText: {
    color: COLOR.BLUE,
    fontSize: 13,
    fontWeight: '600',
  },
  smallButtonTextDisabled: {
    color: COLOR.GRAY3,
  },
  subTitle: {
    color: COLOR.BLACK,
    fontSize: 15,
    fontWeight: '600',
  },
});
