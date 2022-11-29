import React from 'react';
import { View, Text, TextInput as RNTextInput, StyleSheet } from 'react-native';

import { COLOR } from '../../constants/AppConstants';

const TextInput = React.memo((props: any) => {
  const { label } = props;
  return (
    <View style={styles.tr2}>
      {label && <Text style={styles.title}>{label}</Text>}
      <RNTextInput {...props} />
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

export default TextInput;
