import React from 'react';
import { StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLOR } from '../../constants/AppConstants';

interface Props {
  checked: boolean;
}
const CheckButton = React.memo((props: Props) => {
  const { checked } = props;
  return (
    <MaterialCommunityIcons
      color={COLOR.GRAY4}
      style={styles.icon}
      size={25}
      name={checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
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

export default CheckButton;
