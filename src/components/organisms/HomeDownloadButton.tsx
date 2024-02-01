import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '../atoms';
import { useWindow } from '../../hooks/useWindow';

interface Props {
  onPress: () => void;
}

export const HomeDownloadButton = (props: Props) => {
  const { onPress } = props;
  const { isLandscape } = useWindow();
  return (
    <View style={isLandscape ? styles.buttonContainerLandscape : styles.buttonContainer}>
      <Button name="delete" onPress={onPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-end',
    alignSelf: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 35,
    position: 'absolute',
    // zIndex: 0,
  },
  buttonContainerLandscape: {
    alignItems: 'flex-end',
    //alignSelf: 'center',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 20,
    position: 'absolute',
    width: '50%',
    // zIndex: 0,
  },
});
