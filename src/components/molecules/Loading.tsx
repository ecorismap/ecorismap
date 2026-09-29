import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal, Pressable } from 'react-native';
import { t } from '../../i18n/config';
import { COLOR } from '../../constants/AppConstants';
import { useModalYieldingToDialog } from './StyledDialog';

interface Props {
  visible: boolean;
  text: string;
  //渡すと中止ボタンを出す（長い処理を途中でやめられるように）
  onCancel?: () => void;
}

export const Loading = React.memo((props: Props) => {
  const { text, visible, onCancel } = props;
  //処理中にダイアログ（衝突確認・結果通知等）が出る場合があるため、その間は引っ込む
  const shown = useModalYieldingToDialog(visible);

  return (
    <Modal animationType="none" transparent={true} visible={shown}>
      <View style={styles.modalContent}>
        {/* 文字やボタンがあるときは白い台紙に載せる（背景が透けるので地図の上で読めなくなるため） */}
        <View style={text !== '' || onCancel !== undefined ? styles.card : undefined}>
          <ActivityIndicator color={COLOR.BLUE} size="large" />
          {text !== '' && <Text style={styles.textStyle}>{text}</Text>}
          {onCancel !== undefined && (
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  cancelButton: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.BLUE,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  card: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderRadius: 12,
    elevation: 4,
    minWidth: 200,
    paddingHorizontal: 24,
    paddingVertical: 20,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cancelText: {
    color: COLOR.BLUE,
    fontWeight: 'bold',
  },
  modalContent: {
    alignItems: 'center',
    backgroundColor: COLOR.CAROUSEL_BACKGROUND,
    flex: 1,
    //flexDirection: 'row',
    justifyContent: 'center',

    padding: 22,
  },
  textStyle: {
    color: COLOR.BLUE,
    marginTop: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    //fontSize: 18,
    //marginLeft: 18,
  },
});
