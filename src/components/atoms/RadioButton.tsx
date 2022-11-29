import React from 'react';
import { StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLOR } from '../../constants/AppConstants';

interface Props {
  checked: boolean;
}
const RadioButton = React.memo((props: Props) => {
  const { checked } = props;
  return (
    <MaterialCommunityIcons
      color={COLOR.GRAY4}
      style={styles.icon}
      size={25}
      name={checked ? 'radiobox-marked' : 'radiobox-blank'}
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

export default RadioButton;
