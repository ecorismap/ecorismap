import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR, LAYEREDIT_BTN } from '../../constants/AppConstants';

import { Button } from '../atoms';

interface Props {
  isEdited: boolean;
  editable: boolean;
  deleteLayer: () => void;
  pressSaveLayer: () => void;
}

export const LayerEditButton = (props: Props) => {
  const { isEdited, editable, deleteLayer, pressSaveLayer } = props;

  return (
    <View style={styles.buttonContainer}>
      <Button
        name={LAYEREDIT_BTN.DELETE}
        backgroundColor={isEdited || !editable ? COLOR.LIGHTBLUE : COLOR.BLUE}
        disabled={isEdited || !editable}
        onPress={deleteLayer}
      />
      <Button
        name={LAYEREDIT_BTN.SAVE}
        onPress={pressSaveLayer}
        backgroundColor={isEdited ? COLOR.BLUE : COLOR.LIGHTBLUE}
        disabled={!isEdited}
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
