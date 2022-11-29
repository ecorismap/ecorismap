import React from 'react';
import { View, StyleSheet } from 'react-native';

import { Button } from '../atoms';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';

interface Props {
  onPressJumpToMap: () => void;
  onPressJumpToGoogle: () => void;
  onPressDeleteData: () => void;
  onPressSaveData: () => void;
  isEditing: boolean;
}

export const DataEditButtons = (props: Props) => {
  const { onPressJumpToMap, onPressJumpToGoogle, onPressDeleteData, onPressSaveData, isEditing } = props;
  return (
    <>
      <View style={styles.buttonContainer}>
        <Button
          name={DATAEDIT_BTN.JUMP}
          onPress={onPressJumpToMap}
          backgroundColor={isEditing ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditing}
        />
        <Button
          name={DATAEDIT_BTN.GOOGLE}
          onPress={onPressJumpToGoogle}
          backgroundColor={isEditing ? COLOR.LIGHTBLUE : COLOR.BLUE}
          disabled={isEditing}
        />
        <Button name={DATAEDIT_BTN.DELETE} onPress={onPressDeleteData} backgroundColor={COLOR.BLUE} />
        <Button
          name={DATAEDIT_BTN.SAVE}
          onPress={onPressSaveData}
          backgroundColor={isEditing ? COLOR.BLUE : COLOR.LIGHTBLUE}
          disabled={!isEditing}
        />
      </View>
    </>
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
