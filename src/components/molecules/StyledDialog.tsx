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
  const current: DialogRequest | undefined = queue[0];

  useEffect(() => {
    enqueueDialog = (request) => setQueue((prev) => [...prev, request]);
    return () => {
      enqueueDialog = null;
    };
  }, []);

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
    <Modal animationType="fade" visible={current !== undefined} transparent={true} onRequestClose={handleDismiss}>
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
