import React, { useEffect, useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDictionaryInput } from '../../hooks/useDictionaryInput';
import { COLOR } from '../../constants/AppConstants';
import { ScrollView } from 'react-native-gesture-handler';
import { Pressable } from '../atoms/Pressable';

interface DictionaryTextInputProp {
  editable?: boolean;
  table: string;
  initialValue: string;
  filter?: string;
  handleSelect: (text: string) => void;
  clearOnSelect?: boolean;
  onBlure?: (text: string) => void;
}
export const DictionaryTextInput = React.memo((prop: DictionaryTextInputProp) => {
  const { editable, table, initialValue, filter, handleSelect, onBlure, clearOnSelect } = prop;
  const [isFocused, setFocus] = useState(false);
  const {
    queryString,
    filteredData,
    isListening,
    setQueryString,
    handleKeybordSearch,
    stopListening,
    startListening,
    setFilteredData,
    setFilterString,
  } = useDictionaryInput(table, initialValue);

  const handleSelectItem = (item: string) => {
    clearOnSelect ? setQueryString('') : setQueryString(item);
    setFilteredData([]);
    setFocus(false);
    handleSelect(item);
  };

  useEffect(() => {
    setFilterString(filter === '' || filter === undefined ? '1=1' : filter);
  }, [filter, setFilterString]);

  return (
    <View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          value={queryString}
          placeholder="Search..."
          onChangeText={(text) => {
            setFocus(true);
            handleKeybordSearch(text);
          }}
          //onFocus={() => setFocus(true)} //not working on iOS
          onBlur={() => (onBlure ? onBlure(queryString) : null)}
          editable={editable}
        />
        <View style={{ marginLeft: 10 }}>
          <MaterialCommunityIcons.Button
            borderRadius={50}
            iconStyle={{ marginRight: 0 }}
            size={20}
            backgroundColor={isListening ? 'red' : 'blue'}
            name={'microphone'}
            onPress={() => {
              setFocus(true);
              isListening ? stopListening() : startListening();
            }}
          />
        </View>
      </View>
      {isFocused && queryString.length > 0 && (
        <ScrollView style={styles.flatList} nestedScrollEnabled>
          {filteredData.map((item, index) => {
            return (
              <Pressable key={index} onPress={() => handleSelectItem(item)} style={styles.separator}>
                <Text
                  style={[styles.listText, { color: index === filteredData.length - 1 ? COLOR.GRAY4 : COLOR.BLACK }]}
                >
                  {item}
                  {index === filteredData.length - 1 && item.length > 0 && ' (入力)'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  flatList: {
    backgroundColor: COLOR.GRAY2,
    borderColor: COLOR.GRAY0,
    borderWidth: 1,
    marginVertical: 10,
    maxHeight: 120,
  },
  input: {
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    flex: 3,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
    paddingLeft: 10,
  },

  listText: {
    fontSize: 16,
    marginLeft: 5,
    marginVertical: 3,
  },

  searchContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    //marginTop: 10,
    width: '100%',
  },
  separator: {
    borderBottomColor: COLOR.GRAY0,
    borderBottomWidth: 1,
  },
});
