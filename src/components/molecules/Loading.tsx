import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useModalYieldingToDialog } from './StyledDialog';

interface Props {
  visible: boolean;
  text: string;
}

export const Loading = React.memo((props: Props) => {
  const { text, visible } = props;
  //処理中にダイアログ（衝突確認・結果通知等）が出る場合があるため、その間は引っ込む
  const shown = useModalYieldingToDialog(visible);

  return (
    <Modal animationType="none" transparent={true} visible={shown}>
      <View style={styles.modalContent}>
        <ActivityIndicator color={COLOR.BLUE} size="large" />
        <Text style={styles.textStyle}>{text}</Text>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
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
    fontWeight: 'bold',
    textAlign: 'center',
    //fontSize: 18,
    //marginLeft: 18,
  },
});
