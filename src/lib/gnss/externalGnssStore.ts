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

/**
 * fix は表示用の最新エポック（品質0もそのまま入る）。
 * lastUsableFix は最後に使えた（品質0以外の）エポックで、内蔵GPSへ戻すかどうかの判定と位置の取得に使う。
 * 受信機によっては途切れの間も座標入りで品質0のGGAを出すため、最新エポックだけで判定すると
 * 1エポックの品質0で即座に内蔵GPSへ切り替わってしまう。
 */
export type ExternalGnssSnapshot = { status: GnssReceiverStatus; fix: GnssFix | null; lastUsableFix: GnssFix | null };

type FixListener = (fix: GnssFix) => void;

/**
 * 外部GNSS受信機の状態と最新の測位結果を、画面やフックの寿命と無関係に1か所で持つ。
 * ネイティブのイベント購読はプロセスで1回だけ張る。
 */
let snapshot: ExternalGnssSnapshot = { status: INITIAL_STATUS, fix: null, lastUsableFix: null };
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
    setSnapshot({ ...snapshot, fix, lastUsableFix: isUsableFix(fix) ? fix : snapshot.lastUsableFix });
    fixListeners.forEach((l) => l(fix));
  }
};

const ensureAttached = () => {
  if (attached || !isGnssReceiverAvailable()) return;
  attached = true;
  addNmeaListener(({ sentences, receivedAt }) => feedNmeaSentences(sentences, receivedAt));
  addStatusListener((status) => {
    // 切断したら古い位置を残さない（再接続直後に前回の位置で記録しないように）
    const connected = status.link === 'connected';
    setSnapshot({
      status,
      fix: connected ? snapshot.fix : null,
      lastUsableFix: connected ? snapshot.lastUsableFix : null,
    });
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

/**
 * 外部受信機が接続中で、使える位置を出し続けているか。
 * 品質0のエポックを挟んでも、最後に使えた位置から EXTERNAL_FIX_STALE_MS 以内なら使い続ける
 */
export const isExternalFixActive = (now: number = Date.now(), current: ExternalGnssSnapshot = snapshot): boolean =>
  current.status.link === 'connected' &&
  current.lastUsableFix !== null &&
  now - current.lastUsableFix.receivedAt <= EXTERNAL_FIX_STALE_MS;

/** 最後に使えた位置（途絶判定込み）。途絶・未接続ならnull */
export const getActiveExternalFix = (now: number = Date.now()): GnssFix | null =>
  isExternalFixActive(now) ? snapshot.lastUsableFix : null;

/**
 * 外部受信機由来の位置（gnss付き）で、受信機がもう使える位置を出していないなら捨てる。
 * 切断・途絶の後も useLocation の現在地は、内蔵GPSの次の更新（distanceFilter分動くまで来ない）まで
 * 最後の外部位置のまま残るため、それをポイント追加に使うと偽りの品質・楕円体高・古い時刻で保存される
 */
export const dropInactiveExternalLocation = <T extends { latitude: number; longitude: number; gnss?: unknown }>(
  location: T | null | undefined,
  now: number = Date.now()
): T | undefined => {
  if (location === null || location === undefined) return undefined;
  if (location.gnss !== undefined && !isExternalFixActive(now)) return undefined;
  return location;
};

/** テスト用: 状態を初期化する */
export const resetExternalGnssForTest = (status: Partial<GnssReceiverStatus> = {}) => {
  snapshot = { status: { ...INITIAL_STATUS, ...status }, fix: null, lastUsableFix: null };
};
