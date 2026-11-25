import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useDialogPresence } from '../molecules/StyledDialog';
import { t } from '../../i18n/config';

/** 一括再共有の候補（メンバー単位にまとめたもの） */
export type ReshareCandidate = {
  uid: string;
  label: string;
  keyChangedAt: Date;
  projectCount: number;
};

interface Props {
  visible: boolean;
  candidates: ReshareCandidate[];
  pressOK: (uids: string[]) => void;
  pressCancel: () => void;
}

export const ProjectsModalReshareKeys = React.memo((props: Props) => {
  const { visible, candidates, pressOK, pressCancel } = props;
  const shown = useDialogPresence('projects-reshare-keys', visible);
  const [checked, setChecked] = useState<string[]>([]);

  // 本人が鍵をリセットしたことを管理者が確かめてから選べるよう、初期状態は未選択にする
  useEffect(() => {
    if (visible) setChecked([]);
  }, [visible]);

  const toggle = useCallback((uid: string) => {
    setChecked((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  }, []);

  const okDisabled = checked.length === 0;

  return (
    <Modal animationType="fade" visible={shown} transparent={true} onRequestClose={pressCancel}>
      <Pressable style={styles.modalOverlay} onPress={pressCancel} disablePressedAnimation>
        <Pressable style={styles.modalCard} onPress={() => null} disablePressedAnimation>
          <Text style={styles.title}>{t('Projects.label.reshareKeysTitle')}</Text>
          <Text style={styles.message}>{t('Projects.label.reshareKeysMessage')}</Text>
          <ScrollView style={styles.list}>
            {candidates.map((c) => {
              const isChecked = checked.includes(c.uid);
              return (
                <Pressable
                  key={c.uid}
                  style={styles.row}
                  onPress={() => toggle(c.uid)}
                  testID={`reshare-candidate-${c.uid}`}
                >
                  <MaterialCommunityIcons
                    name={isChecked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                    size={24}
                    color={isChecked ? COLOR.BLUE : COLOR.GRAY4}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {c.label}
                    </Text>
                    <Text style={styles.rowSub}>
                      {t('Projects.label.reshareKeysRow', {
                        date: c.keyChangedAt.toLocaleString(),
                        num: c.projectCount,
                      })}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.buttonRow}>
            <Pressable testID="reshare-keys-cancel" style={[styles.buttonBase, styles.buttonCancel]} onPress={pressCancel}>
              <Text style={[styles.buttonTextBase, styles.buttonTextCancel]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.buttonBase, styles.buttonPrimary, okDisabled && styles.buttonDisabled]}
              disabled={okDisabled}
              onPress={() => pressOK(checked)}
              testID="reshare-keys-ok"
            >
              <Text style={[styles.buttonTextBase, styles.buttonTextPrimary]}>
                {t('Projects.label.reshareKeysRun')}
              </Text>
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
  list: {
    marginBottom: 8,
    maxHeight: 320,
    width: '100%',
  },
  message: {
    color: COLOR.GRAY4,
    fontSize: 14,
    marginBottom: 12,
  },
  modalCard: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderRadius: 20,
    elevation: 5,
    maxWidth: 420,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    width: '90%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: COLOR.MODAL_OVERLAY,
    flex: 1,
    justifyContent: 'center',
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY1,
    flexDirection: 'row',
    paddingVertical: 10,
  },
  rowLabel: {
    color: COLOR.BLACK,
    fontSize: 15,
  },
  rowSub: {
    color: COLOR.GRAY4,
    fontSize: 12,
    marginTop: 2,
  },
  rowText: {
    flex: 1,
    marginLeft: 8,
  },
  title: {
    color: COLOR.BLACK,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
});
