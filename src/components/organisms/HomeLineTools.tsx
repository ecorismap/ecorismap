import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWLINETOOL, LINETOOL } from '../../constants/AppConstants';
import { DrawLineToolType, LineToolType, SelectionToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  isPositionRight: boolean;
  isEditing: boolean;
  isSelected: boolean;
  currentLineTool: LineToolType;
  currentDrawLineTool: DrawLineToolType;
  currentSelectionTool: SelectionToolType;
  openDisabled: boolean;
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
    currentDrawLineTool,
    currentSelectionTool,
    currentLineTool,
    openDisabled,
    selectLineTool,
    pressUndoEditLine,
    pressSaveEditLine,
    pressDeleteLine,
  } = props;

  return (
    <View style={isPositionRight ? styles.buttonContainerLandscape : styles.buttonContainer}>
      <View style={{ ...styles.button, width: undefined }}>
        <SelectionalLongPressButton
          openDisabled={openDisabled}
          selectedButton={currentDrawLineTool}
          directionRow={'row'}
          isPositionRight={isPositionRight}
        >
          <Button
            id={'DRAW'}
            name={DRAWLINETOOL.DRAW}
            backgroundColor={currentLineTool === 'DRAW' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('DRAW')}
          />
          <Button
            id={'AREA'}
            name={DRAWLINETOOL.AREA}
            backgroundColor={currentLineTool === 'AREA' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('AREA')}
          />
        </SelectionalLongPressButton>
      </View>

      <View style={{ ...styles.button, width: undefined }}>
        <SelectionalLongPressButton
          openDisabled={openDisabled}
          selectedButton={currentSelectionTool}
          directionRow={'row'}
          isPositionRight={isPositionRight}
        >
          <Button
            id={'INFO'}
            name={LINETOOL.INFO}
            backgroundColor={currentLineTool === 'INFO' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
            borderRadius={10}
            disabled={isEditing}
            onPressCustom={() => selectLineTool('INFO')}
          />
          <Button
            id={'SELECT'}
            name={LINETOOL.SELECT}
            backgroundColor={currentLineTool === 'SELECT' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
            borderRadius={10}
            disabled={isEditing}
            onPressCustom={() => selectLineTool('SELECT')}
          />
        </SelectionalLongPressButton>
      </View>
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
