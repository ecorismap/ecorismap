import React, { useContext } from 'react';
import { View, StyleSheet } from 'react-native';

import { Button } from '../atoms';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import { DataEditContext } from '../../contexts/DataEdit';
import { t } from '../../i18n/config';

export const DataEditButtons = () => {
  const {
    layer,
    isEditingRecord,
    isEditable,
    modifyBlockMessage,
    deleteBlockMessage,
    pressCopyData,
    pressDeleteData,
    pressJumpToData,
    gotoGoogleMaps,
    pressEditPosition,
  } = useContext(DataEditContext);

  //他のメンバー・テンプレートの記録で変更・削除できないときは、位置と削除のボタンを無効にする（複製は自分の記録になるので残す）
  const canEditPosition = isEditable && modifyBlockMessage === undefined;
  const canDelete = isEditable && deleteBlockMessage === undefined;

  return (
    <View style={styles.buttonContainer}>
      <Button
        name={DATAEDIT_BTN.JUMP}
        onPress={pressJumpToData}
        backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord}
        labelText={t('DataEdit.label.jump')}
      />
      <Button
        name={DATAEDIT_BTN.GOOGLE}
        onPress={gotoGoogleMaps}
        backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord}
        labelText={t('DataEdit.label.google')}
      />
      {(layer.type === 'POINT' || layer.type === 'LINE' || layer.type === 'POLYGON') && (
        <Button
          name={DATAEDIT_BTN.EDIT}
          onPress={pressEditPosition}
          backgroundColor={isEditingRecord || !canEditPosition ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditingRecord || !canEditPosition}
          labelText={t('DataEdit.label.edit')}
        />
      )}
      <Button
        name={DATAEDIT_BTN.COPY}
        onPress={pressCopyData}
        backgroundColor={isEditingRecord || !isEditable ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord || !isEditable}
        labelText={t('DataEdit.label.copy')}
      />
      <Button
        testID="dataedit-delete"
        name={DATAEDIT_BTN.DELETE}
        onPress={pressDeleteData}
        backgroundColor={isEditingRecord || !canDelete ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord || !canDelete}
        labelText={t('DataEdit.label.delete')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginVertical: 20,
  },
});
