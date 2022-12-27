import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, LINETOOL, PLUGIN } from '../../constants/AppConstants';
import { HisyouToolButton } from '../../plugins/hisyoutool/HisyouToolButton';
import { LineToolType } from '../../types';

import { Button } from '../atoms';
import { DrawLineToolButton } from '../molecules/DrawLineToolButton';
import { SelectionToolButton } from '../molecules/SelectionToolButton';

interface Props {
  isPositionRight: boolean;
  isEditing: boolean;
  isSelected: boolean;
  currentLineTool: LineToolType;
  selectLineTool: (value: LineToolType) => void;
  pressUndoEditLine: () => void;
  pressSaveEditLine: () => void;
  pressDeleteLine: () => void;
}

export const HomeLineTools = (props: Props) => {
  const {
    isPositionRight,
    isEditing,
    isSelected,
    currentLineTool,
    selectLineTool,
    pressUndoEditLine,
    pressSaveEditLine,
    pressDeleteLine,
  } = props;

  return (
    <View style={isPositionRight ? styles.buttonContainerLandscape : styles.buttonContainer}>
      <DrawLineToolButton
        isPositionRight={isPositionRight}
        currentLineTool={currentLineTool}
        selectLineTool={selectLineTool}
      />
      {PLUGIN.HISYOUTOOL && (
        <HisyouToolButton
          isPositionRight={isPositionRight}
          currentLineTool={currentLineTool}
          selectLineTool={selectLineTool}
        />
      )}
      <SelectionToolButton
        disabled={isEditing}
        isPositionRight={isPositionRight}
        currentLineTool={currentLineTool}
        selectLineTool={selectLineTool}
      />
      <View style={isPositionRight ? styles.buttonLandscape : styles.button}>
        <Button
          name={LINETOOL.MOVE}
          backgroundColor={currentLineTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={false}
          onPress={() => selectLineTool('MOVE')}
        />
      </View>
      <View style={isPositionRight ? styles.buttonLandscape : styles.button}>
        <Button
          name={LINETOOL.SAVE}
          backgroundColor={isEditing ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditing}
          onPress={pressSaveEditLine}
        />
      </View>
      <View style={isPositionRight ? styles.buttonLandscape : styles.button}>
        <Button
          name={LINETOOL.UNDO}
          backgroundColor={isEditing ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditing}
          onPress={pressUndoEditLine}
        />
      </View>
      <View style={isPositionRight ? styles.buttonLandscape : styles.button}>
        <Button
          name={LINETOOL.DELETE}
          backgroundColor={isSelected ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isSelected}
          onPress={pressDeleteLine}
        />
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    marginTop: 5,
    width: 36,
  },
  buttonContainer: {
    elevation: 101,
    left: 9,
    marginHorizontal: 0,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 260 : 230,
    zIndex: 101,
  },
  buttonContainerLandscape: {
    elevation: 101,
    marginHorizontal: 0,
    position: 'absolute',
    right: 10,
    top: Platform.OS === 'ios' ? 40 : 10,
    zIndex: 101,
  },
  buttonLandscape: {
    alignSelf: 'flex-end',
    marginTop: 5,
    width: 36,
  },
});
