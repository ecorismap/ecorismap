import React, { useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { FUNC_LOGIN, PERMISSIONTYPE } from '../../constants/AppConstants';

import { LayerName } from '../organisms/LayerEditLayerName';
import { LayerStyle } from '../organisms/LayerEditLayerStyle';
import { LayerEditFieldTable, LayerEditFieldTitle } from '../organisms/LayerEditFieldTable';
import { LayerEditButton } from '../organisms/LayerEditButton';

import { FeatureType, FormatType, LayerType, PermissionType } from '../../types';
import { LayerEditRadio } from '../organisms/LayerEditRadio';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { t } from '../../i18n/config';

interface Props {
  layer: LayerType;
  isEdited: boolean;
  isNewLayer: boolean;
  editable: boolean;
  onChangeLayerName: (val: string) => void;
  submitLayerName: () => void;
  onChangePermission: (value: PermissionType) => void;
  onChangeFeatureType: (itemValue: FeatureType) => void;
  onChangeFieldOrder: (index: number) => void;
  onChangeFieldName: (index: number, val: string) => void;
  submitFieldName: (index: number) => void;
  onChangeFieldFormat: (index: number, itemValue: FormatType) => void;
  pressSaveLayer: () => void;
  pressDeleteField: (id: number) => void;
  pressAddField: () => void;
  pressDeleteLayer: () => void;
  gotoLayerEditFeatureStyle: () => void;
  gotoLayerEditFieldItem: (fieldIndex: number, fieldItem: LayerType['field'][0]) => void;
  gotoBack: () => void;
}

export default function LayerEditScreen(props: Props) {
  //console.log('render LayerEdit');
  const {
    layer,
    isEdited,
    isNewLayer,
    editable,
    onChangeLayerName,
    submitLayerName,
    onChangeFeatureType,
    onChangePermission,
    onChangeFieldOrder,
    onChangeFieldName,
    submitFieldName,
    onChangeFieldFormat,
    pressSaveLayer,
    pressDeleteField,
    pressAddField,
    pressDeleteLayer,
    gotoLayerEditFeatureStyle,
    gotoLayerEditFieldItem,
    gotoBack,
  } = props;
  const navigation = useNavigation();
  const permissionLabels = useMemo(() => Object.values(PERMISSIONTYPE), []);
  const permissionList = useMemo(() => Object.keys(PERMISSIONTYPE) as PermissionType[], []);

  const headerLeftButton = useCallback(
    // eslint-disable-next-line no-shadow
    (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props} onPress={gotoBack} />,
    [gotoBack]
  );

  useEffect(() => {
    navigation.setOptions({
      // eslint-disable-next-line no-shadow
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
    });
  }, [headerLeftButton, navigation]);

  return (
    <View style={styles.container}>
      <FlatList
        data={[{}]}
        keyExtractor={() => ''}
        renderItem={() => (
          <>
            <LayerName
              value={layer.name}
              editable={editable}
              onChangeText={onChangeLayerName}
              onEndEditing={submitLayerName}
            />
            <LayerStyle
              editable={editable}
              layer={layer}
              isNewLayer={isNewLayer}
              editFeatureStyle={gotoLayerEditFeatureStyle}
              changeFeatureType={onChangeFeatureType}
            />
            {FUNC_LOGIN && (
              <LayerEditRadio
                editable={editable}
                name={t('common.permission')}
                value={layer.permission}
                valueList={permissionList}
                valueLabels={permissionLabels}
                onValueChange={onChangePermission}
              />
            )}
            <LayerEditFieldTitle editable={editable} addField={pressAddField} />
            <LayerEditFieldTable
              editable={editable}
              data={layer.field}
              changeFieldNameText={onChangeFieldName}
              submitFieldNameText={submitFieldName}
              changeFieldFormatValue={onChangeFieldFormat}
              editFieldListItem={gotoLayerEditFieldItem}
              deleteField={pressDeleteField}
              changeFieldOrder={onChangeFieldOrder}
            />
          </>
        )}
      />
      <LayerEditButton
        isEdited={isEdited}
        editable={editable}
        deleteLayer={pressDeleteLayer}
        pressSaveLayer={pressSaveLayer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
