import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWLINETOOL, FUNC_HISYOUTOOLS, LINETOOL } from '../../constants/AppConstants';
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
  pressDrawToolsSettings: () => void;
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
    pressDrawToolsSettings,
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
          <Button
            id={'SENKAI'}
            name={DRAWLINETOOL.SENKAI}
            backgroundColor={lineTool === 'SENKAI' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('SENKAI')}
          />
          <Button
            id={'SENJYOU'}
            name={DRAWLINETOOL.SENJYOU}
            backgroundColor={lineTool === 'SENJYOU' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('SENJYOU')}
          />
          <Button
            id={'KOUGEKI'}
            name={DRAWLINETOOL.KOUGEKI}
            backgroundColor={lineTool === 'KOUGEKI' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('KOUGEKI')}
          />
          <Button
            id={'DISPLAY'}
            name={DRAWLINETOOL.DISPLAY}
            backgroundColor={lineTool === 'DISPLAY' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('DISPLAY')}
          />
          <Button
            id={'HOVERING'}
            name={DRAWLINETOOL.HOVERING}
            backgroundColor={lineTool === 'HOVERING' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('HOVERING')}
          />
          <Button
            id={'KOUGEKI'}
            name={DRAWLINETOOL.KYUKOKA}
            backgroundColor={lineTool === 'KYUKOKA' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('KYUKOKA')}
          />
          <Button
            id={'KARI'}
            name={DRAWLINETOOL.KARI}
            backgroundColor={lineTool === 'KARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('KARI')}
          />
          <Button
            id={'TOMARI'}
            name={DRAWLINETOOL.TOMARI}
            backgroundColor={lineTool === 'TOMARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPressCustom={() => selectLineTool('TOMARI')}
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
      {FUNC_HISYOUTOOLS && (
        <View style={{ marginTop: 5, width: 36 }}>
          <Button
            name={LINETOOL.SETTING}
            backgroundColor={isEdited ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
            borderRadius={10}
            disabled={isEdited}
            onPress={pressDrawToolsSettings}
          />
        </View>
      )}
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
