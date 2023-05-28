import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';

import HeaderRightButton from '../molecules/HeaderRightButton';
import { COLOR, NAV_BTN } from '../../constants/AppConstants';
import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { useScreen } from '../../hooks/useScreen';
import { DataContext } from '../../contexts/Data';

export default function DataScreen() {
  //console.log('render Data');

  const { layer, isChecked, gotoBack } = useContext(DataContext);

  const navigation = useNavigation();
  const { screenState, expandData, openData, closeData } = useScreen();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoBack} />,
    [gotoBack]
  );

  const headerRightButton = useCallback(() => {
    return (
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
    );
  }, [closeData, expandData, screenState, openData]);

  useEffect(() => {
    navigation.setOptions({
      title: layer.name,
      headerTitleStyle: {
        fontSize: layer.name.length > 13 ? 10 : 15,
      },
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
      headerRight: () => headerRightButton(),
    });
  }, [
    closeData,
    expandData,
    gotoBack,
    headerLeftButton,
    headerRightButton,
    isChecked,
    screenState,
    layer.name,
    navigation,
    openData,
  ]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
        <DataTable />
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
