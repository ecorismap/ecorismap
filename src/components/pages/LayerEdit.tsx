import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { FUNC_LOGIN } from '../../constants/AppConstants';
import { LayerName } from '../organisms/LayerEditLayerName';
import { LayerStyle } from '../organisms/LayerEditLayerStyle';
import { LayerEditFieldTable } from '../organisms/LayerEditFieldTable';
import { LayerEditButton } from '../organisms/LayerEditButton';
import { LayerEditRadio } from '../organisms/LayerEditRadio';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { usePermission } from '../../hooks/usePermission';
import { FlatList, ScrollView } from 'react-native-gesture-handler';
import { COLOR, LAYEREDIT_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { t } from '../../i18n/config';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function LayerEditScreen() {
  //console.log('render LayerEdit');
  const { layer, isEdited, gotoBack, pressSaveLayer } = useContext(LayerEditContext);
  const { isClosedProject } = usePermission();

  const rightComponent = (
    <Button
      name={LAYEREDIT_BTN.SAVE}
      onPress={pressSaveLayer}
      backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
      disabled={!isEdited}
      labelText={t('LayerEdit.label.save')}
    />
  );

  return (
    <View style={styles.container}>
      <BottomSheetHeader
        title={t('LayerEdit.navigation.title')}
        showBackButton
        onBack={gotoBack}
        rightComponent={rightComponent}
      />
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
