import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { DictionaryTextInput } from '../molecules/DictionaryTextInput';
import { getDatabase } from '../../utils/SQLite';

interface Props {
  name: string;
  value: string | number | undefined;
  editable?: boolean;

  table: string;
  onChangeText: (name: string, value: string) => void;
  onEndEditing: () => void;
}

export const DataEditDictionary = (props: Props) => {
  const { name, value, table, editable, onChangeText } = props;

  const db = getDatabase();
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
    title: {
      color: COLOR.GRAY3,
      fontSize: 12,
      height: 20,
    },

    tr: {
      flexDirection: 'row',
    },
    tr2: {
      flex: 1,
      flexDirection: 'column',
      justifyContent: 'center',
      margin: 5,
    },
  });

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <View style={styles.tr2}>
          {name && <Text style={styles.title}>{name}</Text>}
          <DictionaryTextInput
            initialValue={value ? value.toString() : ''}
            db={db}
            table={table}
            handleSelect={(text) => onChangeText(name, text)}
            onBlure={(text) => onChangeText(name, text)}
            editable={editable}
          />
        </View>
      </View>
    </View>
  );
};
