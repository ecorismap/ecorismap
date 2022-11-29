import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  visible: boolean;
  text: string;
}

export const Loading = React.memo((props: Props) => {
  const { text, visible } = props;

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
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
    //fontSize: 18,
    //marginLeft: 18,
  },
});
