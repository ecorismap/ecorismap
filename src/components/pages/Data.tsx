import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { DataContext } from '../../contexts/Data';
import { ScrollView } from 'react-native-gesture-handler';
import { DictionaryTextInput } from '../molecules/DictionaryTextInput';

export default function DataScreen() {
  //console.log('render Data');

  const { layer, isChecked, gotoBack, addDataByDictinary } = useContext(DataContext);

  const navigation = useNavigation();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <HeaderBackButton {...props_} labelVisible={false} onPress={gotoBack} />
    ),
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      title: layer.name,
      headerTitleStyle: {
        fontSize: layer.name.length > 13 ? 10 : 15,
      },
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
    });
  }, [gotoBack, headerLeftButton, isChecked, layer.name, navigation]);

  return (
    <View style={styles.container}>
      {layer.dictionaryFieldId !== undefined && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', margin: 10 }}>
          <DictionaryTextInput
            initialValue=""
            table={`_${layer.id}_${layer.dictionaryFieldId}`}
            handleSelect={(text: string) => addDataByDictinary(layer.dictionaryFieldId!, text)}
            clearOnSelect
          />
        </View>
      )}
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flex: 1, flexDirection: 'column', marginBottom: 10 }}>
          <DataTable />
        </View>
      </ScrollView>
      <DataButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
