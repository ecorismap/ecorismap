import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { DynamicDictionaryTextInput } from '../molecules/DynamicDictionaryTextInput';

interface Props {
  name: string;
  value: string | number | undefined;
  editable?: boolean;
  layerId: string;
  fieldId: string;
  onChangeText: (name: string, value: string) => void;
  onEndEditing: () => void;
}

export const DataEditDynamicDictionary = (props: Props) => {
  const { name, value, layerId, fieldId, editable = true, onChangeText, onEndEditing } = props;

  // Create a unique field key combining layerId and fieldId
  const fieldKey = `${layerId}_${fieldId}`;

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
          <DynamicDictionaryTextInput
            initialValue={value ? value.toString() : ''}
            fieldKey={fieldKey}
            handleSelect={(text) => onChangeText(name, text)}
            onBlur={(text) => {
              onChangeText(name, text);
              onEndEditing();
            }}
            editable={editable}
          />
        </View>
      </View>
    </View>
  );
};