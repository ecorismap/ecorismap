import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LayersTable } from '../organisms/LayersTable';
import { LayerButtons } from '../organisms/LayerButtons';

import { ScrollView } from 'react-native-gesture-handler';
import { t } from '../../i18n/config';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function LayerScreen() {
  //console.log('render Layer');

  return (
    <View style={styles.container}>
      <BottomSheetHeader title={t('Layers.navigation.title')} />
      <View style={styles.tableContainer}>
        {Platform.OS === 'web' ? (
          <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
            <ScrollView style={{ flex: 1 }}>
              <LayersTable />
            </ScrollView>
          </ScrollView>
        ) : (
          <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ flex: 1 }}>
              <LayersTable />
            </View>
          </ScrollView>
        )}
      </View>
      <LayerButtons />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tableContainer: {
    flex: 1,
  },
});
