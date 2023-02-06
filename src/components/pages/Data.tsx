import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';

import HeaderRightButton from '../molecules/HeaderRightButton';
import { COLOR, NAV_BTN } from '../../constants/AppConstants';
import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { useDisplay } from '../../hooks/useDisplay';
import { DataContext } from '../../contexts/Data';

export default function DataScreen() {
  //console.log('render Data');

  const { layer, isChecked, gotoBack } = useContext(DataContext);

  const navigation = useNavigation();
  const { isDataOpened, expandData, openData, closeData } = useDisplay();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoBack} />,
    [gotoBack]
  );

  const headerRightButton = useCallback(() => {
    return (
      <View style={{ flexDirection: 'row' }}>
        <HeaderRightButton
          name={isDataOpened === 'opened' ? NAV_BTN.EXPAND : NAV_BTN.COLLAPSE}
          backgroundColor={COLOR.GRAY0}
          onPress={isDataOpened === 'opened' ? expandData : openData}
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
  }, [closeData, expandData, isDataOpened, openData]);

  useEffect(() => {
    navigation.setOptions({
      title: layer.name,

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
    isDataOpened,
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
