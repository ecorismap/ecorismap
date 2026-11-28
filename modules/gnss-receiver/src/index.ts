import { NativeModule, requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

export type GnssLinkState = 'disconnected' | 'connecting' | 'connected';
export type NtripState = 'off' | 'connecting' | 'connected' | 'error';

export type RawLogState = 'off' | 'recording' | 'error';

/** RAW記録（後処理用）の状態。記録中はネイティブが1秒ごとに状態を通知する */
export type RawLogStatus = {
  state: RawLogState;
  error: string | null;
  baseName: string | null;
  /** 記録を始めた時刻（epoch ms。記録していなければ0） */
  startedAt: number;
  roverBytes: number;
  correctionBytes: number;
  /** UBXの同期バイトを見た（u-bloxのRAWが届いている見込みが高い） */
  sawUbx: boolean;
};

/** RAW記録を止めたときに残ったファイル */
export type RawLogResult = {
  baseName: string;
  roverPath: string;
  correctionPath: string | null;
  roverBytes: number;
  correctionBytes: number;
  sawUbx: boolean;
  startedAt: number;
  endedAt: number;
};

export type GnssReceiverStatus = {
  link: GnssLinkState;
  linkName: string | null;
  linkError: string | null;
  ntrip: NtripState;
  ntripError: string | null;
  /** 受信機へ中継した補正の累計バイト数 */
  rtcmBytes: number;
  /** 最後に補正を受け取った時刻（epoch ms。未受信は0） */
  lastCorrectionAt: number;
  /** ネイティブは常に送る。テストや旧版のネイティブでは無いことがあるので省略可能にしておく */
  rawLog?: RawLogStatus;
};

export type UsbDeviceInfo = {
  deviceId: number;
  name: string;
  vendorId: number;
  productId: number;
  hasPermission: boolean;
};

export type NtripConnectionConfig = {
  host: string;
  port: number;
  mountpoint: string;
  username: string;
  password: string;
  version: 'v1' | 'v2';
  sendGga: boolean;
  ggaIntervalSec: number;
};

export type NmeaEvent = { sentences: string[]; receivedAt: number };

export type UsbAttachedEvent = { deviceId: number; vendorId: number; productId: number };

export type BleDeviceInfo = {
  address: string;
  name: string;
  rssi: number;
  /** 広告にNordic UART Serviceが含まれていた（受信機である見込みが高い） */
  hasNus: boolean;
};

/** ペアリング済みのBluetoothクラシック機器（Androidのみ） */
export type SppDeviceInfo = {
  address: string;
  name: string;
};

/** BLEの権限の状態（iOS）。確かめるだけでダイアログは出さない */
export type BleAuthorization = 'allowed' | 'denied' | 'notDetermined';

type GnssReceiverEvents = {
  onNmea: (event: NmeaEvent) => void;
  onStatus: (status: GnssReceiverStatus) => void;
  onBleDevice: (device: BleDeviceInfo) => void;
  onUsbAttached: (device: UsbAttachedEvent) => void;
};

declare class GnssReceiverNative extends NativeModule<GnssReceiverEvents> {
  getStatus(): GnssReceiverStatus;
  listUsbDevices(): UsbDeviceInfo[];
  connectUsb(deviceId: number, baudRate: number): Promise<GnssReceiverStatus>;
  /** Androidは同期、iOSは権限ダイアログへの応答を待つので非同期 */
  startBleScan(): void | Promise<void>;
  stopBleScan(): void;
  connectBle(address: string): Promise<GnssReceiverStatus>;
  /** Androidのみ */
  listSppDevices(): SppDeviceInfo[];
  /** Androidのみ */
  connectSpp(address: string): Promise<GnssReceiverStatus>;
  disconnect(): Promise<void>;
  startRawLog(dirPath: string, baseName: string, logCorrections: boolean): Promise<GnssReceiverStatus>;
  stopRawLog(): Promise<RawLogResult | null>;
  startNtrip(config: NtripConnectionConfig): Promise<void>;
  stopNtrip(): Promise<void>;
  getSourceTable(config: Omit<NtripConnectionConfig, 'mountpoint'> & { mountpoint?: string }): Promise<string>;
  /** iOSのみ */
  getBleAuthorization(): BleAuthorization;
}

const native = requireOptionalNativeModule<GnssReceiverNative>('GnssReceiver');

/** ネイティブモジュールが使えるか（Web・テスト環境ではfalse） */
export const isGnssReceiverAvailable = (): boolean => native !== null;

const requireNative = (): GnssReceiverNative => {
  if (native === null) throw new Error('GnssReceiver native module is not available');
  return native;
};

export const getStatus = (): GnssReceiverStatus => requireNative().getStatus();
export const listUsbDevices = (): UsbDeviceInfo[] => requireNative().listUsbDevices();
export const connectUsb = (deviceId: number, baudRate: number) => requireNative().connectUsb(deviceId, baudRate);
export const startBleScan = async () => requireNative().startBleScan();
export const stopBleScan = () => requireNative().stopBleScan();
export const connectBle = (address: string) => requireNative().connectBle(address);
export const listSppDevices = (): SppDeviceInfo[] => requireNative().listSppDevices();
export const connectSpp = (address: string) => requireNative().connectSpp(address);
export const startRawLog = (dirPath: string, baseName: string, logCorrections: boolean) =>
  requireNative().startRawLog(dirPath, baseName, logCorrections);
export const stopRawLog = () => requireNative().stopRawLog();
export const disconnect = () => requireNative().disconnect();
export const startNtrip = (config: NtripConnectionConfig) => requireNative().startNtrip(config);
export const stopNtrip = () => requireNative().stopNtrip();
export const getSourceTable = (config: NtripConnectionConfig) => requireNative().getSourceTable(config);
export const getBleAuthorization = (): BleAuthorization => requireNative().getBleAuthorization();

export const addNmeaListener = (listener: (event: NmeaEvent) => void): EventSubscription =>
  requireNative().addListener('onNmea', listener);

export const addStatusListener = (listener: (status: GnssReceiverStatus) => void): EventSubscription =>
  requireNative().addListener('onStatus', listener);

export const addBleDeviceListener = (listener: (device: BleDeviceInfo) => void): EventSubscription =>
  requireNative().addListener('onBleDevice', listener);

export const addUsbAttachedListener = (listener: (device: UsbAttachedEvent) => void): EventSubscription =>
  requireNative().addListener('onUsbAttached', listener);
