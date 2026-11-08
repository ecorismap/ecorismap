import * as GnssReceiver from '../../../modules/gnss-receiver/src';
import { ExternalGnssDeviceType, NtripSettingsType } from '../../types';

/**
 * 受信機・NTRIPへの接続処理。設定画面の手動接続と、前回の受信機への自動再接続で共通に使う。
 */

export const toConnectionConfig = (ntrip: NtripSettingsType, password: string): GnssReceiver.NtripConnectionConfig => ({
  host: ntrip.host,
  port: ntrip.port,
  mountpoint: ntrip.mountpoint,
  username: ntrip.username,
  password,
  version: ntrip.version,
  sendGga: ntrip.sendGga,
  ggaIntervalSec: ntrip.ggaIntervalSec,
});

const canStartNtrip = (ntrip: NtripSettingsType) => ntrip.enabled && ntrip.host !== '' && ntrip.mountpoint !== '';

/** NTRIPがONで設定がそろっていれば接続し、そうでなければ止める */
export const startNtripIfEnabled = async (ntrip: NtripSettingsType, password: string) => {
  if (canStartNtrip(ntrip)) {
    await GnssReceiver.startNtrip(toConnectionConfig(ntrip, password));
  } else {
    await GnssReceiver.stopNtrip();
  }
};

/** 自動再接続のために覚えておくUSB機器。抜き差しでdeviceIdは変わるので機種（VID/PID）で照合する */
export const usbDeviceToRemember = (device: GnssReceiver.UsbDeviceInfo): ExternalGnssDeviceType => ({
  type: 'usb',
  vendorId: device.vendorId,
  productId: device.productId,
  name: device.name,
});

export const findRememberedUsbDevice = (
  remembered: ExternalGnssDeviceType,
  devices: GnssReceiver.UsbDeviceInfo[]
): GnssReceiver.UsbDeviceInfo | undefined =>
  remembered.type === 'usb'
    ? devices.find((d) => d.vendorId === remembered.vendorId && d.productId === remembered.productId)
    : undefined;
