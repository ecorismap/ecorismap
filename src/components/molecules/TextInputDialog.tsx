import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useDialogPresence } from './StyledDialog';
import { t } from '../../i18n/config';

interface Props {
  visible: boolean;
  title: string;
  placeholder?: string;
  //ダイアログ協調機構(useDialogPresence)のキー。画面ごとに一意にする
  presenceKey: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export const TextInputDialog = React.memo((props: Props) => {
  const { visible, title, placeholder, presenceKey, onSubmit, onCancel } = props;
  const shown = useDialogPresence(presenceKey, visible);
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText('');
  }, [visible]);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    onSubmit(trimmed);
  }, [onSubmit, text]);

  const submitDisabled = text.trim() === '';

  return (
    <Modal animationType="fade" visible={shown} transparent={true} onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel} disablePressedAnimation>
        <Pressable style={styles.modalCard} onPress={() => null} disablePressedAnimation>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.textInput}
            value={text}
            placeholder={placeholder}
            placeholderTextColor={COLOR.GRAY3}
            autoFocus={true}
            onChangeText={setText}
            onSubmitEditing={submit}
          />
          <View style={styles.buttonRow}>
            <Pressable style={[styles.buttonBase, styles.buttonCancel]} onPress={onCancel}>
              <Text style={[styles.buttonTextBase, styles.buttonTextCancel]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.buttonBase, styles.buttonPrimary, submitDisabled && styles.buttonDisabled]}
              disabled={submitDisabled}
              onPress={submit}
            >
              <Text style={[styles.buttonTextBase, styles.buttonTextPrimary]}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  buttonBase: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonCancel: {
    backgroundColor: COLOR.WHITE,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonPrimary: {
    backgroundColor: COLOR.BLUE,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  buttonTextBase: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonTextCancel: {
    color: COLOR.GRAY3,
  },
  buttonTextPrimary: {
    color: COLOR.WHITE,
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
  textInput: {
    borderColor: COLOR.GRAY2,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  title: {
    color: COLOR.BLACK,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
});
