import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from '../atoms/Pressable';

import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { Alert } from '../atoms/Alert';

interface Props {
  name: string;
  text: string;
  info?: string;
  onPress: () => void;
}

export const TextButton = React.memo((props: Props) => {
  const { name, text, info, onPress } = props;

  return (
    <View style={styles.tr}>
      <View style={[styles.td, { flex: 10 }]}>
        <View style={{ width: 33 }}>
          <Button name={name} borderRadius={5} backgroundColor={COLOR.GRAY3} onPress={onPress} />
        </View>
        <View style={{ marginLeft: 10, flex: 9 }}>
          <Pressable onPress={onPress} style={{ height: 50, justifyContent: 'center' }}>
            <Text style={styles.text}>{text}</Text>
          </Pressable>
        </View>
      </View>
      {info && (
        <View style={[styles.td, { flex: 1, justifyContent: 'flex-end' }]}>
          <Button
            name="information-variant"
            backgroundColor={COLOR.GRAY2}
            size={12}
            onPress={() => Alert.alert('', info)}
          />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    //justifyContent: 'flex-end',
  },

  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 0,
    //borderRightWidth: 1,
  },

  text: {
    //color: COLOR.BLACK,
    //textDecorationLine: 'underline',
  },
  tr: {
    flexDirection: 'row',
    //flex: 1,
    height: 60,
    //justifyContent: 'space-between',
  },
});
