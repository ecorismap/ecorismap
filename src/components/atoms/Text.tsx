import React from 'react';
import { View, Text as RNText, StyleSheet } from 'react-native';

import { COLOR } from '../../constants/AppConstants';

const Text = React.memo((props: any) => {
  const { label, value } = props;
  return (
    <View style={styles.tr2}>
      {label && <RNText style={styles.title}>{label}</RNText>}
      <RNText {...props}>{value}</RNText>
    </View>
  );
});

const styles = StyleSheet.create({
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    height: 60,
    margin: 5,
  },
});

export default Text;
