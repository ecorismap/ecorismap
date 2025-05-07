import React from 'react';
import { View, StyleSheet } from 'react-native';

import { Button, TextInput } from '../atoms';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  name: string;
  value: number | string;
  type: 'INTEGER' | 'DECIMAL' | 'SERIAL';
  onChangeText: (name: string, value: string | number) => void;
  onEndEditing: () => void;
}

export const DataEditNumber = (props: Props) => {
  const { name, value, type, onChangeText, onEndEditing } = props;
  //plus minusボタンで値を変更するときは、textinputと違って数値で返す。
  //textinputはonEndEditingが呼ばれformatedInputで数値に変換されるため。
  const plus = () => {
    const val = isNaN(parseFloat(value.toString())) ? 0 : parseFloat(value.toString()) + 1;
    onChangeText(name, val);
  };

  const minus = () => {
    const val = isNaN(parseFloat(value.toString())) ? 0 : parseFloat(value.toString()) - 1;
    onChangeText(name, val);
  };

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <TextInput
          style={styles.input}
          label={name}
          keyboardType="number-pad"
          value={value.toString()}
          onChangeText={(val: string) => onChangeText(name, val)}
          onEndEditing={onEndEditing}
          onBlur={onEndEditing}
        />
        {(type === 'INTEGER' || type === 'SERIAL') && (
          <>
            <View style={styles.button}>
              <Button name="plus" onPress={() => plus()} style={{ backgroundColor: COLOR.GRAY3 }} borderRadius={10} />
            </View>
            <View style={styles.button}>
              <Button name="minus" onPress={() => minus()} style={{ backgroundColor: COLOR.GRAY3 }} borderRadius={10} />
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    margin: 5,
    marginTop: 25,
  },
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 2,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
    paddingLeft: 10,
  },
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
    height: 70,
  },
});
