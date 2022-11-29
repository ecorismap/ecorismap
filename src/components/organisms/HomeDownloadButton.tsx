import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../atoms';

interface Props {
  onPress: () => void;
}

export const HomeDownloadButton = (props: Props) => {
  const { onPress } = props;

  return (
    <View style={styles.buttonContainer}>
      <Button name="delete" onPress={onPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 20,
  },
});
