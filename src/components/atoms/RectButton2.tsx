import React from 'react';
import { StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLOR } from '../../constants/AppConstants';

const RectButton2 = React.memo((props: any) => {
  return (
    <MaterialCommunityIcons.Button
      color={COLOR.GRAY4}
      style={styles.icon}
      size={25}
      borderRadius={0}
      iconStyle={{ marginRight: 0 }}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  icon: {
    backgroundColor: COLOR.MAIN,
    padding: 0,
  },
});

export default RectButton2;
