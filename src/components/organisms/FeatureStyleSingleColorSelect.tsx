import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  value: string;
  onPressColorSelect: () => void;
}

export const SingleColorSelect = (props: Props) => {
  const { value, onPressColorSelect } = props;

  return (
    <View style={styles.tr}>
      <Pressable style={[styles.td, { backgroundColor: value }]} onPress={() => onPressColorSelect()}>
        <Text>{value}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },

  tr: {
    flexDirection: 'row',
    height: 60,
  },
});
