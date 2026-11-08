import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSelector } from 'react-redux';
import * as GnssReceiver from '../../modules/gnss-receiver/src';
import { getExternalGnssSnapshot } from '../lib/gnss/externalGnssStore';
import { hasBlePermissions } from '../lib/gnss/blePermissions';
import { findRememberedUsbDevice, startNtripIfEnabled } from '../lib/gnss/connection';
import { loadNtripPassword } from '../lib/gnss/settings';
import { RootState } from '../store';
import { ExternalGnssSettingsType } from '../types';

/**
 * 最後に接続した外部GNSS受信機へ自動で接続し直す（NTRIPがONならそれも）。
 * アプリの起動時・前面に戻ったとき・USBを挿したときに試す。「切断」で自分で切った後は試さない。
 */
export const useExternalGnssAutoConnect = () => {
  const settings = useSelector((state: RootState) => state.settings.externalGnss);
  const settingsRef = useRef<ExternalGnssSettingsType | undefined>(settings);
  settingsRef.current = settings;
  const inFlightRef = useRef(false);
  // USBの使用許可ダイアログは、拒否されても起動のたびに出続けないよう1回の起動につき1度だけにする
  const usbPermissionAskedRef = useRef(false);

  const tryConnect = useCallback(async () => {
    const current = settingsRef.current;
    const device = current?.lastDevice;
    if (!GnssReceiver.isGnssReceiverAvailable() || current === undefined || !current.autoConnect || !device) return;
    if (inFlightRef.current || getExternalGnssSnapshot().status.link !== 'disconnected') return;
    inFlightRef.current = true;
    try {
      if (device.type === 'usb') {
        const usb = findRememberedUsbDevice(device, GnssReceiver.listUsbDevices());
        if (!usb) return;
        if (!usb.hasPermission) {
          if (usbPermissionAskedRef.current) return;
          usbPermissionAskedRef.current = true;
        }
        await GnssReceiver.connectUsb(usb.deviceId, current.baudRate);
      } else {
        // 権限ダイアログは設定画面で手動接続したときだけ出す
        if (!(await hasBlePermissions())) return;
        await GnssReceiver.connectBle(device.address);
      }
      await startNtripIfEnabled(current.ntrip, await loadNtripPassword());
    } catch (e) {
      // 受信機の電源が入っていない・ケーブルが抜けている等。次のきっかけでまた試す
      console.log('[gnss] auto connect failed', e);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!GnssReceiver.isGnssReceiverAvailable()) return;
    tryConnect();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryConnect();
    });
    const usbAttached = GnssReceiver.addUsbAttachedListener(() => {
      // 挿したら許可ダイアログをもう一度出してよい
      usbPermissionAskedRef.current = false;
      tryConnect();
    });
    return () => {
      appState.remove();
      usbAttached.remove();
    };
  }, [tryConnect]);
};
