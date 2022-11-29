import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWLINETOOL, LINETOOL } from '../../constants/AppConstants';
import { DrawLineToolType, LineToolType } from '../../types';

import { Button, SelectionalButton } from '../atoms';

interface Props {
  isEdited: boolean;
  isSelected: boolean;
  lineTool: LineToolType;
  drawLineTool: DrawLineToolType;
  openDisabled: boolean;
  selectLineTool: (value: LineToolType) => void;
  pressUndoEditLine: () => void;
  pressSaveEditLine: () => void;
  pressDeleteLine: () => void;
}

export const HomeLineTools = (props: Props) => {
  const {
    isEdited,
    isSelected,
    drawLineTool,
    lineTool,
    openDisabled,
    selectLineTool,
    pressUndoEditLine,
    pressSaveEditLine,
    pressDeleteLine,
  } = props;

  return (
    <View style={styles.buttonContainer}>
      <View style={{ marginTop: 5 }}>
        <SelectionalButton openDisabled={openDisabled} selectedButton={drawLineTool} directionRow={'row'}>
          <Button
            id={'DRAW'}
            name={DRAWLINETOOL.DRAW}
            backgroundColor={lineTool === 'DRAW' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('DRAW')}
          />
        </SelectionalButton>
      </View>
      <View style={{ marginTop: 5, width: 36 }}>
        <Button
          name={LINETOOL.SELECT}
          backgroundColor={lineTool === 'SELECT' ? COLOR.ALFARED : isEdited ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={isEdited}
          onPress={() => selectLineTool('SELECT')}
        />
      </View>
      <View style={{ marginTop: 5, width: 36 }}>
        <Button
          name={LINETOOL.MOVE}
          backgroundColor={
            !isSelected && !isEdited ? COLOR.ALFAGRAY : lineTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE
          }
          borderRadius={10}
          disabled={!isSelected && !isEdited}
          onPress={() => selectLineTool('MOVE')}
        />
      </View>
      <View style={{ marginTop: 5, width: 36 }}>
        <Button
          name={LINETOOL.SAVE}
          backgroundColor={isEdited ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEdited}
          onPress={pressSaveEditLine}
        />
      </View>
      <View style={{ marginTop: 5, width: 36 }}>
        <Button
          name={LINETOOL.UNDO}
          backgroundColor={isEdited ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEdited}
          onPress={pressUndoEditLine}
        />
      </View>
      <View style={{ marginTop: 5, width: 36 }}>
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
  buttonContainer: {
    elevation: 101,
    left: 9,
    marginHorizontal: 0,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 260 : 230,
    zIndex: 101,
  },
});
