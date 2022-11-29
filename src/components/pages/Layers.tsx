import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { LayersTable } from '../organisms/LayersTable';
import { LayerButtons } from '../organisms/LayerButtons';
import HeaderRightButton from '../molecules/HeaderRightButton';

import { LayerType } from '../../types';
import { useNavigation } from '@react-navigation/native';
import { COLOR, NAV_BTN } from '../../constants/AppConstants';
import { useDisplay } from '../../hooks/useDisplay';

interface Props {
  layers: LayerType[];
  changeVisible: (index: number, layer: LayerType) => void;
  changeLabel: (index: number, labelValue: string) => void;
  changeActiveLayer: (index: number) => void;
  changeLayerOrder: (index: number) => void;
  gotoLayerEdit: (layer: LayerType) => void;
  gotoColorStyle: (layer: LayerType) => void;
  gotoData: (layer: LayerType) => void;
  pressAddLayer: () => void;
  pressImportLayerAndData: () => Promise<void>;
}

export default function LayerScreen(props: Props) {
  //console.log('render Layer');

  const {
    layers,
    changeVisible,
    changeLabel,
    changeActiveLayer,
    changeLayerOrder,
    pressAddLayer,
    pressImportLayerAndData,
    gotoData,
    gotoLayerEdit,
    gotoColorStyle,
  } = props;

  const { isDataOpened, closeData, expandData, openData } = useDisplay();
  const navigation = useNavigation();

  const headerLeftButton = useCallback(() => <></>, []);
  const headerRightButton = useCallback(
    () => (
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
    ),
    [closeData, expandData, isDataOpened, openData]
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
        <LayersTable
          layers={layers}
          changeVisible={changeVisible}
          gotoData={gotoData}
          gotoColorStyle={gotoColorStyle}
          changeLabel={changeLabel}
          changeActiveLayer={changeActiveLayer}
          changeLayerOrder={changeLayerOrder}
          gotoLayerEdit={gotoLayerEdit}
        />
      </ScrollView>
      <LayerButtons addLayer={pressAddLayer} pressImportLayerAndData={pressImportLayerAndData} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
