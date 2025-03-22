import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
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

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => (
      <HeaderBackButton {...props_} labelVisible={false} onPress={gotoBack} />
    ),
    [gotoBack]
  );

  const headerRightButton = useCallback(() => {
    return (
      <View style={styles.headerRight}>
        <Button
          name={LAYEREDIT_BTN.SAVE}
          onPress={pressSaveLayer}
          backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
          disabled={!isEdited}
          tooltipText={t('LayerEdit.tooltip.save')}
          labelText={t('LayerEdit.label.save')}
        />
      </View>
    );
  }, [isEdited, pressSaveLayer]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props_),
      headerRight: () => headerRightButton(),
    });
  }, [headerLeftButton, headerRightButton, navigation]);

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
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: 10,
  },
});
