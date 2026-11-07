import {
  addNmeaListener,
  addStatusListener,
  getStatus,
  GnssReceiverStatus,
  isGnssReceiverAvailable,
} from '../../../modules/gnss-receiver/src';
import { GnssFix, NmeaFixAssembler } from './nmea';
import { isUsableFix } from './toLocation';

/** 外部受信機の位置がこれだけ途絶えたら内蔵GPSへ戻す */
export const EXTERNAL_FIX_STALE_MS = 5000;

const INITIAL_STATUS: GnssReceiverStatus = {
  link: 'disconnected',
  linkName: null,
  linkError: null,
  ntrip: 'off',
  ntripError: null,
  rtcmBytes: 0,
  lastCorrectionAt: 0,
};

export type ExternalGnssSnapshot = { status: GnssReceiverStatus; fix: GnssFix | null };

type FixListener = (fix: GnssFix) => void;

/**
 * 外部GNSS受信機の状態と最新の測位結果を、画面やフックの寿命と無関係に1か所で持つ。
 * ネイティブのイベント購読はプロセスで1回だけ張る。
 */
let snapshot: ExternalGnssSnapshot = { status: INITIAL_STATUS, fix: null };
const snapshotListeners = new Set<() => void>();
const fixListeners = new Set<FixListener>();
const assembler = new NmeaFixAssembler();
let attached = false;

const setSnapshot = (next: ExternalGnssSnapshot) => {
  snapshot = next;
  snapshotListeners.forEach((l) => l());
};

/** ネイティブからのNMEA文を流し込む（テストや疑似入力からも使える） */
export const feedNmeaSentences = (sentences: string[], receivedAt: number) => {
  for (const sentence of sentences) {
    const fix = assembler.feed(sentence, receivedAt);
    if (fix === null) continue;
    setSnapshot({ ...snapshot, fix });
    fixListeners.forEach((l) => l(fix));
  }
};

const ensureAttached = () => {
  if (attached || !isGnssReceiverAvailable()) return;
  attached = true;
  addNmeaListener(({ sentences, receivedAt }) => feedNmeaSentences(sentences, receivedAt));
  addStatusListener((status) => {
    // 切断したら古い位置を残さない（再接続直後に前回の位置で記録しないように）
    setSnapshot({ status, fix: status.link === 'connected' ? snapshot.fix : null });
  });
  setSnapshot({ ...snapshot, status: getStatus() });
};

export const getExternalGnssSnapshot = (): ExternalGnssSnapshot => snapshot;

export const subscribeExternalGnss = (listener: () => void): (() => void) => {
  ensureAttached();
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
};

/** 全エポックを受け取る（平均化測位や位置の合流に使う） */
export const subscribeExternalFix = (listener: FixListener): (() => void) => {
  ensureAttached();
  fixListeners.add(listener);
  return () => {
    fixListeners.delete(listener);
  };
};

/** 外部受信機が接続中で、使える新しい位置を出し続けているか */
export const isExternalFixActive = (now: number = Date.now(), current: ExternalGnssSnapshot = snapshot): boolean =>
  current.status.link === 'connected' &&
  current.fix !== null &&
  isUsableFix(current.fix) &&
  now - current.fix.receivedAt <= EXTERNAL_FIX_STALE_MS;

/** 使える最新の位置。途絶・未接続ならnull */
export const getActiveExternalFix = (now: number = Date.now()): GnssFix | null =>
  isExternalFixActive(now) ? snapshot.fix : null;

/** テスト用: 状態を初期化する */
export const resetExternalGnssForTest = (status: Partial<GnssReceiverStatus> = {}) => {
  snapshot = { status: { ...INITIAL_STATUS, ...status }, fix: null };
};
