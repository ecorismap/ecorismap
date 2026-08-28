import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Modal, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

export type ExportDestinationChoice = 'save' | 'share' | 'cancel';

type ShowHandler = (resolve: (choice: ExportDestinationChoice) => void) => void;

// App直下にマウントされたモーダルをutils等の非コンポーネントから開くための登録口
let showHandler: ShowHandler | null = null;

/**
 * Androidでのエクスポート先（デバイスに保存 / 他のアプリで共有）をユーザーに確認する。
 * Androidの共有シートには「デバイスに保存」の選択肢がないため、共有前にここで選ばせる。
 * モーダル未マウント時は安全側に倒して'cancel'を返す。
 */
export const showExportDestinationModal = (): Promise<ExportDestinationChoice> =>
  new Promise((resolve) => {
    if (showHandler) {
      showHandler(resolve);
    } else {
      resolve('cancel');
    }
  });

export const ExportDestinationModal = React.memo(() => {
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<((choice: ExportDestinationChoice) => void) | null>(null);

  useEffect(() => {
    showHandler = (resolve) => {
      resolverRef.current = resolve;
      setVisible(true);
    };
    return () => {
      showHandler = null;
    };
  }, []);

  const handleSelect = useCallback((choice: ExportDestinationChoice) => {
    setVisible(false);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    // Modalの消滅と後続ダイアログ（保存完了アラート等）の表示が同一フレームに重なると
    // Androidで新しいダイアログが表示されないため、消滅を待ってからresolveする
    setTimeout(() => resolver?.(choice), 200);
  }, []);

  return (
    <Modal animationType="fade" visible={visible} transparent={true} onRequestClose={() => handleSelect('cancel')}>
      <Pressable style={styles.modalOverlay} onPress={() => handleSelect('cancel')} disablePressedAnimation>
        <Pressable style={styles.modalCard} onPress={() => null} disablePressedAnimation>
          <View style={styles.headerIconCircle}>
            <MaterialCommunityIcons name="export-variant" size={28} color={COLOR.BLUE} />
          </View>
          <Text style={styles.title}>{t('hooks.exportDestination.title')}</Text>
          <Text style={styles.message}>{t('hooks.exportDestination.message')}</Text>

          <Pressable style={styles.optionButton} onPress={() => handleSelect('save')}>
            <View style={styles.optionIconCircle}>
              <MaterialCommunityIcons name="folder-download-outline" size={24} color={COLOR.BLUE} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionLabel}>{t('hooks.exportDestination.save')}</Text>
              <Text style={styles.optionDescription}>{t('hooks.exportDestination.saveDescription')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLOR.GRAY2} />
          </Pressable>

          <Pressable style={styles.optionButton} onPress={() => handleSelect('share')}>
            <View style={styles.optionIconCircle}>
              <MaterialCommunityIcons name="share-variant-outline" size={24} color={COLOR.BLUE} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionLabel}>{t('hooks.exportDestination.share')}</Text>
              <Text style={styles.optionDescription}>{t('hooks.exportDestination.shareDescription')}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={COLOR.GRAY2} />
          </Pressable>

          <Pressable style={styles.cancelButton} onPress={() => handleSelect('cancel')}>
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  cancelButton: {
    alignItems: 'center',
    borderRadius: 12,
    marginTop: 4,
    paddingVertical: 14,
    width: '100%',
  },
  cancelButtonText: {
    color: COLOR.GRAY3,
    fontSize: 16,
    fontWeight: '600',
  },
  headerIconCircle: {
    alignItems: 'center',
    backgroundColor: COLOR.PALEBLUE,
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    marginBottom: 12,
    width: 56,
  },
  message: {
    color: COLOR.GRAY3,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
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
  optionButton: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    width: '100%',
  },
  optionDescription: {
    color: COLOR.GRAY3,
    fontSize: 12,
    marginTop: 2,
  },
  optionIconCircle: {
    alignItems: 'center',
    backgroundColor: COLOR.PALEBLUE,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 12,
    width: 40,
  },
  optionLabel: {
    color: COLOR.BLACK,
    fontSize: 15,
    fontWeight: '600',
  },
  optionTextContainer: {
    flex: 1,
  },
  title: {
    color: COLOR.BLACK,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
});
