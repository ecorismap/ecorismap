import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { FUNC_LOGIN } from '../../constants/AppConstants';
import { LayerName } from '../organisms/LayerEditLayerName';
import { LayerStyle } from '../organisms/LayerEditLayerStyle';
import { LayerEditFieldTable } from '../organisms/LayerEditFieldTable';
import { LayerEditButton } from '../organisms/LayerEditButton';
import { LayerEditRadio } from '../organisms/LayerEditRadio';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { usePermission } from '../../hooks/usePermission';
import { FlatList, ScrollView } from 'react-native-gesture-handler';
import { COLOR, LAYEREDIT_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

export default function LayerEditScreen() {
  //console.log('render LayerEdit');
  const { layer, isEdited, gotoBack, pressSaveLayer } = useContext(LayerEditContext);
  const navigation = useNavigation();
  const { isClosedProject } = usePermission();

  const customHeader = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 63, backgroundColor: COLOR.MAIN }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {/* @ts-ignore */}
          <HeaderBackButton
            {...props_}
            labelVisible={true}
            label={t('Layers.navigation.title')}
            labelStyle={{ fontSize: 11 }}
            onPress={gotoBack}
            style={{ marginLeft: 10 }}
          />
        </View>
        <View style={{ flex: 2, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('LayerEdit.navigation.title')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', flexDirection: 'row', paddingRight: 13 }}>
          <Button
            name={LAYEREDIT_BTN.SAVE}
            onPress={pressSaveLayer}
            backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
            disabled={!isEdited}
            labelText={t('LayerEdit.label.save')}
          />
        </View>
      </View>
    ),
    [gotoBack, isEdited, pressSaveLayer]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      <FlatList
        data={[{ key: 'dummy' }]}
        renderItem={() => (
          <>
            <LayerName />
            <LayerStyle />
            {FUNC_LOGIN && !isClosedProject && layer.type !== 'LAYERGROUP' && <LayerEditRadio />}
            {layer.type !== 'LAYERGROUP' && (
              <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
                <LayerEditFieldTable />
              </ScrollView>
            )}
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
