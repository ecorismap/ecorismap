import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, LINETOOL, PLUGIN } from '../../constants/AppConstants';
import { HisyouToolButton } from '../../plugins/hisyoutool/HisyouToolButton';
import { useHisyouToolSetting } from '../../plugins/hisyoutool/useHisyouToolSetting';
import { LineToolType } from '../../types';

import { Button } from '../atoms';
import { DrawToolButton } from '../molecules/DrawToolButton';
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
    isSelected,
    isEditing,
    currentLineTool,
    selectLineTool,
    pressUndoEditLine,
    pressSaveEditLine,
    pressDeleteLine,
  } = props;
  const { isHisyouToolActive } = useHisyouToolSetting();
  return (
    <View style={isPositionRight ? styles.buttonContainerRight : styles.buttonContainer}>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <DrawToolButton
          disabled={isHisyouToolActive}
          isPositionRight={isPositionRight}
          currentLineTool={currentLineTool}
          selectLineTool={selectLineTool}
        />
      </View>
      {PLUGIN.HISYOUTOOL && (
        <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
          <HisyouToolButton
            isEditing={isEditing}
            isSelected={isSelected}
            isPositionRight={isPositionRight}
            currentLineTool={currentLineTool}
            selectLineTool={selectLineTool}
          />
        </View>
      )}
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <SelectionToolButton
          isEditing={isEditing}
          isPositionRight={isPositionRight}
          currentLineTool={currentLineTool}
          selectLineTool={selectLineTool}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={LINETOOL.MOVE}
          backgroundColor={currentLineTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={false}
          onPress={() => selectLineTool('MOVE')}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={LINETOOL.SAVE}
          backgroundColor={isEditing ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditing}
          onPress={pressSaveEditLine}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={LINETOOL.UNDO}
          backgroundColor={isEditing ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditing}
          onPress={pressUndoEditLine}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={LINETOOL.DELETE}
          backgroundColor={isEditing || isSelected ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!(isEditing || isSelected)}
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
  buttonContainerRight: {
    elevation: 101,
    marginHorizontal: 0,
    position: 'absolute',
    right: 10,
    top: Platform.OS === 'ios' ? 40 : 10,
    zIndex: 101,
  },
  buttonRight: {
    alignSelf: 'flex-end',
    marginTop: 5,
    width: 36,
  },
  selectionalButton: {
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  selectionalButtonRight: {
    alignSelf: 'flex-end',
    marginTop: 5,
  },
});
