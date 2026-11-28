import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as GnssReceiver from '../../modules/gnss-receiver/src';
import { getExternalGnssSnapshot, subscribeExternalGnss, ExternalGnssSnapshot } from '../lib/gnss/externalGnssStore';
import { DEFAULT_EXTERNAL_GNSS_SETTINGS, loadNtripPassword, saveNtripPassword } from '../lib/gnss/settings';
import { NtripMountpoint, parseSourceTable } from '../lib/gnss/sourceTable';
import { hasBlePermissions, requestBlePermissions } from '../lib/gnss/blePermissions';
import {
  isSppSupported,
  isUsbSupported,
  startNtripIfEnabled,
  toConnectionConfig,
  usbDeviceToRemember,
} from '../lib/gnss/connection';
import { editSettingsAction } from '../modules/settings';
import { RootState } from '../store';
import { ExportResultType, ExternalGnssSettingsType, NtripSettingsType } from '../types';
import * as RawLog from '../lib/gnss/rawLog';
import { RawLogEntry } from '../lib/gnss/rawLog';

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
  sppDevices: GnssReceiver.SppDeviceInfo[];
  refreshSppDevices: () => Promise<void>;
  connectSpp: (address: string) => Promise<void>;
  disconnect: () => Promise<void>;
  rawLogs: RawLogEntry[];
  refreshRawLogs: () => Promise<void>;
  startRawLog: () => Promise<void>;
  stopRawLog: () => Promise<void>;
  deleteRawLog: (entry: RawLogEntry) => Promise<void>;
  shareRawLog: (entry: RawLogEntry) => Promise<ExportResultType>;
  setRawLogCorrections: (enabled: boolean) => void;
  updateReceiverSettings: (
    values: Pick<ExternalGnssSettingsType, 'antennaHeight' | 'baudRate' | 'trackMode' | 'trackDistance'>
  ) => void;
  saveNtripSettings: (ntrip: NtripSettingsType, password: string) => Promise<void>;
  setNtripEnabled: (enabled: boolean) => Promise<void>;
  fetchMountpoints: (ntrip: NtripSettingsType, password: string) => Promise<NtripMountpoint[]>;
};

// BLEのスキャンと同じ長さ（ネイティブ側で自動停止する）
const BLE_SCAN_DURATION_MS = 15_000;

export const useExternalGnss = (): UseExternalGnssReturnType => {
  const dispatch = useDispatch();
  const isAvailable = GnssReceiver.isGnssReceiverAvailable();
  const snapshot = useSyncExternalStore(subscribeExternalGnss, getExternalGnssSnapshot);
  const settings = useSelector((state: RootState) => state.settings.externalGnss ?? DEFAULT_EXTERNAL_GNSS_SETTINGS);
  const [ntripPassword, setNtripPassword] = useState('');
  const [usbDevices, setUsbDevices] = useState<GnssReceiver.UsbDeviceInfo[]>([]);
  const [bleDevices, setBleDevices] = useState<GnssReceiver.BleDeviceInfo[]>([]);
  const [isBleScanning, setIsBleScanning] = useState(false);
  const [sppDevices, setSppDevices] = useState<GnssReceiver.SppDeviceInfo[]>([]);
  const [rawLogs, setRawLogs] = useState<RawLogEntry[]>([]);

  const refreshUsbDevices = useCallback(() => {
    if (!isAvailable || !isUsbSupported) return;
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

  const connectUsb = useCallback(
    async (deviceId: number) => {
      await GnssReceiver.connectUsb(deviceId, settings.baudRate);
      refreshUsbDevices();
      // 次回からはこの受信機に自動で接続し直す
      const device = GnssReceiver.listUsbDevices().find((d) => d.deviceId === deviceId);
      if (device) saveSettings({ ...settings, lastDevice: usbDeviceToRemember(device), autoConnect: true });
      // 受信機をつなぐたびにNTRIPも張り直す（前回ONなら自動で再開）
      await startNtripIfEnabled(settings.ntrip, ntripPassword);
    },
    [ntripPassword, refreshUsbDevices, saveSettings, settings]
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
    // iOSは初回に権限ダイアログへの応答を待つ（拒否・Bluetoothオフならここで失敗する）
    await GnssReceiver.startBleScan();
    setIsBleScanning(true);
  }, []);

  const connectBle = useCallback(
    async (address: string) => {
      setIsBleScanning(false);
      await GnssReceiver.connectBle(address);
      const name = bleDevices.find((d) => d.address === address)?.name ?? address;
      saveSettings({ ...settings, lastDevice: { type: 'ble', address, name }, autoConnect: true });
      await startNtripIfEnabled(settings.ntrip, ntripPassword);
    },
    [bleDevices, ntripPassword, saveSettings, settings]
  );

  // ペアリング済みの機器を読む。BLUETOOTH_CONNECTが要るので、画面を開いただけでは読まず「更新」で読む
  const refreshSppDevices = useCallback(async () => {
    if (!isAvailable || !isSppSupported) return;
    if (!(await requestBlePermissions())) throw new Error('Bluetooth permission denied');
    setSppDevices(GnssReceiver.listSppDevices());
  }, [isAvailable]);

  // 権限が既にあれば、画面を開いたときに一覧を出しておく
  useEffect(() => {
    if (!isAvailable || !isSppSupported) return;
    hasBlePermissions().then((granted) => {
      if (!granted) return;
      try {
        setSppDevices(GnssReceiver.listSppDevices());
      } catch (e) {
        // Bluetoothがオフ等。「更新」を押したときに知らせる
        console.log('[gnss] list spp devices failed', e);
      }
    });
  }, [isAvailable]);

  const connectSpp = useCallback(
    async (address: string) => {
      setIsBleScanning(false);
      await GnssReceiver.connectSpp(address);
      const name = sppDevices.find((d) => d.address === address)?.name ?? address;
      saveSettings({ ...settings, lastDevice: { type: 'spp', address, name }, autoConnect: true });
      await startNtripIfEnabled(settings.ntrip, ntripPassword);
    },
    [ntripPassword, saveSettings, settings, sppDevices]
  );

  const refreshRawLogs = useCallback(async () => {
    if (!isAvailable) return;
    try {
      setRawLogs(await RawLog.listRawLogs());
    } catch (e) {
      console.log('[gnss] list raw logs failed', e);
    }
  }, [isAvailable]);

  useEffect(() => {
    refreshRawLogs();
  }, [refreshRawLogs]);

  // 記録が終わった（停止・書き込みエラー）ら一覧を読み直す
  const rawLogState = snapshot.status.rawLog?.state ?? 'off';
  useEffect(() => {
    if (rawLogState !== 'recording') refreshRawLogs();
  }, [rawLogState, refreshRawLogs]);

  const startRawLog = useCallback(async () => {
    const baseName = RawLog.makeRawLogBaseName(new Date(), snapshot.status.linkName);
    const logCorrections = settings.rawLogCorrections ?? true;
    // 記録の情報は先に書く（記録中にアプリが落ちても、アンテナ高などが残るように）
    await RawLog.writeRawLogMeta(baseName, {
      startedAt: Date.now(),
      endedAt: null,
      receiver: snapshot.status.linkName,
      connection: settings.lastDevice?.type ?? null,
      antennaHeight: settings.antennaHeight,
      ntrip:
        logCorrections && settings.ntrip.enabled && settings.ntrip.host !== ''
          ? { host: settings.ntrip.host, mountpoint: settings.ntrip.mountpoint }
          : null,
    });
    await GnssReceiver.startRawLog(RawLog.RAW_LOG_DIR, baseName, logCorrections);
  }, [settings, snapshot.status.linkName]);

  const stopRawLog = useCallback(async () => {
    const result = await GnssReceiver.stopRawLog();
    if (result !== null) {
      await RawLog.finishRawLogMeta(result.baseName, {
        endedAt: result.endedAt,
        roverBytes: result.roverBytes,
        correctionBytes: result.correctionBytes,
        sawUbx: result.sawUbx,
      });
    }
    await refreshRawLogs();
  }, [refreshRawLogs]);

  const deleteRawLog = useCallback(
    async (entry: RawLogEntry) => {
      await RawLog.deleteRawLog(entry);
      await refreshRawLogs();
    },
    [refreshRawLogs]
  );

  const shareRawLog = useCallback((entry: RawLogEntry) => RawLog.shareRawLog(entry), []);

  const setRawLogCorrections = useCallback(
    (enabled: boolean) => saveSettings({ ...settings, rawLogCorrections: enabled }),
    [saveSettings, settings]
  );

  // 自分で切断したら、次に挿したり起動したりしても自動では接続し直さない。RAW記録もここで終える
  const disconnect = useCallback(async () => {
    if (snapshot.status.rawLog?.state === 'recording') await stopRawLog();
    saveSettings({ ...settings, autoConnect: false });
    await GnssReceiver.stopNtrip();
    await GnssReceiver.disconnect();
  }, [saveSettings, settings, snapshot.status.rawLog?.state, stopRawLog]);

  const updateReceiverSettings = useCallback(
    (values: Pick<ExternalGnssSettingsType, 'antennaHeight' | 'baudRate' | 'trackMode' | 'trackDistance'>) =>
      saveSettings({ ...settings, ...values }),
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
    [saveSettings, settings, snapshot.status.link, snapshot.status.ntrip]
  );

  const setNtripEnabled = useCallback(
    async (enabled: boolean) => {
      const ntrip = { ...settings.ntrip, enabled };
      saveSettings({ ...settings, ntrip });
      await startNtripIfEnabled(ntrip, ntripPassword);
    },
    [ntripPassword, saveSettings, settings]
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
    sppDevices,
    refreshSppDevices,
    connectSpp,
    disconnect,
    rawLogs,
    refreshRawLogs,
    startRawLog,
    stopRawLog,
    deleteRawLog,
    shareRawLog,
    setRawLogCorrections,
    updateReceiverSettings,
    saveNtripSettings,
    setNtripEnabled,
    fetchMountpoints,
  };
};
