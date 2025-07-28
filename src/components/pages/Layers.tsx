import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { LayersTable } from '../organisms/LayersTable';
import { LayerButtons } from '../organisms/LayerButtons';

import { useNavigation } from '@react-navigation/native';
import { ScrollView } from 'react-native-gesture-handler';
import { t } from '../../i18n/config';
import { COLOR } from '../../constants/AppConstants';

export default function LayerScreen() {
  //console.log('render Layer');

  const navigation = useNavigation();

  const customHeader = useCallback(
    () => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          height: 63,
          backgroundColor: COLOR.MAIN,
        }}
      >
        <Text style={{ fontSize: 16 }}>{t('Layers.navigation.title')}</Text>
      </View>
    ),
    []
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
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
