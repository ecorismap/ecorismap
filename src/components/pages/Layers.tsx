import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { LayersTable } from '../organisms/LayersTable';
import { LayerButtons } from '../organisms/LayerButtons';

import { useNavigation } from '@react-navigation/native';
import { ScrollView } from 'react-native-gesture-handler';

export default function LayerScreen() {
  //console.log('render Layer');

  const navigation = useNavigation();

  const headerLeftButton = useCallback(() => <></>, []);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => headerLeftButton(),
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
        <LayersTable />
      </ScrollView>
      <LayerButtons />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
