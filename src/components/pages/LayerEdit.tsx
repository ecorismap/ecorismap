import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';

import { LayerName } from '../organisms/LayerEditLayerName';
import { LayerStyle } from '../organisms/LayerEditLayerStyle';
import { LayerEditFieldTable, LayerEditFieldTitle } from '../organisms/LayerEditFieldTable';
import { LayerEditButton } from '../organisms/LayerEditButton';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { LayerEditContext } from '../../contexts/LayerEdit';

export default function LayerEditScreen() {
  //console.log('render LayerEdit');
  const { gotoBack } = useContext(LayerEditContext);
  const navigation = useNavigation();

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
      <FlatList
        data={[{}]}
        keyExtractor={() => ''}
        renderItem={() => (
          <>
            <LayerName />
            <LayerStyle />
            <LayerEditFieldTitle />
            <LayerEditFieldTable />
          </>
        )}
      />
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
