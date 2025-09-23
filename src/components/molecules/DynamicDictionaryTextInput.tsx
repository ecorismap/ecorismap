import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDynamicDictionaryInput } from '../../hooks/useDynamicDictionaryInput';
import { COLOR } from '../../constants/AppConstants';
import { ScrollView } from 'react-native-gesture-handler';
import { Pressable } from '../atoms/Pressable';

interface DynamicDictionaryTextInputProps {
  editable?: boolean;
  fieldKey: string;
  initialValue: string;
  handleSelect: (text: string) => void;
  clearOnSelect?: boolean;
  onBlur?: (text: string) => void;
}

export const DynamicDictionaryTextInput = React.memo((props: DynamicDictionaryTextInputProps) => {
  const { editable = true, fieldKey, initialValue, handleSelect, onBlur, clearOnSelect } = props;
  
  const {
    queryString,
    filteredData,
    isFocused,
    setQueryString,
    setFocused,
    handleSearch,
    handleSelect: handleInternalSelect,
    showAllSuggestions,
  } = useDynamicDictionaryInput(fieldKey, initialValue);

  const handleSelectItem = (item: string) => {
    if (clearOnSelect) {
      setQueryString('');
    }
    handleInternalSelect(item);
    handleSelect(item);
  };

  const handleShowSuggestions = () => {
    if (!isFocused) {
      showAllSuggestions();
    } else {
      setFocused(false);
    }
  };

  return (
    <View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          value={queryString}
          placeholder="入力してください..."
          onChangeText={(text) => {
            setFocused(true);
            handleSearch(text);
            // 親コンポーネントに値の変更を通知
            handleSelect(text);
          }}
          onFocus={() => {
            // フォーカスしても候補は開かない
          }}
          onBlur={() => {
            setFocused(false);
            if (onBlur) {
              onBlur(queryString);
            }
          }}
          editable={editable}
        />
        <View style={{ marginLeft: 10 }}>
          <MaterialCommunityIcons.Button
            borderRadius={5}
            iconStyle={{ marginRight: 0 }}
            size={25}
            backgroundColor={COLOR.GRAY3}
            name={'menu-down'}
            onPress={handleShowSuggestions}
            disabled={!editable}
          />
        </View>
      </View>
      {isFocused && filteredData.length > 0 && (
        <ScrollView style={styles.flatList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {filteredData.map((item, index) => {
            const isNewEntry = index === filteredData.length - 1 && item === queryString && !filteredData.slice(0, -1).includes(item);
            return (
              <Pressable key={`${item}-${index}`} onPress={() => handleSelectItem(item)} style={styles.separator}>
                <Text style={[styles.listText, { color: isNewEntry ? COLOR.GRAY4 : COLOR.BLACK }]}>
                  {item}
                  {isNewEntry && ' (新規入力)'}
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
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY2,
    borderWidth: 1,
    borderRadius: 5,
    marginTop: 5,
    maxHeight: 150,
  },
  input: {
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    flex: 1,
    fontSize: 16,
    height: 40,
    paddingHorizontal: 12,
  },
  listText: {
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  separator: {
    borderBottomColor: COLOR.GRAY1,
    borderBottomWidth: 1,
  },
});