import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { LayersTable } from '../organisms/LayersTable';
import { LayerButtons } from '../organisms/LayerButtons';
import HeaderRightButton from '../molecules/HeaderRightButton';

import { useNavigation } from '@react-navigation/native';
import { COLOR, NAV_BTN } from '../../constants/AppConstants';
import { useScreen } from '../../hooks/useScreen';

export default function LayerScreen() {
  //console.log('render Layer');

  const { screenState, closeData, expandData, openData } = useScreen();
  const navigation = useNavigation();

  const headerLeftButton = useCallback(() => <></>, []);
  const headerRightButton = useCallback(
    () => (
      <View style={{ flexDirection: 'row' }}>
        <HeaderRightButton
          name={screenState === 'opened' ? NAV_BTN.EXPAND : NAV_BTN.COLLAPSE}
          backgroundColor={COLOR.GRAY0}
          onPress={screenState === 'opened' ? expandData : openData}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
        <HeaderRightButton
          name={NAV_BTN.CLOSE}
          backgroundColor={COLOR.GRAY0}
          onPress={closeData}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
      </View>
    ),
    [closeData, expandData, screenState, openData]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => headerLeftButton(),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, navigation]);

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
