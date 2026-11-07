import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as GnssReceiver from '../../modules/gnss-receiver/src';
import { getExternalGnssSnapshot, subscribeExternalGnss, ExternalGnssSnapshot } from '../lib/gnss/externalGnssStore';
import { DEFAULT_EXTERNAL_GNSS_SETTINGS, loadNtripPassword, saveNtripPassword } from '../lib/gnss/settings';
import { NtripMountpoint, parseSourceTable } from '../lib/gnss/sourceTable';
import { requestBlePermissions } from '../lib/gnss/blePermissions';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { ExternalGnssSettingsType, NtripSettingsType } from '../types';

export type UseExternalGnssReturnType = {
  isAvailable: boolean;
  snapshot: ExternalGnssSnapshot;
  settings: ExternalGnssSettingsType;
  ntripPassword: string;
  usbDevices: GnssReceiver.UsbDeviceInfo[];
  refreshUsbDevices: () => void;
  connectUsb: (deviceId: number) => Promise<void>;
  bleDevices: GnssReceiver.BleDeviceInfo[];
  isBleScanning: boolean;
  scanBle: () => Promise<void>;
  connectBle: (address: string) => Promise<void>;
  disconnect: () => Promise<void>;
  updateReceiverSettings: (values: Pick<ExternalGnssSettingsType, 'antennaHeight' | 'baudRate' | 'trackMode' | 'trackDistance'>) => void;
  saveNtripSettings: (ntrip: NtripSettingsType, password: string) => Promise<void>;
  setNtripEnabled: (enabled: boolean) => Promise<void>;
  fetchMountpoints: (ntrip: NtripSettingsType, password: string) => Promise<NtripMountpoint[]>;
};

const toConnectionConfig = (ntrip: NtripSettingsType, password: string): GnssReceiver.NtripConnectionConfig => ({
  host: ntrip.host,
  port: ntrip.port,
  mountpoint: ntrip.mountpoint,
  username: ntrip.username,
  password,
  version: ntrip.version,
  sendGga: ntrip.sendGga,
  ggaIntervalSec: ntrip.ggaIntervalSec,
});

// BLEのスキャンと同じ長さ（ネイティブ側で自動停止する）
const BLE_SCAN_DURATION_MS = 15_000;

const canStartNtrip = (ntrip: NtripSettingsType) => ntrip.enabled && ntrip.host !== '' && ntrip.mountpoint !== '';

export const useExternalGnss = (): UseExternalGnssReturnType => {
  const dispatch = useDispatch();
  const isAvailable = GnssReceiver.isGnssReceiverAvailable();
  const snapshot = useSyncExternalStore(subscribeExternalGnss, getExternalGnssSnapshot);
  const settings = useSelector((state: RootState) => state.settings.externalGnss ?? DEFAULT_EXTERNAL_GNSS_SETTINGS);
  const [ntripPassword, setNtripPassword] = useState('');
  const [usbDevices, setUsbDevices] = useState<GnssReceiver.UsbDeviceInfo[]>([]);
  const [bleDevices, setBleDevices] = useState<GnssReceiver.BleDeviceInfo[]>([]);
  const [isBleScanning, setIsBleScanning] = useState(false);

  const refreshUsbDevices = useCallback(() => {
    if (!isAvailable) return;
    setUsbDevices(GnssReceiver.listUsbDevices());
  }, [isAvailable]);

  useEffect(() => {
    refreshUsbDevices();
    loadNtripPassword().then(setNtripPassword);
  }, [refreshUsbDevices]);

  const saveSettings = useCallback(
    (next: ExternalGnssSettingsType) => dispatch(editSettingsAction({ externalGnss: next })),
    [dispatch]
  );

  const startNtripIfEnabled = useCallback(async (ntrip: NtripSettingsType, password: string) => {
    if (canStartNtrip(ntrip)) {
      await GnssReceiver.startNtrip(toConnectionConfig(ntrip, password));
    } else {
      await GnssReceiver.stopNtrip();
    }
  }, []);

  const connectUsb = useCallback(
    async (deviceId: number) => {
      await GnssReceiver.connectUsb(deviceId, settings.baudRate);
      refreshUsbDevices();
      // 受信機をつなぐたびにNTRIPも張り直す（前回ONなら自動で再開）
      await startNtripIfEnabled(settings.ntrip, ntripPassword);
    },
    [ntripPassword, refreshUsbDevices, settings.baudRate, settings.ntrip, startNtripIfEnabled]
  );

  // 見つかった機器を、NUSを広告しているもの（受信機らしいもの）→電波の強い順に並べる
  useEffect(() => {
    if (!isAvailable) return;
    const subscription = GnssReceiver.addBleDeviceListener((device) =>
      setBleDevices((prev) =>
        [...prev.filter((d) => d.address !== device.address), device].sort(
          (a, b) => Number(b.hasNus) - Number(a.hasNus) || b.rssi - a.rssi
        )
      )
    );
    return () => {
      subscription.remove();
      GnssReceiver.stopBleScan();
    };
  }, [isAvailable]);

  useEffect(() => {
    if (!isBleScanning) return;
    const timer = setTimeout(() => setIsBleScanning(false), BLE_SCAN_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isBleScanning]);

  const scanBle = useCallback(async () => {
    if (!(await requestBlePermissions())) throw new Error('Bluetooth permission denied');
    setBleDevices([]);
    GnssReceiver.startBleScan();
    setIsBleScanning(true);
  }, []);

  const connectBle = useCallback(
    async (address: string) => {
      setIsBleScanning(false);
      await GnssReceiver.connectBle(address);
      await startNtripIfEnabled(settings.ntrip, ntripPassword);
    },
    [ntripPassword, settings.ntrip, startNtripIfEnabled]
  );

  const disconnect = useCallback(async () => {
    await GnssReceiver.stopNtrip();
    await GnssReceiver.disconnect();
  }, []);

  const updateReceiverSettings = useCallback(
    (values: Pick<ExternalGnssSettingsType, 'antennaHeight' | 'baudRate' | 'trackMode' | 'trackDistance'>) => saveSettings({ ...settings, ...values }),
    [saveSettings, settings]
  );

  const saveNtripSettings = useCallback(
    async (ntrip: NtripSettingsType, password: string) => {
      saveSettings({ ...settings, ntrip });
      await saveNtripPassword(password);
      setNtripPassword(password);
      if (snapshot.status.link === 'connected' || snapshot.status.ntrip !== 'off') {
        await startNtripIfEnabled(ntrip, password);
      }
    },
    [saveSettings, settings, snapshot.status.link, snapshot.status.ntrip, startNtripIfEnabled]
  );

  const setNtripEnabled = useCallback(
    async (enabled: boolean) => {
      const ntrip = { ...settings.ntrip, enabled };
      saveSettings({ ...settings, ntrip });
      await startNtripIfEnabled(ntrip, ntripPassword);
    },
    [ntripPassword, saveSettings, settings, startNtripIfEnabled]
  );

  const fetchMountpoints = useCallback(async (ntrip: NtripSettingsType, password: string) => {
    const text = await GnssReceiver.getSourceTable(toConnectionConfig(ntrip, password));
    return parseSourceTable(text);
  }, []);

  return {
    isAvailable,
    snapshot,
    settings,
    ntripPassword,
    usbDevices,
    refreshUsbDevices,
    connectUsb,
    bleDevices,
    isBleScanning,
    scanBle,
    connectBle,
    disconnect,
    updateReceiverSettings,
    saveNtripSettings,
    setNtripEnabled,
    fetchMountpoints,
  };
};
