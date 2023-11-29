import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, MAPMEMOTOOL } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { HomeContext } from '../../contexts/Home';
import { HomeMapMemoPenButton } from './HomeMapMemoPenButton';
import { HomeMapMemoEraserButton } from './HomeMapMemoEraserButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';

export const HomeMapMemoTools = () => {
  const {
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    selectMapMemoTool,
    setPen,
    setEraser,
    setVisibleMapMemoColor,
    pressUndoMapMemo,
    pressRedoMapMemo,
    togglePencilMode,
  } = useContext(HomeContext);

  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      marginTop: 2,
      width: 36,
    },
    buttonContainer: {
      elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: Platform.OS === 'ios' ? 360 : 330,
      // zIndex: 101,
    },

    selectionalButton: {
      alignSelf: 'flex-start',
      marginTop: 2,
    },
  });

  return (
    <View style={styles.buttonContainer}>
      <View style={styles.selectionalButton}>
        <HomeMapMemoPenButton
          isPositionRight={false}
          currentMapMemoTool={currentMapMemoTool}
          currentPen={currentPen}
          penColor={penColor}
          selectMapMemoTool={selectMapMemoTool}
          setPen={setPen}
        />
      </View>
      <View style={styles.selectionalButton}>
        <HomeMapMemoEraserButton
          isPositionRight={false}
          currentMapMemoTool={currentMapMemoTool}
          currentEraser={currentEraser}
          selectMapMemoTool={selectMapMemoTool}
          setEraser={setEraser}
        />
      </View>
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.COLOR}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => setVisibleMapMemoColor(true)}
        />
      </View>
      {Platform.OS === 'ios' && isTablet() && (
        <View style={styles.button}>
          <Button
            name={MAPMEMOTOOL.PENCIL_LOCK}
            backgroundColor={isPencilModeActive ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPress={togglePencilMode}
          />
        </View>
      )}
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.UNDO}
          backgroundColor={isUndoable ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isUndoable}
          onPress={pressUndoMapMemo}
        />
      </View>
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.REDO}
          backgroundColor={isRedoable ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isRedoable}
          onPress={pressRedoMapMemo}
        />
      </View>
    </View>
  );
};
