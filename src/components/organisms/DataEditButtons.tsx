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
    isPhotoProcessing,
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
  //写真の取り込み中に記録を離れる・消す・複製すると、取り込んだ写真は付け先を失って捨てられる（写真監査 P-L3）。
  //地図アプリを開くだけのMapsは記録に触れないので止めない
  const isBusy = isEditingRecord || isPhotoProcessing === true;

  return (
    <View style={styles.buttonContainer}>
      <Button
        testID="dataedit-jump"
        name={DATAEDIT_BTN.JUMP}
        onPress={pressJumpToData}
        backgroundColor={isBusy ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isBusy}
        labelText={t('DataEdit.label.jump')}
      />
      <Button
        testID="dataedit-google-maps"
        name={DATAEDIT_BTN.GOOGLE}
        onPress={gotoGoogleMaps}
        backgroundColor={isEditingRecord ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEditingRecord}
        labelText={t('DataEdit.label.google')}
      />
      {(layer.type === 'POINT' || layer.type === 'LINE' || layer.type === 'POLYGON') && (
        <Button
          testID="dataedit-edit-position"
          name={DATAEDIT_BTN.EDIT}
          onPress={pressEditPosition}
          backgroundColor={isBusy || !canEditPosition ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isBusy || !canEditPosition}
          labelText={t('DataEdit.label.edit')}
        />
      )}
      <Button
        testID="dataedit-copy"
        name={DATAEDIT_BTN.COPY}
        onPress={pressCopyData}
        backgroundColor={isBusy || !isEditable ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isBusy || !isEditable}
        labelText={t('DataEdit.label.copy')}
      />
      <Button
        testID="dataedit-delete"
        name={DATAEDIT_BTN.DELETE}
        onPress={pressDeleteData}
        backgroundColor={isBusy || !canDelete ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isBusy || !canDelete}
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
