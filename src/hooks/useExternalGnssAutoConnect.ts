import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSelector } from 'react-redux';
import * as GnssReceiver from '../../modules/gnss-receiver/src';
import { getExternalGnssSnapshot, subscribeExternalGnss } from '../lib/gnss/externalGnssStore';
import { hasBlePermissions } from '../lib/gnss/blePermissions';
import { canStartNtrip, findRememberedUsbDevice, isSppSupported, startNtripIfEnabled } from '../lib/gnss/connection';
import {
  getReconnectDelayMs,
  isLinkLostByError,
  RECONNECT_STABLE_MS,
  shouldApplyNtripOnConnect,
  shouldGiveUpReconnect,
  shouldReleaseInBackground,
} from '../lib/gnss/autoReconnect';
import { loadNtripPassword } from '../lib/gnss/settings';
import { RootState } from '../store';
import { ExternalGnssSettingsType } from '../types';

/**
 * connected: つながった。retry: 今回は失敗した・ほかの接続処理の途中なので、あとでまた試す。
 * unavailable: 試しても無駄（自動接続OFF・受信機を覚えていない・USBが挿さっていない・権限がない等）
 */
export type AutoConnectResult = 'connected' | 'retry' | 'unavailable';

type LinkLostEpisode = { lostAt: number; attempt: number };

/**
 * 最後に接続した外部GNSS受信機へ自動で接続し直す（NTRIPがONならそれも）。
 * - アプリの起動時・前面に戻ったとき・USBを挿したとき・GPSのONか記録開始のときに1回試す。
 * - GPSがONか記録中にリンクがエラーで切れたら、間隔を伸ばしながら試し続ける（T-L7）。AppStateは条件にしない。
 *   つながっても RECONNECT_STABLE_MS 続くまでは切断のエピソードを持ち続け、すぐ切れたら待ち時間の段階と
 *   30分の起点を引き継ぐ（つながってはすぐ切れるリンクで、5秒おきの再接続が際限なく続かないように）。
 * - GPSがOFFで記録もしていないままバックグラウンドへ移ったら、受信機とNTRIPを切り離す（T-M6）。
 *   前面に戻ったときの試行でつなぎ直す。
 * 「切断」で自分で切った後（autoConnectがOFF）はどれも試さない。
 */
export const useExternalGnssAutoConnect = (isLocationInUse: boolean) => {
  const settings = useSelector((state: RootState) => state.settings.externalGnss);
  const settingsRef = useRef<ExternalGnssSettingsType | undefined>(settings);
  settingsRef.current = settings;
  const inUseRef = useRef(isLocationInUse);
  inUseRef.current = isLocationInUse;
  const inFlightRef = useRef(false);
  // USBの使用許可ダイアログは、拒否されても起動のたびに出続けないよう1回の起動につき1度だけにする
  const usbPermissionAskedRef = useRef(false);
  // エラーで切れてから、つながって RECONNECT_STABLE_MS 続くまでの間だけ値を持つ
  const lostRef = useRef<LinkLostEpisode | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelStable = useCallback(() => {
    if (stableTimerRef.current !== null) {
      clearTimeout(stableTimerRef.current);
      stableTimerRef.current = null;
    }
  }, []);

  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  /** 位置を使っていないのにバックグラウンドにいるなら、受信機とNTRIPを切り離す（T-M6） */
  const releaseIfIdleInBackground = useCallback(async () => {
    const current = settingsRef.current;
    const release = shouldReleaseInBackground({
      appState: AppState.currentState,
      inUse: inUseRef.current,
      canAutoConnect: current?.autoConnect === true && current.lastDevice !== undefined,
      status: getExternalGnssSnapshot().status,
    });
    if (!release) return;
    cancelRetry();
    try {
      // 切断（detachLink）は linkError を空にするので、再接続のきっかけ（T-L7）にはならない
      await GnssReceiver.stopNtrip();
      await GnssReceiver.disconnect();
    } catch (e) {
      console.log('[gnss] release in background failed', e);
    }
  }, [cancelRetry]);

  const tryConnect = useCallback(async (): Promise<AutoConnectResult> => {
    const current = settingsRef.current;
    const device = current?.lastDevice;
    if (!GnssReceiver.isGnssReceiverAvailable() || current === undefined || !current.autoConnect || !device) {
      return 'unavailable';
    }
    // 位置を使っていないバックグラウンドではつながない（前面に戻ったときにつなぐ）
    if (AppState.currentState === 'background' && !inUseRef.current) return 'unavailable';
    const link = getExternalGnssSnapshot().status.link;
    if (link === 'connected') return 'connected';
    if (inFlightRef.current || link !== 'disconnected') return 'retry';
    inFlightRef.current = true;
    try {
      if (device.type === 'usb') {
        const usb = findRememberedUsbDevice(device, GnssReceiver.listUsbDevices());
        // 抜かれている。挿されたら USB_DEVICE_ATTACHED のきっかけで試す
        if (!usb) return 'unavailable';
        if (!usb.hasPermission) {
          if (usbPermissionAskedRef.current) return 'unavailable';
          usbPermissionAskedRef.current = true;
        }
        await GnssReceiver.connectUsb(usb.deviceId, current.baudRate);
      } else {
        // 権限ダイアログは設定画面で手動接続したときだけ出す（SPPもBLUETOOTH_CONNECTが要る）
        if (!(await hasBlePermissions())) return 'unavailable';
        if (device.type === 'spp') {
          if (!isSppSupported) return 'unavailable';
          await GnssReceiver.connectSpp(device.address);
        } else {
          await GnssReceiver.connectBle(device.address);
        }
      }
      // NTRIP はリンクが切れても動き続けている（T-L10）。動いていれば張り直さず、キャスターへの再ログインを避ける
      if (shouldApplyNtripOnConnect(getExternalGnssSnapshot().status.ntrip, canStartNtrip(current.ntrip))) {
        await startNtripIfEnabled(current.ntrip, await loadNtripPassword());
      }
      return 'connected';
    } catch (e) {
      // 受信機の電源が入っていない・ケーブルが抜けている等。次のきっかけでまた試す
      console.log('[gnss] auto connect failed', e);
      return 'retry';
    } finally {
      inFlightRef.current = false;
      // つないでいる間にバックグラウンドへ移っていたら、ここで切り離す
      await releaseIfIdleInBackground();
    }
  }, [releaseIfIdleInBackground]);

  /** エラーで切れた後の再接続（T-L7）。GPSがONか記録中だけ、間隔を伸ばしながら試す */
  const scheduleRetry = useCallback(() => {
    cancelRetry();
    const episode = lostRef.current;
    if (episode === null || !inUseRef.current) return;
    if (shouldGiveUpReconnect(episode.lostAt, Date.now())) {
      // ここでやめる。前面復帰・USB装着・GPSのON・記録開始でまた試す
      console.log('[gnss] auto reconnect gave up');
      return;
    }
    retryTimerRef.current = setTimeout(async () => {
      retryTimerRef.current = null;
      if (lostRef.current !== episode || !inUseRef.current) return;
      const result = await tryConnect();
      if (lostRef.current !== episode) return;
      if (result === 'retry') {
        episode.attempt += 1;
        scheduleRetry();
      }
      // connected: エピソードは、つながったまま RECONNECT_STABLE_MS 続いたときに購読の側で終える。
      // unavailable は待っても変わらないので試さない（USBは挿されたとき、権限は設定画面で）
    }, getReconnectDelayMs(episode.attempt));
  }, [cancelRetry, tryConnect]);

  // 起動時・前面復帰・USB装着のきっかけ
  useEffect(() => {
    if (!GnssReceiver.isGnssReceiverAvailable()) return;
    tryConnect();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') tryConnect();
      else if (state === 'background') releaseIfIdleInBackground();
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
  }, [releaseIfIdleInBackground, tryConnect]);

  // リンクの切断・接続を見る
  useEffect(() => {
    if (!GnssReceiver.isGnssReceiverAvailable()) return;
    let prev = getExternalGnssSnapshot().status;
    const unsubscribe = subscribeExternalGnss(() => {
      const next = getExternalGnssSnapshot().status;
      const before = prev;
      prev = next;
      if (next.link === 'connected') {
        // 手動接続や前面復帰の試行でつながった場合も含め、予約した再接続はやめる。
        // エピソードは、つながったまま RECONNECT_STABLE_MS 続いてから終える
        const episode = lostRef.current;
        if (episode !== null) {
          cancelRetry();
          // 接続中の状態更新（NTRIPの受信量など）では待ちを延ばさない。切れたら cancelStable で外す
          if (stableTimerRef.current === null) {
            stableTimerRef.current = setTimeout(() => {
              stableTimerRef.current = null;
              if (lostRef.current === episode && getExternalGnssSnapshot().status.link === 'connected') {
                lostRef.current = null;
              }
            }, RECONNECT_STABLE_MS);
          }
        }
        return;
      }
      if (before.link === 'connected') cancelStable();
      if (isLinkLostByError(before, next) && settingsRef.current?.autoConnect === true) {
        const unstable = lostRef.current;
        if (unstable !== null) {
          // 安定しないうちにまた切れた。待ち時間の段階を進め、30分の起点は最初に切れた時刻のまま
          unstable.attempt += 1;
        } else {
          lostRef.current = { lostAt: Date.now(), attempt: 0 };
        }
        scheduleRetry();
      }
    });
    return () => {
      unsubscribe();
      cancelRetry();
      cancelStable();
    };
  }, [cancelRetry, cancelStable, scheduleRetry]);

  // GPSのON・記録開始で試す。OFFになったら、バックグラウンドにいれば切り離す
  const prevInUseRef = useRef(isLocationInUse);
  useEffect(() => {
    if (!GnssReceiver.isGnssReceiverAvailable()) return;
    const wasInUse = prevInUseRef.current;
    prevInUseRef.current = isLocationInUse;
    if (wasInUse === isLocationInUse) return;
    if (isLocationInUse) {
      if (getExternalGnssSnapshot().status.link === 'connected') {
        // つながっている（安定待ちを含む）。切れたら購読の側で再接続する
        return;
      }
      if (lostRef.current !== null) {
        // 位置を使っていない間に切れていた・やめていた再接続を、最初の間隔からやり直す
        lostRef.current = { lostAt: Date.now(), attempt: 0 };
        scheduleRetry();
      } else {
        tryConnect();
      }
    } else {
      cancelRetry();
      releaseIfIdleInBackground();
    }
  }, [cancelRetry, isLocationInUse, releaseIfIdleInBackground, scheduleRetry, tryConnect]);

  // 「切断」で自動接続をOFFにしたら、再接続をやめる
  const autoConnect = settings?.autoConnect === true;
  useEffect(() => {
    if (autoConnect) return;
    lostRef.current = null;
    cancelRetry();
    cancelStable();
  }, [autoConnect, cancelRetry, cancelStable]);
};
