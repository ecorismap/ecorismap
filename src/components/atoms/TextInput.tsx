import React from 'react';
import { View, Text, TextInput as RNTextInput, StyleSheet } from 'react-native';

import { COLOR } from '../../constants/AppConstants';

const TextInput = React.memo((props: any) => {
  const { label, multiline } = props;

  const styles = StyleSheet.create({
    title: {
      color: COLOR.GRAY3,
      fontSize: 12,
      height: 20,
    },
    tr2: {
      flex: 1,
      flexDirection: 'column',
      height: multiline ? 120 : 60,
      justifyContent: 'center',
      margin: 5,
    },
  });

  return (
    <View style={styles.tr2}>
      {label && <Text style={styles.title}>{label}</Text>}
      <RNTextInput {...props} />
    </View>
  );
});

export default TextInput;
