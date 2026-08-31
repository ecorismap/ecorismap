import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, type AlertButton, type AlertOptions } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';

export type StyledDialogButton = AlertButton & {
  swalType?: 'deny' | 'cancel' | 'confirm';
};

type DialogRequest = {
  title?: string;
  message?: string;
  buttons?: StyledDialogButton[];
  options?: AlertOptions;
};

type ButtonRole = 'primary' | 'secondary' | 'destructive' | 'cancel';

let enqueueDialog: ((request: DialogRequest) => void) | null = null;

//iOSはRN Modalを兄弟で2枚同時に表示できないため、ダイアログとオーバーレイ系Modal（Loading等）が
//時間的に重ならないよう協調するための仕組み。dismiss/present遷移の安全マージンも共通化する
export const MODAL_TRANSITION_MS = 300;

const dialogActiveKeys = new Set<string>();
const dialogActiveListeners = new Set<(active: boolean) => void>();

const setDialogActiveKey = (key: string, active: boolean) => {
  const wasActive = dialogActiveKeys.size > 0;
  if (active) {
    dialogActiveKeys.add(key);
  } else {
    dialogActiveKeys.delete(key);
  }
  const isActive = dialogActiveKeys.size > 0;
  if (wasActive !== isActive) dialogActiveListeners.forEach((listener) => listener(isActive));
};

/** ダイアログ（またはダイアログ相当のModal）が表示中かを購読する */
const useDialogActive = () => {
  const [active, setActive] = useState(dialogActiveKeys.size > 0);
  useEffect(() => {
    dialogActiveListeners.add(setActive);
    return () => {
      dialogActiveListeners.delete(setActive);
    };
  }, []);
  return active;
};

/**
 * オーバーレイ系Modal（Loading・ダウンロード進捗等）用。ダイアログ表示中は一時的に引っ込み、
 * 表示はMODAL_TRANSITION_MS遅らせて直前のModalのdismiss完了を待つ。
 * 注意: RN Modalはvisible=falseで子をアンマウントするため、モーダル内にローカル入力stateを持つ画面には使わない
 */
export const useModalYieldingToDialog = (visible: boolean) => {
  const dialogActive = useDialogActive();
  const target = visible && !dialogActive;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!target) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), MODAL_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [target]);
  return shown;
};

/**
 * StyledDialog以外の「ダイアログ相当」のModal（競合解決モーダル等）用。
 * 表示中はLoading等のyielding系Modalを引っ込ませ、自身の表示もMODAL_TRANSITION_MS遅らせる
 */
export const useDialogPresence = (key: string, visible: boolean) => {
  useEffect(() => {
    setDialogActiveKey(key, visible);
    return () => setDialogActiveKey(key, false);
  }, [key, visible]);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!visible) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), MODAL_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [visible]);
  return shown;
};

/**
 * Alertアトムから呼ばれるスタイル付きダイアログの表示。
 * ホスト（StyledDialog）未マウント時はfalseを返し、呼び出し側でネイティブAlert等へフォールバックする。
 */
export const showStyledDialog = (request: DialogRequest): boolean => {
  if (enqueueDialog === null) return false;
  enqueueDialog(request);
  return true;
};

// swalType/styleからボタンの見た目を決める。指定がなければ末尾を主ボタン扱いにする（ネイティブAlertの慣習）
const resolveRole = (button: StyledDialogButton, index: number, total: number): ButtonRole => {
  if (button.swalType === 'confirm') return 'primary';
  if (button.swalType === 'deny') return 'secondary';
  if (button.swalType === 'cancel' || button.style === 'cancel') return 'cancel';
  if (button.style === 'destructive') return 'destructive';
  return index === total - 1 ? 'primary' : 'cancel';
};

export const StyledDialog = React.memo(() => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [visible, setVisible] = useState(false);
  const current: DialogRequest | undefined = queue[0];
  const hasCurrent = current !== undefined;

  useEffect(() => {
    enqueueDialog = (request) => setQueue((prev) => [...prev, request]);
    return () => {
      enqueueDialog = null;
    };
  }, []);

  //Loading等のyielding系Modalに表示中であることを知らせる（キュー投入時点から。先方が引っ込む時間を作る）
  useEffect(() => {
    setDialogActiveKey('styled-dialog', hasCurrent);
    return () => setDialogActiveKey('styled-dialog', false);
  }, [hasCurrent]);

  // 他のModal（ローディング・各種モーダル）のdismiss完了と同一フレームで表示すると
  // iOS/Androidともダイアログが表示されないことがあるため、ワンテンポ置いてから表示する
  useEffect(() => {
    if (!hasCurrent) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), MODAL_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [hasCurrent]);

  const closeCurrent = useCallback((action?: () => void) => {
    setQueue((prev) => prev.slice(1));
    if (action) action();
  }, []);

  const handleDismiss = useCallback(() => {
    if (current?.options?.cancelable === true) {
      closeCurrent(current.options.onDismiss);
    }
  }, [closeCurrent, current]);

  const buttons: StyledDialogButton[] = current?.buttons?.length ? current.buttons : [{ text: 'OK' }];
  const horizontal = buttons.length === 2;

  const renderButton = (button: StyledDialogButton, index: number) => {
    const role = resolveRole(button, index, buttons.length);
    return (
      <Pressable
        key={index}
        style={[
          styles.buttonBase,
          horizontal && styles.buttonHorizontal,
          role === 'primary' && styles.buttonPrimary,
          role === 'secondary' && styles.buttonSecondary,
          role === 'destructive' && styles.buttonDestructive,
        ]}
        onPress={() => closeCurrent(button.onPress as (() => void) | undefined)}
      >
        <Text
          style={[
            styles.buttonTextBase,
            role === 'primary' && styles.buttonTextPrimary,
            role === 'secondary' && styles.buttonTextSecondary,
            role === 'destructive' && styles.buttonTextDestructive,
            role === 'cancel' && styles.buttonTextCancel,
          ]}
        >
          {button.text ?? 'OK'}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal animationType="fade" visible={hasCurrent && visible} transparent={true} onRequestClose={handleDismiss}>
      <Pressable style={styles.modalOverlay} onPress={handleDismiss} disablePressedAnimation>
        <Pressable style={styles.modalCard} onPress={() => null} disablePressedAnimation>
          {!!current?.title && <Text style={styles.title}>{current.title}</Text>}
          {!!current?.message && (
            <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageContainer}>
              <Text style={styles.message}>{current.message}</Text>
            </ScrollView>
          )}
          <View style={horizontal ? styles.buttonRow : styles.buttonColumn}>{buttons.map(renderButton)}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  buttonBase: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
  },
  buttonColumn: {
    width: '100%',
  },
  buttonDestructive: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.LIGHTRED,
    borderWidth: 1,
  },
  buttonHorizontal: {
    flex: 1,
    width: undefined,
  },
  buttonPrimary: {
    backgroundColor: COLOR.BLUE,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  buttonSecondary: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.BLUE,
    borderWidth: 1,
  },
  buttonTextBase: {
    color: COLOR.GRAY3,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonTextCancel: {
    color: COLOR.GRAY3,
  },
  buttonTextDestructive: {
    color: COLOR.DARKRED,
  },
  buttonTextPrimary: {
    color: COLOR.WHITE,
  },
  buttonTextSecondary: {
    color: COLOR.BLUE,
  },
  message: {
    color: COLOR.GRAY4,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  messageContainer: {
    paddingBottom: 4,
  },
  messageScroll: {
    marginBottom: 12,
    maxHeight: 320,
    width: '100%',
  },
  modalCard: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderRadius: 20,
    elevation: 5,
    maxWidth: 360,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    width: '85%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: COLOR.MODAL_OVERLAY,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: COLOR.BLACK,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
});
