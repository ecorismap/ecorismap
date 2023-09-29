import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { FUNC_LOGIN } from '../../constants/AppConstants';
import { LayerName } from '../organisms/LayerEditLayerName';
import { LayerStyle } from '../organisms/LayerEditLayerStyle';
import { LayerEditFieldTable, LayerEditFieldTitle } from '../organisms/LayerEditFieldTable';
import { LayerEditButton } from '../organisms/LayerEditButton';
import { LayerEditRadio } from '../organisms/LayerEditRadio';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { usePermission } from '../../hooks/usePermission';
import { ScrollView } from 'react-native-gesture-handler';

export default function LayerEditScreen() {
  //console.log('render LayerEdit');
  const { gotoBack } = useContext(LayerEditContext);
  const navigation = useNavigation();
  const { isClosedProject } = usePermission();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoBack} />,
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props_),
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <ScrollView>
        <LayerName />
        <LayerStyle />
        {FUNC_LOGIN && !isClosedProject && <LayerEditRadio />}
        <LayerEditFieldTitle />
        <LayerEditFieldTable />
      </ScrollView>
      <LayerEditButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
